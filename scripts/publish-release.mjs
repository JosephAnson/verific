import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  checkReleaseVersions,
  expectedPublicPackageNames,
  npmRegistry,
  readReleaseManifests,
  releasePackages,
} from './check-release-version.mjs'

export { npmRegistry }

export async function publishRelease({
  repositoryRoot,
  inspectCandidate = () => inspectReleaseCandidate(repositoryRoot),
  inspectIdentity = options => inspectReleaseIdentity(repositoryRoot, options),
  inspectPublished,
  prepareArtifacts,
  runCommand = execFileSync,
}) {
  const inspectRegistry = inspectPublished
    ?? (version => readPublishedPackages({ repositoryRoot, runCommand, version }))
  const packArtifacts = prepareArtifacts
    ?? (version => packReleaseArtifacts({ repositoryRoot, runCommand, version }))

  const candidate = await inspectCandidate()
  let publishedPackages = await inspectRegistry(candidate.version)
  const mode = publishedPackages.size > 0 ? 'retry' : 'initial'
  const expectedIdentity = await inspectIdentity({ mode })
  assertSameCandidate(candidate, expectedIdentity)

  run(runCommand, repositoryRoot, 'npm', ['whoami', '--registry', npmRegistry])
  run(runCommand, repositoryRoot, 'pnpm', ['check'])

  let confirmedIdentity = await inspectIdentity({ mode })
  assertSameIdentity(expectedIdentity, confirmedIdentity)

  const prepared = await packArtifacts(candidate.version)
  try {
    confirmedIdentity = await inspectIdentity({ mode })
    assertSameIdentity(expectedIdentity, confirmedIdentity)

    publishedPackages = await inspectRegistry(candidate.version)
    if (mode === 'retry' && publishedPackages.size === 0) {
      throw new Error(
        `Partial-release retry evidence for version "${candidate.version}" disappeared during the quality gate. No package was published.`,
      )
    }

    assertPublishedIntegrities(publishedPackages, prepared.artifacts, candidate.version)
    confirmedIdentity = await inspectIdentity({ mode })
    assertSameIdentity(expectedIdentity, confirmedIdentity)

    for (const artifact of prepared.artifacts) {
      if (publishedPackages.has(artifact.name))
        continue

      const publishArguments = [
        'publish',
        artifact.filename,
        '--access',
        'public',
        '--registry',
        npmRegistry,
      ]

      if (mode === 'retry')
        publishArguments.push('--no-git-checks')
      else
        publishArguments.push('--publish-branch', 'main')

      run(runCommand, repositoryRoot, 'pnpm', publishArguments)
    }

    publishedPackages = await inspectRegistry(candidate.version)
    assertCompleteRelease(publishedPackages, candidate.version)
    assertPublishedIntegrities(publishedPackages, prepared.artifacts, candidate.version)

    return {
      packageCount: expectedPublicPackageNames.length,
      version: candidate.version,
    }
  }
  finally {
    await prepared.cleanup()
  }
}

export function readPublishedPackages({
  repositoryRoot,
  version,
  runCommand = execFileSync,
}) {
  const publishedPackages = new Map()

  for (const packageName of expectedPublicPackageNames) {
    try {
      const output = runCommand('npm', [
        'view',
        `${packageName}@${version}`,
        'version',
        'dist.integrity',
        '--json',
        '--registry',
        npmRegistry,
      ], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const metadata = JSON.parse(String(output))

      if (!isRecord(metadata) || metadata.version !== version) {
        throw new Error(
          `npm returned version ${JSON.stringify(metadata?.version)} for ${packageName}@${version}.`,
        )
      }

      if (typeof metadata['dist.integrity'] !== 'string' || !metadata['dist.integrity'].startsWith('sha512-')) {
        throw new Error(`npm returned no SHA-512 integrity for ${packageName}@${version}.`)
      }

      publishedPackages.set(packageName, {
        integrity: metadata['dist.integrity'],
        name: packageName,
      })
    }
    catch (error) {
      if (isNpmNotFound(error))
        continue
      throw new Error(`Could not verify ${packageName}@${version} on npm: ${formatError(error)}`, { cause: error })
    }
  }

  return publishedPackages
}

export async function packReleaseArtifacts({
  repositoryRoot,
  version,
  runCommand = execFileSync,
}) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'verific-release-'))

  try {
    const artifacts = []
    for (const { manifestPath, name: packageName } of releasePackages) {
      const packageDirectory = join(repositoryRoot, dirname(manifestPath))
      const output = runCommand('pnpm', [
        '--dir',
        packageDirectory,
        'pack',
        '--json',
        '--pack-destination',
        temporaryDirectory,
      ], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      const metadata = parsePackMetadata(output)
      const filename = resolve(metadata.filename)
      const relativeFilename = relative(temporaryDirectory, filename)

      if (metadata.name !== packageName || metadata.version !== version) {
        throw new Error(
          `Packed artifact identity mismatch: expected ${packageName}@${version}, received ${JSON.stringify(metadata.name)}@${JSON.stringify(metadata.version)}.`,
        )
      }

      if (relativeFilename.startsWith('..') || isAbsolute(relativeFilename))
        throw new Error(`Packed artifact for ${packageName}@${version} escaped its temporary directory.`)

      const tarball = await readFile(filename)
      artifacts.push({
        filename,
        integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
        name: packageName,
      })
    }

    return {
      artifacts,
      cleanup: () => rm(temporaryDirectory, { force: true, recursive: true }),
    }
  }
  catch (error) {
    await rm(temporaryDirectory, { force: true, recursive: true })
    throw error
  }
}

