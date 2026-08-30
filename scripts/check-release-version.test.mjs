import { Buffer } from 'node:buffer'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import {
  checkReleaseVersions,
  isHeadOnOriginMain,
  readReleaseManifests,
} from './check-release-version.mjs'

const releaseVersion = '0.3.0'

const rootManifest = {
  manifest: {
    name: 'verific',
    private: true,
    version: releaseVersion,
  },
  path: 'package.json',
}

const packageManifests = [
  {
    manifest: {
      name: '@verific/core',
      version: releaseVersion,
    },
    path: 'packages/core/package.json',
  },
  {
    manifest: {
      name: '@verific/private-fixture',
      private: true,
      version: '9.9.9-beta.1',
    },
    path: 'packages/private-fixture/package.json',
  },
]

describe('checkReleaseVersions', () => {
  it('accepts coordinated stable package and tag versions from main in publish mode', () => {
    const checkMainAncestry = vi.fn(() => true)

    expect(checkReleaseVersions({
      checkMainAncestry,
      packageManifests,
      publish: true,
      refType: 'tag',
      rootManifest,
      tag: `v${releaseVersion}`,
    })).toEqual({
      publicPackageCount: 1,
      version: releaseVersion,
    })
    expect(checkMainAncestry).toHaveBeenCalledOnce()
  })

  it('ignores private package versions', () => {
    expect(checkReleaseVersions({ packageManifests, rootManifest })).toEqual({
      publicPackageCount: 1,
      version: releaseVersion,
    })
  })

  it.each([
    '0.3.0-beta.1',
    '0.3.0+build.1',
    '01.3.0',
    '0.03.0',
    '0.3.00',
    'v0.3.0',
    '0.3',
    ' 0.3.0',
  ])('rejects the unstable or non-core version %s', (version) => {
    const coordinatedPackages = packageManifests.map(packageManifest => packageManifest.manifest.private
      ? packageManifest
      : {
          ...packageManifest,
          manifest: { ...packageManifest.manifest, version },
        })

    expect(() => checkReleaseVersions({
      packageManifests: coordinatedPackages,
      rootManifest: {
        ...rootManifest,
        manifest: { ...rootManifest.manifest, version },
      },
    })).toThrowError(
      `package.json must use a stable x.y.z version without prerelease, build metadata or leading zeroes; received "${version}".`,
    )
  })

  it('rejects an unstable public package even when the root is stable', () => {
    const prereleasePackages = packageManifests.map(packageManifest => packageManifest.manifest.private
      ? packageManifest
      : {
          ...packageManifest,
          manifest: { ...packageManifest.manifest, version: '0.3.0-beta.1' },
        })

    expect(() => checkReleaseVersions({
      packageManifests: prereleasePackages,
      rootManifest,
    })).toThrowError(
      'packages/core/package.json must use a stable x.y.z version without prerelease, build metadata or leading zeroes; received "0.3.0-beta.1".',
    )
  })

  it('rejects public package version drift with the manifest path', () => {
    const driftedPackages = packageManifests.map(packageManifest => packageManifest.manifest.private
      ? packageManifest
      : {
          ...packageManifest,
          manifest: { ...packageManifest.manifest, version: '0.3.1' },
        })

    expect(() => checkReleaseVersions({
      packageManifests: driftedPackages,
      rootManifest,
    })).toThrowError(
      'packages/core/package.json has version "0.3.1"; expected "0.3.0" to match package.json.',
    )
  })

  it('rejects a tag that is not the exact version tag', () => {
    expect(() => checkReleaseVersions({
      packageManifests,
      rootManifest,
      tag: releaseVersion,
    })).toThrowError(
      'Git tag "0.3.0" does not match version "0.3.0"; expected "v0.3.0".',
    )
  })

  it('rejects publish mode without a ref name before checking ancestry', () => {
    const checkMainAncestry = vi.fn(() => true)

    expect(() => checkReleaseVersions({
      checkMainAncestry,
      packageManifests,
      publish: true,
      refType: 'tag',
      rootManifest,
    })).toThrowError('GITHUB_REF_NAME must be set in publish mode.')
    expect(checkMainAncestry).not.toHaveBeenCalled()
  })

  it('rejects a matching branch before checking ancestry', () => {
    const checkMainAncestry = vi.fn(() => true)

    expect(() => checkReleaseVersions({
      checkMainAncestry,
      packageManifests,
      publish: true,
      refType: 'branch',
      rootManifest,
      tag: `v${releaseVersion}`,
    })).toThrowError('GITHUB_REF_TYPE must be "tag" in publish mode; received "branch".')
    expect(checkMainAncestry).not.toHaveBeenCalled()
  })

  it('does not check ancestry outside publish mode', () => {
    const checkMainAncestry = vi.fn(() => true)

    checkReleaseVersions({ checkMainAncestry, packageManifests, rootManifest })

    expect(checkMainAncestry).not.toHaveBeenCalled()
  })

  it('does not check ancestry when a manifest version is invalid', () => {
    const checkMainAncestry = vi.fn(() => true)

    expect(() => checkReleaseVersions({
      checkMainAncestry,
      packageManifests,
      publish: true,
      refType: 'tag',
      rootManifest: {
        ...rootManifest,
        manifest: { ...rootManifest.manifest, version: '0.3.0-beta.1' },
      },
      tag: 'v0.3.0-beta.1',
    })).toThrowError('package.json must use a stable x.y.z version')
    expect(checkMainAncestry).not.toHaveBeenCalled()
  })

  it('rejects a tag commit outside origin/main', () => {
    expect(() => checkReleaseVersions({
      checkMainAncestry: () => false,
      packageManifests,
      publish: true,
      refType: 'tag',
      rootManifest,
      tag: `v${releaseVersion}`,
    })).toThrowError('HEAD must be an ancestor of origin/main in publish mode.')
  })

  it('fails closed when the ancestry predicate throws unexpectedly', () => {
    expect(() => checkReleaseVersions({
      checkMainAncestry: () => {
        throw new Error('broken Git fixture')
      },
      packageManifests,
      publish: true,
      refType: 'tag',
      rootManifest,
      tag: `v${releaseVersion}`,
    })).toThrowError(
      'Could not verify that HEAD is an ancestor of origin/main: broken Git fixture',
    )
  })
})

