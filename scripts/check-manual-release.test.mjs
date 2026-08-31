import process from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  checkManualReleasePolicy,
  readManualReleasePolicyInputs,
  releaseCommand,
} from './check-manual-release.mjs'

const rootManifest = {
  scripts: {
    'release': releaseCommand,
    'release:check': 'node scripts/check-release-version.mjs',
    'release:policy': 'node scripts/check-manual-release.mjs',
    'release:publish': 'node scripts/publish-release.mjs',
  },
}

const safeWorkflow = {
  path: '.github/workflows/ci.yml',
  source: `
name: CI
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check
        run: pnpm check
`,
}

function workflowWithStep(step) {
  const indentedStep = step.trim().split('\n').map((line, index) => `${index === 0 ? '      - ' : '        '}${line}`).join('\n')

  return `
name: Unsafe
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
${indentedStep}
`
}

describe('checkManualReleasePolicy', () => {
  it('accepts workflows that cannot mutate npm or GitHub Releases', () => {
    expect(checkManualReleasePolicy({ rootManifest, workflows: [safeWorkflow] })).toEqual([])
  })

  it('requires explicit read-only workflow permissions', () => {
    const missingPermissions = safeWorkflow.source.replace(/permissions:\n {2}contents: read\n/, '')

    expect(checkManualReleasePolicy({
      rootManifest,
      workflows: [{ ...safeWorkflow, source: missingPermissions }],
    })).toContain(
      '.github/workflows/ci.yml contains permissions other than explicit read-only contents access.',
    )
  })

  it('rejects inherited workflow environments and bracket secret references', () => {
    const source = safeWorkflow.source.replace(
      'permissions:',
      `env:
  BASH_ENV: ./tools/ship.sh
  TOKEN: \${{ secrets['RELEASE_TOKEN'] }}
permissions:`,
    )
    const problems = checkManualReleasePolicy({
      rootManifest,
      workflows: [{ ...safeWorkflow, source }],
    })

    expect(problems).toContain('.github/workflows/ci.yml contains an unapproved workflow environment.')
    expect(problems).toContain('.github/workflows/ci.yml contains an unapproved workflow secret.')
  })

  it.each([
    [workflowWithStep('run: npm publish --access public'), 'an npm publication command'],
    [workflowWithStep('run: pnpm -r --filter "./packages/**" publish'), 'an npm publication command'],
    [workflowWithStep('run: yarn publish'), 'an npm publication command'],
    [workflowWithStep('run: bun publish'), 'an npm publication command'],
    [workflowWithStep('run: npx semantic-release'), 'an unapproved package-manager command'],
    [workflowWithStep('run: npx changeset publish'), 'an unapproved package-manager command'],
    [workflowWithStep('run: pnpx semantic-release'), 'an unapproved package-manager command'],
    [workflowWithStep('run: bunx semantic-release'), 'an unapproved package-manager command'],
    [workflowWithStep('run: pnx semantic-release'), 'an unapproved package-manager command'],
    [workflowWithStep('run: yarnpkg publish'), 'an npm publication command'],
    [workflowWithStep('run: node scripts/publish-release.mjs'), 'the manual publication entry point'],
    [workflowWithStep(`run: pnpm check\nenv:\n  NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}`), 'an npm publication credential'],
    [workflowWithStep(`run: pnpm check\nenv:\n  NODE_AUTH_TOKEN: \${{ secrets.RELEASE_CREDENTIAL }}`), 'an npm publication credential'],
    [workflowWithStep('uses: actions/setup-node@example\nwith:\n  registry-url: https://registry.npmjs.org/'), 'npm registry publication setup'],
    [safeWorkflow.source.replace('contents: read', 'contents: read\n  id-token: write'), 'publication OIDC permission'],
    [safeWorkflow.source.replace('contents: read', 'contents: write'), 'release-capable repository permission'],
    [workflowWithStep('run: gh api --method POST repos/example/project/releases'), 'GitHub API mutation'],
    [workflowWithStep('run: gh api repos/example/project/releases'), 'GitHub Release API access'],
    [workflowWithStep('run: gh release create v0.3.0'), 'GitHub Release creation'],
    [workflowWithStep('uses: softprops/action-gh-release@v2'), 'GitHub Release creation'],
    [workflowWithStep(`uses: JS-DevTools/npm-publish@v3
with:
  token: \${{ secrets.RELEASE_CREDENTIAL }}`), 'an unapproved workflow action'],
    [workflowWithStep(`uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
with:
  repository: attacker/npm-release`), 'an unapproved workflow action configuration'],
    [workflowWithStep(`uses: docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a
with:
  secrets: release_token=\${{ secrets.RELEASE_CREDENTIAL }}`), 'an unapproved workflow secret'],
    [workflowWithStep(`run: node tools/ship.mjs
env:
  RELEASE_TOKEN: \${{ secrets.RELEASE_TOKEN }}`), 'an unapproved workflow command'],
    [workflowWithStep(`run: >-
  curl -X POST https://api.github.com/repos/example/project/releases`), 'an unapproved workflow command'],
    [workflowWithStep(`run: pnpm check
shell: bash -c 'npm publish; {0}'`), 'an unapproved workflow shell'],
    [workflowWithStep(`run: pnpm check
working-directory: tools/release`), 'an unapproved workflow working directory'],
    [workflowWithStep(`run: pnpm check
env:
  BASH_ENV: ./tools/ship.sh
  TOKEN: \${{ secrets.RELEASE_CREDENTIAL }}`), 'an unapproved workflow run configuration'],
    [workflowWithStep(`run: npm \${{ env.ACTION }}\nenv:\n  ACTION: publish`), 'an unapproved package-manager command'],
    [workflowWithStep('run: npm pub""lish'), 'an unapproved package-manager command'],
  ])('rejects workflow capability %#', (source, description) => {
    expect(checkManualReleasePolicy({
      rootManifest,
      workflows: [{ path: '.github/workflows/unsafe.yml', source }],
    })).toContain(`.github/workflows/unsafe.yml contains ${description}.`)
  })

  it('rejects folded and shell-continued publication commands after YAML parsing', () => {
    const foldedPublish = workflowWithStep(`run: >-
  npm
  publish`)
    const continuedPublish = workflowWithStep([
      'run: |',
      `  npm pub${'\\'}`,
      '  lish',
    ].join('\n'))

    for (const source of [foldedPublish, continuedPublish]) {
      expect(checkManualReleasePolicy({
        rootManifest,
        workflows: [{ path: '.github/workflows/unsafe.yml', source }],
      })).toContain('.github/workflows/unsafe.yml contains an npm publication command.')
    }
  })

  it('rejects indirect root and package-local publication paths', () => {
    expect(checkManualReleasePolicy({
      rootManifest: {
        scripts: {
          ...rootManifest.scripts,
          ship: 'npm publish --access public',
        },
      },
      workflows: [safeWorkflow],
    })).toContain('package.json script "ship" provides another npm publication path.')

    expect(checkManualReleasePolicy({
      rootManifest: {
        scripts: {
          ...rootManifest.scripts,
          ship: 'npx semantic-release',
        },
      },
      workflows: [safeWorkflow],
    })).toContain('package.json script "ship" provides another npm publication path.')

    expect(checkManualReleasePolicy({
      rootManifest: {
        scripts: {
          ...rootManifest.scripts,
          ship: 'npm pub',
        },
      },
      workflows: [safeWorkflow],
    })).toContain('package.json script "ship" provides another npm publication path.')

    expect(checkManualReleasePolicy({
      rootManifest: {
        scripts: {
          ...rootManifest.scripts,
          deploy: 'npm publ',
        },
      },
      workflows: [safeWorkflow],
    })).toContain('package.json script "deploy" provides another npm publication path.')

    expect(checkManualReleasePolicy({
      rootManifest: {
        scripts: {
          ...rootManifest.scripts,
          ship: 'npm exec np',
        },
      },
      workflows: [safeWorkflow],
    })).toContain('package.json script "ship" provides another npm publication path.')

    for (const command of ['np', 'npm exec -- np', 'pnpm dlx --silent np', 'yarn dlx --quiet np']) {
      expect(checkManualReleasePolicy({
        rootManifest: {
          scripts: {
            ...rootManifest.scripts,
            deploy: command,
          },
        },
        workflows: [safeWorkflow],
      })).toContain('package.json script "deploy" provides another npm publication path.')
    }

    expect(checkManualReleasePolicy({
      rootManifest: {
        scripts: {
          ...rootManifest.scripts,
          preversion: 'node tools/ship.mjs',
        },
      },
      workflows: [safeWorkflow],
    })).toContain('package.json script "preversion" creates another release entry point.')

    for (const name of ['prerelease', 'postrelease', 'prerelease:publish', 'postrelease:publish']) {
      expect(checkManualReleasePolicy({
        rootManifest: {
          scripts: {
            ...rootManifest.scripts,
            [name]: 'node tools/ship.mjs',
          },
        },
        workflows: [safeWorkflow],
      })).toContain(`package.json script "${name}" creates another release entry point.`)
    }

    expect(checkManualReleasePolicy({
      packageManifests: [{
        manifest: { scripts: { release: 'node release.mjs' } },
        path: 'packages/core/package.json',
      }],
      rootManifest,
      workflows: [safeWorkflow],
    })).toContain('packages/core/package.json must not expose package-local script "release".')
  })

  it('rejects a release-shaped workflow even when it is inert', () => {
    expect(checkManualReleasePolicy({
      rootManifest,
      workflows: [{ ...safeWorkflow, path: '.github/workflows/publish.yml' }],
    })).toContain('.github/workflows/publish.yml must not exist in the manual release design.')
  })

  it('ignores YAML comments and rejects commands outside the allow-list', () => {
    expect(checkManualReleasePolicy({
      rootManifest,
      workflows: [{
        ...safeWorkflow,
        source: `# npm publish remains manual\n${safeWorkflow.source}`,
      }],
    })).toEqual([])

    expect(checkManualReleasePolicy({
      rootManifest,
      workflows: [{
        ...safeWorkflow,
        source: workflowWithStep('run: gh api --method GET repos/example/project/git/ref/heads/main'),
      }],
    })).toContain('.github/workflows/ci.yml contains an unapproved workflow command.')
  })

  it('fails closed for malformed or ambiguous workflow YAML', () => {
    const invalidSources = [
      'jobs: [',
      'name: First\nname: Second',
      '- run: pnpm check',
    ]

    for (const source of invalidSources) {
      expect(checkManualReleasePolicy({
        rootManifest,
        workflows: [{ path: '.github/workflows/invalid.yml', source }],
      })).toContainEqual(expect.stringMatching(/must contain (?:valid, unambiguous YAML|a YAML mapping)/))
    }
  })

  it('requires the exact guarded root commands and removes the CI alias', () => {
    const problems = checkManualReleasePolicy({
      rootManifest: {
        scripts: {
          'release': 'echo --no-commit --no-tag --no-push',
          'release:check': 'node tools/release.mjs',
          'release:policy': 'node tools/policy.mjs',
          'publish:ci': 'npm publish',
          'release:publish': 'pnpm -r publish',
        },
      },
      workflows: [safeWorkflow],
    })

    expect(problems).toEqual(expect.arrayContaining([
      expect.stringContaining('exact coordinated release command'),
      expect.stringContaining('release:check'),
      expect.stringContaining('release:policy'),
      expect.stringContaining('release:publish'),
      expect.stringContaining('publish:ci'),
    ]))
  })
})

describe('repository manual release policy', () => {
  it('keeps every checked-in workflow on the manual-only side of the boundary', async () => {
    const inputs = await readManualReleasePolicyInputs(process.cwd())

    expect(checkManualReleasePolicy(inputs)).toEqual([])
    expect(inputs.workflows.map(workflow => workflow.path)).not.toContain(
      '.github/workflows/publish.yml',
    )
  })
})
