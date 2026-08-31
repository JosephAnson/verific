import { Buffer } from 'node:buffer'
import { existsSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  expectedPublicPackageNames,
  readReleaseManifests,
  releasePackages,
} from './check-release-version.mjs'
import {
  npmRegistry,
  packReleaseArtifacts,
  publishRelease,
  readPublishedPackages,
} from './publish-release.mjs'

const repositoryRoot = '/repository'
const version = '0.3.0'
const candidate = { tag: `v${version}`, version }
const identity = {
  ...candidate,
  commit: 'a'.repeat(40),
}
const artifacts = expectedPublicPackageNames.map((name, index) => ({
  filename: `/temporary/package-${index}.tgz`,
  integrity: `sha512-${index}`,
  name,
}))

const authenticationCall = [
  'npm',
  ['whoami', '--registry', npmRegistry],
  { cwd: repositoryRoot, stdio: 'inherit' },
]
const qualityCall = ['pnpm', ['check'], { cwd: repositoryRoot, stdio: 'inherit' }]

function published(...packageNames) {
  return new Map(packageNames.map((packageName) => {
    const artifact = artifacts.find(candidateArtifact => candidateArtifact.name === packageName)
    return [packageName, { integrity: artifact.integrity, name: packageName }]
  }))
}

function preparedArtifacts() {
  const cleanup = vi.fn(async () => {})
  return {
    cleanup,
    prepareArtifacts: vi.fn(async () => ({ artifacts, cleanup })),
  }
}

