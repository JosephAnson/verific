import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { checkReleaseVersions, readReleaseManifests } from './check-release-version.mjs'

const rootManifest = {
  manifest: {
    name: 'verific',
    private: true,
    version: '0.2.0',
  },
  path: 'package.json',
}

const packageManifests = [
  {
    manifest: {
      name: '@verific/core',
      version: '0.2.0',
    },
    path: 'packages/core/package.json',
  },
  {
    manifest: {
      name: '@verific/private-fixture',
      private: true,
      version: '9.9.9',
    },
    path: 'packages/private-fixture/package.json',
  },
]

describe('checkReleaseVersions', () => {
  it('accepts coordinated public package and tag versions', () => {
    expect(checkReleaseVersions({
      packageManifests,
      rootManifest,
      tag: 'v0.2.0',
    })).toEqual({
      publicPackageCount: 1,
      version: '0.2.0',
    })
  })

  it('ignores private package versions', () => {
    expect(checkReleaseVersions({ packageManifests, rootManifest })).toEqual({
      publicPackageCount: 1,
      version: '0.2.0',
    })
  })

  it('rejects public package version drift with the manifest path', () => {
    const driftedPackages = packageManifests.map(packageManifest => packageManifest.manifest.private
      ? packageManifest
      : {
          ...packageManifest,
          manifest: { ...packageManifest.manifest, version: '0.2.1' },
        })

    expect(() => checkReleaseVersions({
      packageManifests: driftedPackages,
      rootManifest,
    })).toThrowError(
      'packages/core/package.json has version "0.2.1"; expected "0.2.0" to match package.json.',
    )
  })

  it('rejects a tag that is not the exact version tag', () => {
    expect(() => checkReleaseVersions({
      packageManifests,
      rootManifest,
      tag: '0.2.0',
    })).toThrowError(
      'Git tag "0.2.0" does not match version "0.2.0"; expected "v0.2.0".',
    )
  })
})

describe('release manifests', () => {
  it('discovers every public package with coordinated release metadata', async () => {
    const repositoryRoot = process.cwd()
    const manifests = await readReleaseManifests(repositoryRoot)
    const publicPackageManifests = manifests.packageManifests.filter(({ manifest }) => manifest.private !== true)

    expect(publicPackageManifests.map(({ manifest }) => manifest.name)).toEqual([
      '@verific/core',
      '@verific/i18n',
      '@verific/i18next',
      '@verific/nuxt',
      '@verific/paraglide',
      '@verific/vue-i18n',
    ])
    expect(checkReleaseVersions(manifests)).toEqual({
      publicPackageCount: 6,
      version: manifests.rootManifest.manifest.version,
    })

    for (const { manifest } of [manifests.rootManifest, ...publicPackageManifests]) {
      expect(manifest.repository?.url).toBe('git+https://github.com/JosephAnson/verific.git')
    }

    expect(manifests.rootManifest.manifest.devDependencies.changelogen).toBeUndefined()
    expect(manifests.rootManifest.manifest.scripts.release).toBeTypeOf('string')
    expect(manifests.rootManifest.manifest.scripts['publish:ci']).toMatch(/^pnpm release:check &&/)
    expect(manifests.rootManifest.manifest.scripts['release:check']).toBe('node scripts/check-release-version.mjs')
    for (const { manifest } of publicPackageManifests)
      expect(manifest.scripts?.release).toBeUndefined()
  })
})
