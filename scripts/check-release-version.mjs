import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export function checkReleaseVersions({ rootManifest, packageManifests, tag }) {
  const problems = []
  const rootVersion = rootManifest.manifest.version

  if (rootManifest.manifest.private !== true)
    problems.push(`${rootManifest.path} must set "private": true so the repository root cannot be published.`)

  if (typeof rootVersion !== 'string' || rootVersion.length === 0)
    problems.push(`${rootManifest.path} must define a non-empty string "version".`)

  const publicPackageManifests = packageManifests.filter(({ manifest }) => manifest.private !== true)

  if (publicPackageManifests.length === 0)
    problems.push('No public package manifests were found under packages/*/package.json.')

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

  return {
    publicPackageCount: publicPackageManifests.length,
    version: rootVersion,
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

async function main() {
  try {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const manifests = await readReleaseManifests(repositoryRoot)
    const result = checkReleaseVersions({
      ...manifests,
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