describe('isHeadOnOriginMain', () => {
  it('runs the local Git ancestry predicate without a shell or fetch', () => {
    const runGit = vi.fn()

    expect(isHeadOnOriginMain(runGit)).toBe(true)
    expect(runGit).toHaveBeenCalledWith(
      'git',
      ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'],
      { stdio: 'pipe' },
    )
  })

  it('returns false only for the expected non-ancestor exit status', () => {
    const runGit = vi.fn(() => {
      throw Object.assign(new Error('not an ancestor'), { status: 1 })
    })

    expect(isHeadOnOriginMain(runGit)).toBe(false)
  })

  it('fails clearly for unexpected Git errors', () => {
    const runGit = vi.fn(() => {
      throw Object.assign(new Error('Git failed'), {
        status: 128,
        stderr: Buffer.from('fatal: ambiguous argument origin/main'),
      })
    })

    expect(() => isHeadOnOriginMain(runGit)).toThrowError(
      'git merge-base --is-ancestor HEAD origin/main failed unexpectedly: fatal: ambiguous argument origin/main',
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
      version: releaseVersion,
    })

    for (const { manifest } of [manifests.rootManifest, ...publicPackageManifests]) {
      expect(manifest.version).toBe(releaseVersion)
      expect(manifest.repository?.url).toBe('git+https://github.com/JosephAnson/verific.git')
    }

    expect(manifests.rootManifest.manifest.devDependencies.changelogen).toBeUndefined()
    expect(manifests.rootManifest.manifest.scripts.release).toBeTypeOf('string')
    expect(manifests.rootManifest.manifest.scripts['publish:ci']).toMatch(/^pnpm release:check --publish &&/)
    expect(manifests.rootManifest.manifest.scripts['release:check']).toBe('node scripts/check-release-version.mjs')
    for (const { manifest } of publicPackageManifests)
      expect(manifest.scripts?.release).toBeUndefined()
  })
})