async function inspectReleaseCandidate(repositoryRoot) {
  return checkReleaseVersions(await readReleaseManifests(repositoryRoot))
}

async function inspectReleaseIdentity(repositoryRoot, { mode }) {
  if (mode !== 'initial' && mode !== 'retry')
    throw new Error(`Unknown manual publication mode: ${JSON.stringify(mode)}.`)

  return checkReleaseVersions({
    ...await readReleaseManifests(repositoryRoot),
    allowMainDescendant: mode === 'retry',
    publish: true,
  })
}

function assertSameCandidate(candidate, identity) {
  for (const field of ['tag', 'version']) {
    if (identity[field] !== candidate[field])
      throw identityChangeError(field, candidate[field], identity[field])
  }
}

function assertSameIdentity(expected, actual) {
  for (const field of ['commit', 'tag', 'version']) {
    if (actual[field] !== expected[field])
      throw identityChangeError(field, expected[field], actual[field])
  }
}

function assertCompleteRelease(publishedPackages, version) {
  const missingPackageNames = expectedPublicPackageNames.filter(
    packageName => !publishedPackages.has(packageName),
  )

  if (missingPackageNames.length > 0) {
    throw new Error(
      `Manual publication is incomplete at version "${version}": ${missingPackageNames.join(', ')} ${missingPackageNames.length === 1 ? 'is' : 'are'} missing from npm.`,
    )
  }
}

function assertPublishedIntegrities(publishedPackages, artifacts, version) {
  const artifactsByName = new Map(artifacts.map(artifact => [artifact.name, artifact]))

  for (const [packageName, publishedPackage] of publishedPackages) {
    const artifact = artifactsByName.get(packageName)
    if (!artifact)
      throw new Error(`No local artifact was prepared for ${packageName}@${version}.`)

    if (publishedPackage.integrity !== artifact.integrity) {
      throw new Error(
        `${packageName}@${version} on npm does not match the artifact packed from the guarded release commit. Use a new coordinated version; do not publish the remaining packages.`,
      )
    }
  }
}

function identityChangeError(field, before, after) {
  return new Error(
    `The release identity changed during publication checks: ${field} was ${JSON.stringify(before)} and is now ${JSON.stringify(after)}.`,
  )
}

function parsePackMetadata(output) {
  const parsed = JSON.parse(String(output))
  const metadata = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed

  if (!isRecord(metadata) || typeof metadata.filename !== 'string')
    throw new Error('pnpm pack returned invalid artifact metadata.')

  return metadata
}

function isNpmNotFound(error) {
  if (!error || typeof error !== 'object')
    return false

  return /\bE404\b/.test(`${'stderr' in error ? error.stderr : ''}\n${error.message ?? ''}`)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function formatError(error) {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = String(error.stderr).trim()
    if (stderr.length > 0)
      return stderr
  }

  return error instanceof Error ? error.message : String(error)
}

function run(runCommand, cwd, command, args) {
  runCommand(command, args, { cwd, stdio: 'inherit' })
}

async function main() {
  try {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const result = await publishRelease({ repositoryRoot })
    console.log(
      `Manual publication complete: ${result.packageCount} packages are available at version "${result.version}" with the guarded artifact integrity.`,
    )
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
