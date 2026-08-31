import { Buffer } from 'node:buffer'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import {
  checkReleaseGitState,
  checkReleaseVersions,
  expectedPublicPackageNames,
  isCanonicalOriginUrl,
  npmRegistry,
  readReleaseGitState,
  readReleaseManifests,
} from './check-release-version.mjs'

const releaseVersion = '0.3.0'
const releaseTag = `v${releaseVersion}`
const releaseCommit = 'a'.repeat(40)

const rootManifest = {
  manifest: {
    name: 'verific',
    private: true,
    version: releaseVersion,
  },
  path: 'package.json',
}

const packageManifests = [
  ...expectedPublicPackageNames.map(name => ({
    manifest: {
      name,
      publishConfig: { access: 'public', registry: npmRegistry },
      version: releaseVersion,
    },
    path: `packages/${name.slice('@verific/'.length)}/package.json`,
  })),
  {
    manifest: {
      name: '@verific/private-fixture',
      private: true,
      version: '9.9.9-beta.1',
    },
    path: 'packages/private-fixture/package.json',
  },
]

const validGitState = {
  branch: 'main',
  head: releaseCommit,
  headIsOnOriginMain: true,
  localTagCommit: releaseCommit,
  originUrl: 'https://github.com/JosephAnson/verific.git',
  originMainCommit: releaseCommit,
  remoteMainCommit: releaseCommit,
  remoteTagCommit: releaseCommit,
  status: '',
}

