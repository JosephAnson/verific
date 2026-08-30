import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const stableVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/

export function checkReleaseVersions({
  rootManifest,
  packageManifests,
  publish = false,
  refType,
  tag,
  checkMainAncestry = isHeadOnOriginMain,
}) {
  const problems = []
  const rootVersion = rootManifest.manifest.version

  if (rootManifest.manifest.private !== true)
    problems.push(`${rootManifest.path} must set "private": true so the repository root cannot be published.`)

  if (!isStableVersion(rootVersion))
    problems.push(stableVersionProblem(rootManifest.path, rootVersion))

  const publicPackageManifests = packageManifests.filter(({ manifest }) => manifest.private !== true)

  if (publicPackageManifests.length === 0)
    problems.push('No public package manifests were found under packages/*/package.json.')

  for (const packageManifest of publicPackageManifests) {
    if (!isStableVersion(packageManifest.manifest.version))
      problems.push(stableVersionProblem(packageManifest.path, packageManifest.manifest.version))
  }

  if (publish) {
    if (typeof tag !== 'string' || tag.length === 0)
      problems.push('GITHUB_REF_NAME must be set in publish mode.')

    if (refType !== 'tag') {
      problems.push(
        `GITHUB_REF_TYPE must be "tag" in publish mode; received ${formatValue(refType)}.`,
      )
    }
  }

  if (typeof rootVersion === 'string' && rootVersion.length > 0) {
    for (const packageManifest of publicPackageManifests) {
      if (packageManifest.manifest.version !== rootVersion) {
        problems.push(
          `${packageManifest.path} has version ${formatValue(packageManifest.manifest.version)}; expected "${rootVersion}" to match ${rootManifest.path}.`,
        )
      }
    }

    if (tag !== undefined && tag !== `v${rootVersion}`) {
      problems.push(
        `Git tag ${formatValue(tag)} does not match version "${rootVersion}"; expected "v${rootVersion}". Update every release manifest together or push the matching tag.`,
      )
    }
  }

  if (problems.length > 0)
    throw new Error(`Release version check failed:\n${problems.map(problem => `- ${problem}`).join('\n')}`)

  if (publish) {
    let isOnMain
    try {
      isOnMain = checkMainAncestry()
    }
    catch (error) {
      throw new Error(
        `Release version check failed:\n- Could not verify that HEAD is an ancestor of origin/main: ${formatError(error)}`,
        { cause: error },
      )
    }

    if (isOnMain !== true) {
      throw new Error(
        'Release version check failed:\n- HEAD must be an ancestor of origin/main in publish mode. Fetch complete origin/main history and publish only a tag created from reviewed main history.',
      )
    }
  }

  return {
    publicPackageCount: publicPackageManifests.length,
    version: rootVersion,
  }
}

export function isHeadOnOriginMain(runGit = execFileSync) {
  try {
    runGit('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], {
      stdio: 'pipe',
    })
    return true
  }
  catch (error) {
    if (error && typeof error === 'object' && error.status === 1)
      return false

    throw new Error(
      `git merge-base --is-ancestor HEAD origin/main failed unexpectedly: ${formatGitError(error)}`,
      { cause: error },
    )
  }
}

export async function readReleaseManifests(repositoryRoot) {
  const rootManifestPath = join(repositoryRoot, 'package.json')
  const packagesDirectory = join(repositoryRoot, 'packages')
  const entries = await readdir(packagesDirectory, { withFileTypes: true })
  const packageManifests = await Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(entry => readOptionalManifest(repositoryRoot, join(packagesDirectory, entry.name, 'package.json'))),
  )

  return {
    packageManifests: packageManifests.filter(manifest => manifest !== undefined),
    rootManifest: await readManifest(repositoryRoot, rootManifestPath),
  }
}

async function readOptionalManifest(repositoryRoot, manifestPath) {
  try {
    return await readManifest(repositoryRoot, manifestPath)
  }
  catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT')
      return undefined
    throw error
  }
}

async function readManifest(repositoryRoot, manifestPath) {
  return {
    manifest: JSON.parse(await readFile(manifestPath, 'utf8')),
    path: relative(repositoryRoot, manifestPath),
  }
}

function formatValue(value) {
  return JSON.stringify(value) ?? String(value)
}

function formatError(error) {
  return error instanceof Error ? error.message : formatValue(error)
}

function formatGitError(error) {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = String(error.stderr).trim()
    if (stderr.length > 0)
      return stderr
  }

  return formatError(error)
}

function isStableVersion(version) {
  return typeof version === 'string' && stableVersionPattern.test(version)
}

function stableVersionProblem(path, version) {
  return `${path} must use a stable x.y.z version without prerelease, build metadata or leading zeroes; received ${formatValue(version)}.`
}

async function main() {
  try {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const manifests = await readReleaseManifests(repositoryRoot)
    const result = checkReleaseVersions({
      ...manifests,
      publish: process.argv.includes('--publish'),
      refType: process.env.GITHUB_REF_TYPE,
      tag: process.env.GITHUB_REF_NAME,
    })
    const tagSummary = process.env.GITHUB_REF_NAME === undefined
      ? ''
      : ` and tag "${process.env.GITHUB_REF_NAME}" matches`

    console.log(
      `Release version check passed: ${result.publicPackageCount} public packages use version "${result.version}"${tagSummary}.`,
    )
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
