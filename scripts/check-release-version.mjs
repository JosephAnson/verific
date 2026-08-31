import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const stableVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/

export const npmRegistry = 'https://registry.npmjs.org/'

export const releasePackages = [
  { manifestPath: 'packages/core/package.json', name: '@verific/core' },
  { manifestPath: 'packages/i18n/package.json', name: '@verific/i18n' },
  { manifestPath: 'packages/i18next/package.json', name: '@verific/i18next' },
  { manifestPath: 'packages/nuxt/package.json', name: '@verific/nuxt' },
  { manifestPath: 'packages/paraglide/package.json', name: '@verific/paraglide' },
  { manifestPath: 'packages/vue-i18n/package.json', name: '@verific/vue-i18n' },
]

export const expectedPublicPackageNames = releasePackages.map(({ name }) => name)

export function checkReleaseVersions({
  rootManifest,
  packageManifests,
  publish = false,
  allowMainDescendant = false,
  readGitState = readReleaseGitState,
}) {
  const problems = []
  let releaseCommit
  const rootVersion = rootManifest.manifest.version

  if (rootManifest.manifest.private !== true)
    problems.push(`${rootManifest.path} must set "private": true so the repository root cannot be published.`)

  if (!isStableVersion(rootVersion))
    problems.push(stableVersionProblem(rootManifest.path, rootVersion))

  const publicPackageManifests = packageManifests.filter(({ manifest }) => manifest.private !== true)
  const actualPackageNames = publicPackageManifests
    .map(({ manifest }) => manifest.name)
    .sort((left, right) => String(left).localeCompare(String(right)))

  if (!sameValues(actualPackageNames, expectedPublicPackageNames)) {
    problems.push(
      `Public package set must be exactly ${expectedPublicPackageNames.join(', ')}; received ${actualPackageNames.map(formatValue).join(', ') || 'none'}.`,
    )
  }

  for (const packageManifest of publicPackageManifests) {
    if (!isStableVersion(packageManifest.manifest.version))
      problems.push(stableVersionProblem(packageManifest.path, packageManifest.manifest.version))

    if (typeof rootVersion === 'string' && packageManifest.manifest.version !== rootVersion) {
      problems.push(
        `${packageManifest.path} has version ${formatValue(packageManifest.manifest.version)}; expected "${rootVersion}" to match ${rootManifest.path}.`,
      )
    }

    if (packageManifest.manifest.publishConfig?.access !== 'public') {
      problems.push(
        `${packageManifest.path} must set publishConfig.access to "public".`,
      )
    }

    if (packageManifest.manifest.publishConfig?.registry !== npmRegistry) {
      problems.push(
        `${packageManifest.path} must set publishConfig.registry to "${npmRegistry}".`,
      )
    }
  }

  if (problems.length > 0)
    throw releaseCheckError(problems)

  const tag = `v${rootVersion}`
  if (publish) {
    let gitState
    try {
      gitState = readGitState(tag)
    }
    catch (error) {
      throw releaseCheckError([
        `Could not inspect the manual release Git identity: ${formatError(error)}`,
      ], error)
    }

    const gitProblems = checkReleaseGitState({ allowMainDescendant, ...gitState, tag })
    if (gitProblems.length > 0)
      throw releaseCheckError(gitProblems)

    releaseCommit = gitState.head
  }

  return {
    ...(releaseCommit === undefined ? {} : { commit: releaseCommit }),
    publicPackageCount: publicPackageManifests.length,
    tag,
    version: rootVersion,
  }
}