describe('publishRelease', () => {
  it('publishes guarded tarballs with native main safeguards for an initial release', async () => {
    const inspectCandidate = vi.fn(async () => candidate)
    const inspectIdentity = vi.fn(async () => identity)
    const inspectPublished = vi.fn()
      .mockResolvedValueOnce(published())
      .mockResolvedValueOnce(published())
      .mockResolvedValueOnce(published(...expectedPublicPackageNames))
    const { cleanup, prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn()

    await expect(publishRelease({
      inspectCandidate,
      inspectIdentity,
      inspectPublished,
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })).resolves.toEqual({ packageCount: 6, version })

    expect(inspectCandidate).toHaveBeenCalledOnce()
    expect(inspectIdentity.mock.calls).toEqual([
      [{ mode: 'initial' }],
      [{ mode: 'initial' }],
      [{ mode: 'initial' }],
      [{ mode: 'initial' }],
    ])
    expect(inspectPublished).toHaveBeenCalledTimes(3)
    expect(prepareArtifacts).toHaveBeenCalledWith(version)
    expect(runCommand.mock.calls.slice(0, 2)).toEqual([authenticationCall, qualityCall])
    expect(runCommand.mock.calls.slice(2)).toHaveLength(6)

    for (const [index, call] of runCommand.mock.calls.slice(2).entries()) {
      expect(call).toEqual([
        'pnpm',
        [
          'publish',
          artifacts[index].filename,
          '--access',
          'public',
          '--registry',
          npmRegistry,
          '--publish-branch',
          'main',
        ],
        { cwd: repositoryRoot, stdio: 'inherit' },
      ])
    }
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('publishes only missing matching tarballs for a confirmed retry', async () => {
    const inspectIdentity = vi.fn(async () => identity)
    const inspectPublished = vi.fn()
      .mockResolvedValueOnce(published('@verific/core'))
      .mockResolvedValueOnce(published('@verific/core'))
      .mockResolvedValueOnce(published(...expectedPublicPackageNames))
    const { prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn()

    await publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity,
      inspectPublished,
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })

    expect(inspectIdentity.mock.calls).toEqual([
      [{ mode: 'retry' }],
      [{ mode: 'retry' }],
      [{ mode: 'retry' }],
      [{ mode: 'retry' }],
    ])
    expect(runCommand.mock.calls.slice(2)).toHaveLength(5)
    for (const [, args] of runCommand.mock.calls.slice(2)) {
      expect(args).toContain('--no-git-checks')
      expect(args).not.toContain('--publish-branch')
      expect(args).not.toContain(artifacts[0].filename)
    }
  })

  it('performs the full verification but skips writes when all tarballs already match', async () => {
    const allPublished = published(...expectedPublicPackageNames)
    const inspectPublished = vi.fn(async () => allPublished)
    const { cleanup, prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn()

    await publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity: async () => identity,
      inspectPublished,
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })

    expect(runCommand.mock.calls).toEqual([authenticationCall, qualityCall])
    expect(inspectPublished).toHaveBeenCalledTimes(3)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('does not run a command when candidate or registry inspection fails', async () => {
    const runCommand = vi.fn()

    await expect(publishRelease({
      inspectCandidate: async () => {
        throw new Error('invalid release candidate')
      },
      repositoryRoot,
      runCommand,
    })).rejects.toThrow('invalid release candidate')

    await expect(publishRelease({
      inspectCandidate: async () => candidate,
      inspectPublished: async () => {
        throw new Error('registry unavailable')
      },
      repositoryRoot,
      runCommand,
    })).rejects.toThrow('registry unavailable')
    expect(runCommand).not.toHaveBeenCalled()
  })

  it.each([
    ['npm authentication', 0],
    ['the quality gate', 1],
  ])('does not pack or publish when %s fails', async (_label, failingCommand) => {
    const { prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn(() => {
      if (runCommand.mock.calls.length === failingCommand + 1)
        throw new Error('preflight failed')
    })

    await expect(publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity: async () => identity,
      inspectPublished: async () => published(),
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })).rejects.toThrow('preflight failed')
    expect(prepareArtifacts).not.toHaveBeenCalled()
    expect(runCommand.mock.calls.some(([, args]) => args.includes('publish'))).toBe(false)
  })

  it('does not pack or publish when the post-gate identity check fails', async () => {
    const inspectIdentity = vi.fn()
      .mockResolvedValueOnce(identity)
      .mockRejectedValueOnce(new Error('tree changed during checks'))
    const { prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn()

    await expect(publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity,
      inspectPublished: async () => published(),
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })).rejects.toThrow('tree changed during checks')
    expect(prepareArtifacts).not.toHaveBeenCalled()
    expect(runCommand.mock.calls.some(([, args]) => args.includes('publish'))).toBe(false)
  })

  it('cleans packed artifacts and does not publish when packing changes the identity', async () => {
    const inspectIdentity = vi.fn()
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce({ ...identity, commit: 'b'.repeat(40) })
    const { cleanup, prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn()

    await expect(publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity,
      inspectPublished: async () => published(),
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })).rejects.toThrow('release identity changed during publication checks')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(runCommand.mock.calls.some(([, args]) => args.includes('publish'))).toBe(false)
  })

  it('aborts a retry when its registry evidence disappears during the gate', async () => {
    const inspectPublished = vi.fn()
      .mockResolvedValueOnce(published('@verific/core'))
      .mockResolvedValueOnce(published())
    const { cleanup, prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn()

    await expect(publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity: async () => identity,
      inspectPublished,
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })).rejects.toThrow('retry evidence for version "0.3.0" disappeared')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(runCommand.mock.calls.some(([, args]) => args.includes('publish'))).toBe(false)
  })

  it('rejects existing package contents that do not match the guarded artifacts', async () => {
    const mismatched = new Map([
      ['@verific/core', { integrity: 'sha512-different', name: '@verific/core' }],
    ])
    const inspectPublished = vi.fn()
      .mockResolvedValueOnce(mismatched)
      .mockResolvedValueOnce(mismatched)
    const { cleanup, prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn()

    await expect(publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity: async () => identity,
      inspectPublished,
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })).rejects.toThrow('does not match the artifact packed from the guarded release commit')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(runCommand.mock.calls.some(([, args]) => args.includes('publish'))).toBe(false)
  })

  it('does not publish when the identity changes during final registry preflight', async () => {
    const inspectIdentity = vi.fn()
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce(identity)
      .mockRejectedValueOnce(new Error('remote main advanced during registry checks'))
    const inspectPublished = vi.fn()
      .mockResolvedValueOnce(published())
      .mockResolvedValueOnce(published())
    const { cleanup, prepareArtifacts } = preparedArtifacts()
    const runCommand = vi.fn()

    await expect(publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity,
      inspectPublished,
      prepareArtifacts,
      repositoryRoot,
      runCommand,
    })).rejects.toThrow('remote main advanced during registry checks')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(runCommand.mock.calls.some(([, args]) => args.includes('publish'))).toBe(false)
  })

  it('does not claim completion when final registry confirmation is incomplete', async () => {
    const inspectPublished = vi.fn()
      .mockResolvedValueOnce(published())
      .mockResolvedValueOnce(published())
      .mockResolvedValueOnce(published(...expectedPublicPackageNames.slice(0, -1)))
    const { cleanup, prepareArtifacts } = preparedArtifacts()

    await expect(publishRelease({
      inspectCandidate: async () => candidate,
      inspectIdentity: async () => identity,
      inspectPublished,
      prepareArtifacts,
      repositoryRoot,
      runCommand: vi.fn(),
    })).rejects.toThrow('@verific/vue-i18n is missing from npm')
    expect(cleanup).toHaveBeenCalledOnce()
  })
})