describe('checkReleaseVersions', () => {
  it('accepts the coordinated stable package set', () => {
    expect(checkReleaseVersions({ packageManifests, rootManifest })).toEqual({
      publicPackageCount: 6,
      tag: releaseTag,
      version: releaseVersion,
    })
  })

  it('accepts the exact clean local and remote identity in publish mode', () => {
    const readGitState = vi.fn(() => validGitState)

    expect(checkReleaseVersions({
      packageManifests,
      publish: true,
      readGitState,
      rootManifest,
    })).toEqual({
      commit: releaseCommit,
      publicPackageCount: 6,
      tag: releaseTag,
      version: releaseVersion,
    })
    expect(readGitState).toHaveBeenCalledWith(releaseTag)
  })

  it('ignores private package versions', () => {
    expect(checkReleaseVersions({ packageManifests, rootManifest })).toMatchObject({
      publicPackageCount: 6,
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

  it('rejects public package version drift with the manifest path', () => {
    const driftedPackages = packageManifests.map(packageManifest => packageManifest.manifest.name === '@verific/core'
      ? {
          ...packageManifest,
          manifest: { ...packageManifest.manifest, version: '0.3.1' },
        }
      : packageManifest)

    expect(() => checkReleaseVersions({
      packageManifests: driftedPackages,
      rootManifest,
    })).toThrowError(
      'packages/core/package.json has version "0.3.1"; expected "0.3.0" to match package.json.',
    )
  })

  it('rejects a package that could publish outside the public npm registry', () => {
    const unsafePackages = packageManifests.map(packageManifest => packageManifest.manifest.name === '@verific/core'
      ? {
          ...packageManifest,
          manifest: {
            ...packageManifest.manifest,
            publishConfig: { access: 'restricted', registry: 'https://registry.example.com/' },
          },
        }
      : packageManifest)

    expect(() => checkReleaseVersions({
      packageManifests: unsafePackages,
      rootManifest,
    })).toThrowError('packages/core/package.json must set publishConfig.access to "public"')

    expect(() => checkReleaseVersions({
      packageManifests: unsafePackages,
      rootManifest,
    })).toThrowError(`packages/core/package.json must set publishConfig.registry to "${npmRegistry}"`)
  })

  it('rejects a missing or unexpected public package before inspecting Git', () => {
    const readGitState = vi.fn(() => validGitState)
    const incompletePackages = packageManifests.filter(
      packageManifest => packageManifest.manifest.name !== '@verific/nuxt',
    )

    expect(() => checkReleaseVersions({
      packageManifests: incompletePackages,
      publish: true,
      readGitState,
      rootManifest,
    })).toThrowError('Public package set must be exactly')
    expect(readGitState).not.toHaveBeenCalled()
  })

  it('does not inspect Git outside publish mode', () => {
    const readGitState = vi.fn(() => validGitState)

    checkReleaseVersions({ packageManifests, readGitState, rootManifest })

    expect(readGitState).not.toHaveBeenCalled()
  })

  it('does not inspect Git when a manifest version is invalid', () => {
    const readGitState = vi.fn(() => validGitState)

    expect(() => checkReleaseVersions({
      packageManifests,
      publish: true,
      readGitState,
      rootManifest: {
        ...rootManifest,
        manifest: { ...rootManifest.manifest, version: '0.3.0-beta.1' },
      },
    })).toThrowError('package.json must use a stable x.y.z version')
    expect(readGitState).not.toHaveBeenCalled()
  })

  it('fails closed when Git inspection throws unexpectedly', () => {
    expect(() => checkReleaseVersions({
      packageManifests,
      publish: true,
      readGitState: () => {
        throw new Error('broken Git fixture')
      },
      rootManifest,
    })).toThrowError('Could not inspect the manual release Git identity: broken Git fixture')
  })
})

describe('checkReleaseGitState', () => {
  it('accepts the exact clean current main identity', () => {
    expect(checkReleaseGitState({ ...validGitState, tag: releaseTag })).toEqual([])
  })

  it.each([
    ['status', '?? scratch.txt', 'working tree must be clean'],
    ['branch', 'release', 'current branch must be "main"'],
    ['originUrl', 'https://github.com/example/verific.git', 'Origin must be the canonical'],
    ['originMainCommit', 'b'.repeat(40), 'fetched origin/main ref must match the live origin main'],
    ['remoteMainCommit', 'b'.repeat(40), 'fetched origin/main ref must match the live origin main'],
    ['localTagCommit', undefined, `Local tag "${releaseTag}" must point to HEAD`],
    ['remoteTagCommit', 'b'.repeat(40), `Remote tag "${releaseTag}" must point to HEAD`],
  ])('rejects invalid %s state', (field, value, expected) => {
    expect(checkReleaseGitState({
      ...validGitState,
      [field]: value,
      tag: releaseTag,
    })).toContainEqual(expect.stringContaining(expected))
  })

  it('reports all identity problems together', () => {
    expect(checkReleaseGitState({
      ...validGitState,
      branch: '',
      localTagCommit: undefined,
      remoteTagCommit: undefined,
      status: ' M package.json',
      tag: releaseTag,
    })).toHaveLength(4)
  })

  it('allows an immutable tagged ancestor only for a confirmed partial-release retry', () => {
    const currentMain = 'b'.repeat(40)

    expect(checkReleaseGitState({
      ...validGitState,
      allowMainDescendant: true,
      branch: '',
      originMainCommit: currentMain,
      remoteMainCommit: currentMain,
      tag: releaseTag,
    })).toEqual([])

    expect(checkReleaseGitState({
      ...validGitState,
      branch: '',
      originMainCommit: currentMain,
      remoteMainCommit: currentMain,
      tag: releaseTag,
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('current branch must be "main"'),
      expect.stringContaining('HEAD must exactly match current origin/main'),
    ]))
  })

  it('rejects a retry after the tagged commit leaves main history', () => {
    expect(checkReleaseGitState({
      ...validGitState,
      allowMainDescendant: true,
      headIsOnOriginMain: false,
      tag: releaseTag,
    })).toContainEqual(expect.stringContaining('must remain in current origin/main history'))
  })
})

describe('readReleaseGitState', () => {
  it('reads clean local refs and live annotated-tag refs without a shell', () => {
    const tagObject = 'b'.repeat(40)
    const runGit = vi.fn((_command, args) => {
      const key = args.join(' ')
      const outputs = {
        'branch --show-current': 'main\n',
        'ls-remote origin refs/heads/main refs/tags/v0.3.0 refs/tags/v0.3.0^{}': `${releaseCommit}\trefs/heads/main\n${tagObject}\trefs/tags/v0.3.0\n${releaseCommit}\trefs/tags/v0.3.0^{}\n`,
        'merge-base --is-ancestor HEAD origin/main': '',
        'remote get-url origin': 'https://github.com/JosephAnson/verific.git\n',
        'rev-parse --verify refs/tags/v0.3.0^{commit}': `${releaseCommit}\n`,
        'rev-parse HEAD': `${releaseCommit}\n`,
        'rev-parse origin/main': `${releaseCommit}\n`,
        'status --porcelain=v1 --untracked-files=all': '',
      }
      return outputs[key]
    })

    expect(readReleaseGitState(releaseTag, runGit)).toEqual(validGitState)
    for (const call of runGit.mock.calls) {
      expect(call[0]).toBe('git')
      expect(call[2]).toEqual({
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }
  })

  it('supports lightweight remote tags', () => {
    const runGit = vi.fn((_command, args) => {
      const key = args.join(' ')
      if (key.startsWith('ls-remote '))
        return `${releaseCommit}\trefs/heads/main\n${releaseCommit}\trefs/tags/v0.3.0\n`
      if (key === 'branch --show-current')
        return 'main\n'
      if (key === 'remote get-url origin')
        return 'https://github.com/JosephAnson/verific.git\n'
      if (key === 'status --porcelain=v1 --untracked-files=all')
        return ''
      return `${releaseCommit}\n`
    })

    expect(readReleaseGitState(releaseTag, runGit).remoteTagCommit).toBe(releaseCommit)
  })

  it('represents an absent local tag without weakening other checks', () => {
    const runGit = vi.fn((_command, args) => {
      const key = args.join(' ')
      if (key === 'rev-parse --verify refs/tags/v0.3.0^{commit}') {
        throw Object.assign(new Error('missing tag'), {
          status: 128,
          stderr: Buffer.from('fatal: Needed a single revision'),
        })
      }
      if (key.startsWith('ls-remote '))
        return `${releaseCommit}\trefs/heads/main\n`
      if (key === 'branch --show-current')
        return 'main\n'
      if (key === 'remote get-url origin')
        return 'https://github.com/JosephAnson/verific.git\n'
      if (key === 'status --porcelain=v1 --untracked-files=all')
        return ''
      return `${releaseCommit}\n`
    })

    expect(readReleaseGitState(releaseTag, runGit)).toMatchObject({
      localTagCommit: undefined,
      remoteTagCommit: undefined,
    })
  })
})

describe('isCanonicalOriginUrl', () => {
  it.each([
    'https://github.com/JosephAnson/verific.git',
    'git@github.com:JosephAnson/verific.git',
    'ssh://git@github.com/JosephAnson/verific',
  ])('accepts canonical GitHub remote %s', (url) => {
    expect(isCanonicalOriginUrl(url)).toBe(true)
  })

  it.each([
    'https://github.com/example/verific.git',
    'https://example.com/JosephAnson/verific.git',
    'git@github.example:JosephAnson/verific.git',
  ])('rejects non-canonical remote %s', (url) => {
    expect(isCanonicalOriginUrl(url)).toBe(false)
  })
})

describe('release manifests', () => {
  it('discovers every public package with coordinated release metadata', async () => {
    const repositoryRoot = process.cwd()
    const manifests = await readReleaseManifests(repositoryRoot)
    const publicPackageManifests = manifests.packageManifests.filter(({ manifest }) => manifest.private !== true)

    expect(publicPackageManifests.map(({ manifest }) => manifest.name)).toEqual(expectedPublicPackageNames)
    const repositoryVersion = manifests.rootManifest.manifest.version

    expect(checkReleaseVersions(manifests)).toEqual({
      publicPackageCount: 6,
      tag: `v${repositoryVersion}`,
      version: repositoryVersion,
    })

    for (const { manifest } of [manifests.rootManifest, ...publicPackageManifests]) {
      expect(manifest.version).toBe(repositoryVersion)
      expect(manifest.repository?.url).toBe('git+https://github.com/JosephAnson/verific.git')
    }

    const scripts = manifests.rootManifest.manifest.scripts
    expect(manifests.rootManifest.manifest.devDependencies.changelogen).toBeUndefined()
    expect(scripts.release).toContain('--no-commit --no-tag --no-push')
    expect(scripts.release).toContain('--ignore-scripts')
    expect(scripts['release:publish']).toBe('node scripts/publish-release.mjs')
    expect(scripts['publish:ci']).toBeUndefined()
    expect(scripts['release:check']).toBe('node scripts/check-release-version.mjs')
    for (const { manifest } of publicPackageManifests)
      expect(manifest.scripts?.release).toBeUndefined()
  })
})