export function checkReleaseGitState({
  allowMainDescendant = false,
  branch,
  head,
  headIsOnOriginMain,
  localTagCommit,
  originUrl,
  originMainCommit,
  remoteMainCommit,
  remoteTagCommit,
  status,
  tag,
}) {
  const problems = []

  if (status !== '')
    problems.push('The working tree must be clean, including untracked files, in publish mode.')

  if (!head)
    problems.push('Could not resolve HEAD in publish mode.')

  if (!isCanonicalOriginUrl(originUrl)) {
    problems.push(
      `Origin must be the canonical JosephAnson/verific GitHub repository in publish mode; received ${formatValue(originUrl)}.`,
    )
  }

  if (originMainCommit !== remoteMainCommit) {
    problems.push(
      'The fetched origin/main ref must match the live origin main branch in publish mode. Run "git fetch origin main --tags" before publishing.',
    )
  }

  if (allowMainDescendant) {
    if (branch !== 'main' && branch !== '') {
      problems.push(
        `A partial-release retry must run from "main" or detached HEAD; received ${formatValue(branch)}.`,
      )
    }

    if (headIsOnOriginMain !== true)
      problems.push('The immutable release commit must remain in current origin/main history during a partial-release retry.')
  }
  else {
    if (branch !== 'main')
      problems.push(`The current branch must be "main" in publish mode; received ${formatValue(branch)}.`)

    if (originMainCommit !== head)
      problems.push('HEAD must exactly match current origin/main for an initial publication.')
  }

  if (localTagCommit !== head)
    problems.push(`Local tag "${tag}" must point to HEAD in publish mode.`)

  if (remoteTagCommit !== head)
    problems.push(`Remote tag "${tag}" must point to HEAD in publish mode.`)

  return problems
}

export function readReleaseGitState(tag, runGit = execFileSync) {
  const run = args => runGit('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

  const head = run(['rev-parse', 'HEAD'])
  const remoteRefs = parseRemoteRefs(run([
    'ls-remote',
    'origin',
    'refs/heads/main',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]))

  return {
    branch: run(['branch', '--show-current']),
    head,
    headIsOnOriginMain: isHeadOnOriginMain(runGit),
    localTagCommit: readOptionalGitOutput(
      runGit,
      ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`],
    ),
    originUrl: run(['remote', 'get-url', 'origin']),
    originMainCommit: run(['rev-parse', 'origin/main']),
    remoteMainCommit: remoteRefs.get('refs/heads/main'),
    remoteTagCommit: remoteRefs.get(`refs/tags/${tag}^{}`) ?? remoteRefs.get(`refs/tags/${tag}`),
    status: run(['status', '--porcelain=v1', '--untracked-files=all']),
  }
}

export function isCanonicalOriginUrl(url) {
  return typeof url === 'string' && /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)JosephAnson\/verific(?:\.git)?\/?$/i.test(url)
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

function parseRemoteRefs(output) {
  return new Map(output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [commit, ref] = line.split(/\s+/, 2)
      return [ref, commit]
    }))
}

function readOptionalGitOutput(runGit, args) {
  try {
    return runGit('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }
  catch (error) {
    if (error && typeof error === 'object' && (error.status === 1 || error.status === 128))
      return undefined
    throw error
  }
}

function isHeadOnOriginMain(runGit) {
  try {
    runGit('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  }
  catch (error) {
    if (error && typeof error === 'object' && error.status === 1)
      return false
    throw error
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

function releaseCheckError(problems, cause) {
  return new Error(
    `Release version check failed:\n${problems.map(problem => `- ${problem}`).join('\n')}`,
    cause === undefined ? undefined : { cause },
  )
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function formatValue(value) {
  return JSON.stringify(value) ?? String(value)
}

function formatError(error) {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = String(error.stderr).trim()
    if (stderr.length > 0)
      return stderr
  }

  return error instanceof Error ? error.message : formatValue(error)
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
    const publish = process.argv.includes('--publish')
    const manifests = await readReleaseManifests(repositoryRoot)
    const result = checkReleaseVersions({ ...manifests, publish })
    const identitySummary = publish
      ? ` and tag "${result.tag}" identifies current remote main`
      : ''

    console.log(
      `Release version check passed: ${result.publicPackageCount} public packages use version "${result.version}"${identitySummary}.`,
    )
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