describe('readPublishedPackages', () => {
  it('reads exact versions and SHA-512 integrity while treating only E404 as missing', () => {
    const runCommand = vi.fn((_command, args) => {
      const packageName = args[1].slice(0, args[1].lastIndexOf('@'))
      if (packageName === '@verific/nuxt') {
        throw Object.assign(new Error('version absent'), {
          status: 1,
          stderr: Buffer.from('npm error code E404'),
        })
      }
      return JSON.stringify({
        'dist.integrity': `sha512-${packageName}`,
        version,
      })
    })

    const result = readPublishedPackages({ repositoryRoot, runCommand, version })
    expect([...result.keys()]).toEqual(
      expectedPublicPackageNames.filter(packageName => packageName !== '@verific/nuxt'),
    )
    expect(result.get('@verific/core')).toEqual({
      integrity: 'sha512-@verific/core',
      name: '@verific/core',
    })
    expect(runCommand).toHaveBeenCalledTimes(6)
  })

  it('fails closed for registry errors, version drift and missing integrity', () => {
    expect(() => readPublishedPackages({
      repositoryRoot,
      runCommand: () => {
        throw Object.assign(new Error('registry unavailable'), {
          status: 1,
          stderr: Buffer.from('npm error code E500'),
        })
      },
      version,
    })).toThrow('Could not verify @verific/core@0.3.0 on npm')

    expect(() => readPublishedPackages({
      repositoryRoot,
      runCommand: () => JSON.stringify({
        'dist.integrity': 'sha512-value',
        'version': '0.2.0',
      }),
      version,
    })).toThrow('npm returned version "0.2.0" for @verific/core@0.3.0')

    expect(() => readPublishedPackages({
      repositoryRoot,
      runCommand: () => JSON.stringify({ version }),
      version,
    })).toThrow('npm returned no SHA-512 integrity for @verific/core@0.3.0')
  })
})

describe('packReleaseArtifacts', () => {
  it('packs the exact public package set and computes deterministic SHA-512 metadata', async () => {
    const filenames = []
    const runCommand = vi.fn((_command, args) => {
      const packageName = `@verific/${basename(args[1])}`
      const temporaryDirectory = args[5]
      const filename = join(temporaryDirectory, `${basename(args[1])}.tgz`)
      filenames.push(filename)
      writeFileSync(filename, packageName)
      return JSON.stringify({ filename, name: packageName, version })
    })

    const prepared = await packReleaseArtifacts({ repositoryRoot, runCommand, version })
    expect(prepared.artifacts.map(artifact => artifact.name)).toEqual(expectedPublicPackageNames)
    expect(prepared.artifacts.every(artifact => artifact.integrity.startsWith('sha512-'))).toBe(true)
    expect(runCommand).toHaveBeenCalledTimes(6)
    expect(filenames.every(filename => existsSync(filename))).toBe(true)

    await prepared.cleanup()
    expect(filenames.every(filename => !existsSync(filename))).toBe(true)
  })

  it('packs all built release packages reproducibly', async () => {
    const workspaceRoot = process.cwd()
    const { rootManifest } = await readReleaseManifests(workspaceRoot)
    const releaseVersion = rootManifest.manifest.version
    const first = await packReleaseArtifacts({ repositoryRoot: workspaceRoot, version: releaseVersion })
    const second = await packReleaseArtifacts({ repositoryRoot: workspaceRoot, version: releaseVersion })

    try {
      expect(first.artifacts.map(({ name }) => name)).toEqual(releasePackages.map(({ name }) => name))
      expect(second.artifacts.map(({ name }) => name)).toEqual(releasePackages.map(({ name }) => name))
      expect(second.artifacts.map(({ integrity }) => integrity)).toEqual(
        first.artifacts.map(({ integrity }) => integrity),
      )
    }
    finally {
      await Promise.all([first.cleanup(), second.cleanup()])
    }
  }, 120_000)
})
