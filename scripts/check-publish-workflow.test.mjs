import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { checkPublishWorkflow } from './check-publish-workflow.mjs'

const workflowPath = resolve(process.cwd(), '.github/workflows/publish.yml')
const validWorkflow = await readFile(workflowPath, 'utf8')
const githubTokenExpression = githubExpression('secrets.GITHUB_TOKEN')
const releaseRunLine = '        run: gh release create "$GITHUB_REF_NAME" --generate-notes --verify-tag --repo "$GITHUB_REPOSITORY"'
const unsupportedYamlWhitespace = [
  0x000B,
  0x000C,
  0x0085,
  0x00A0,
  0x1680,
  ...Array.from({ length: 0x0B }, (_, index) => 0x2000 + index),
  0x2028,
  0x2029,
  0x202F,
  0x205F,
  0x3000,
  0xFEFF,
].map(codePoint => [
  `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
  String.fromCodePoint(codePoint),
])

describe('checkPublishWorkflow', () => {
  it('accepts the checked-in least-privilege publication workflow', () => {
    expect(checkPublishWorkflow(validWorkflow)).toEqual({
      actionCount: 6,
      jobCount: 3,
    })
  })

  it('rejects a broad release tag trigger', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '      - \'v[0-9]+.[0-9]+.[0-9]+\'',
      '      - \'v*.*.*\'',
    )

    expectFailure(workflow, 'push tag filter must be exactly')
  })

  it('rejects additional workflow triggers', () => {
    const workflow = replaceOnce(
      validWorkflow,
      'on:\n  push:',
      'on:\n  workflow_dispatch: {}\n  push:',
    )

    expectFailure(workflow, 'workflow trigger contains unsupported key "workflow_dispatch"')
  })

  it.each([
    ['a dynamic group', `  group: ${githubExpression('github.workflow')}-${githubExpression('github.ref')}`, 'fixed, non-expression group name'],
    ['a non-max queue', '  queue: latest', 'must set `queue: max`'],
    ['active-run cancellation', '  cancel-in-progress: true', 'must set `cancel-in-progress: false`'],
  ])('rejects release concurrency with %s', (_case, replacement, message) => {
    const original = replacement.includes('group:')
      ? '  group: publish-release'
      : replacement.includes('queue:')
        ? '  queue: max'
        : '  cancel-in-progress: false'

    expectFailure(replaceOnce(validWorkflow, original, replacement), message)
  })

  it.each([
    ['single quotes', '\'false\''],
    ['double quotes', '"false"'],
  ])('rejects cancel-in-progress false written with %s', (_case, value) => {
    const workflow = replaceOnce(
      validWorkflow,
      '  cancel-in-progress: false',
      `  cancel-in-progress: ${value}`,
    )

    expectFailure(workflow, 'exact unquoted YAML Boolean')
  })

  it('rejects publication that does not depend directly on verification', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '  publish-npm:\n    needs: verify',
      '  publish-npm:\n    needs: create-release',
    )

    expectFailure(workflow, 'publish-npm must depend directly on verify')
  })

  it('rejects release creation that does not depend directly on publication', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '  create-release:\n    needs: publish-npm',
      '  create-release:\n    needs: verify',
    )

    expectFailure(workflow, 'create-release must depend directly on publish-npm')
  })

  it('rejects additional jobs that could bypass the audited order', () => {
    const workflow = replaceOnce(
      validWorkflow,
      'jobs:\n  verify:',
      'jobs:\n  bypass:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Bypass\n        run: pnpm publish\n\n  verify:',
    )

    expectFailure(workflow, 'jobs mapping contains unsupported key "bypass"')
  })

  it('rejects workflow-level permission grants', () => {
    const workflow = replaceOnce(
      validWorkflow,
      'permissions: {}',
      'permissions:\n  contents: write',
    )

    expectFailure(workflow, 'Workflow-level permissions must be empty')
  })

  it.each([
    ['verify', '      contents: read', '      contents: write'],
    ['publish-npm', '      id-token: write', '      id-token: read'],
    ['create-release', '  create-release:\n    needs: publish-npm\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write', '  create-release:\n    needs: publish-npm\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read'],
  ])('rejects overbroad or incorrect %s permissions', (_job, original, replacement) => {
    expectFailure(
      replaceOnce(validWorkflow, original, replacement),
      'Each job must declare only its required permissions',
    )
  })

  it('requires the protected release environment for npm publication', () => {
    const workflow = replaceOnce(validWorkflow, '    environment: release\n', '')

    expectFailure(workflow, 'publish-npm must use the protected `release` environment')
  })

  it('requires a frozen install in the verification job', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '        run: pnpm install --frozen-lockfile',
      '        run: pnpm install',
    )

    expectFailure(workflow, 'verify must perform a frozen dependency install')
  })

  it('requires the complete quality gate in the verification job', () => {
    const workflow = replaceOnce(validWorkflow, '        run: pnpm check', '        run: pnpm lint')

    expectFailure(workflow, 'verify must run the complete `pnpm check` quality gate')
  })

  it('requires the publish-mode shared version and exact tag guard', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '        run: pnpm release:check --publish',
      '        run: pnpm release:check',
    )

    expectFailure(workflow, 'must run `pnpm release:check --publish` before publication')
  })

  it('rejects moving the version guard after publication', () => {
    const guard = '      - name: Verify release version\n        run: pnpm release:check --publish'
    const build = '      - name: Build packages\n        run: pnpm build'
    const publish = `      - name: Publish packages\n        run: pnpm -r --filter "./packages/**" publish --access public --no-git-checks --provenance`
    const workflow = replaceOnce(
      validWorkflow,
      `${guard}\n\n${build}\n\n${publish}`,
      `${build}\n\n${publish}\n\n${guard}`,
    )

    expectFailure(workflow, 'must run `pnpm release:check --publish` before publication')
  })

  it('requires explicit package preparation before publication', () => {
    const build = '      - name: Build packages\n        run: pnpm build\n\n'
    const workflow = replaceOnce(validWorkflow, build, '')

    expectFailure(workflow, 'publish-npm must build every package before publication')
  })

  it('rejects moving package preparation after publication', () => {
    const build = '      - name: Build packages\n        run: pnpm build'
    const publish = `      - name: Publish packages\n        run: pnpm -r --filter "./packages/**" publish --access public --no-git-checks --provenance`
    const workflow = replaceOnce(validWorkflow, `${build}\n\n${publish}`, `${publish}\n\n${build}`)

    expectFailure(workflow, 'publish-npm must build every package before publication')
  })

  it('rejects dependency caching in the privileged publication job', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '          registry-url: https://registry.npmjs.org/\n          package-manager-cache: false',
      '          registry-url: https://registry.npmjs.org/\n          cache: pnpm\n          package-manager-cache: false',
    )

    expectFailure(workflow, 'must explicitly disable package-manager caching')
  })

  it('requires the explicit package-manager cache disable in the privileged publication job', () => {
    const workflow = replaceOnce(validWorkflow, '          package-manager-cache: false\n', '')

    expectFailure(workflow, 'must explicitly disable package-manager caching')
  })

  it('requires publication to cover every package workspace', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '--filter "./packages/**"',
      '--filter @verific/core',
    )

    expectFailure(workflow, 'publish every package under packages/** with explicit provenance')
  })

  it('requires explicit provenance on publication', () => {
    const workflow = replaceOnce(validWorkflow, ' --no-git-checks --provenance', ' --no-git-checks')

    expectFailure(workflow, 'publish every package under packages/** with explicit provenance')
  })

  it.each([
    `NODE_AUTH_TOKEN: ${githubExpression('secrets.NPM_TOKEN')}`,
    `NPM_TOKEN: ${githubExpression('secrets.NPM_AUTOMATION_TOKEN')}`,
    `npm-token: ${githubExpression('secrets.PUBLISH_TOKEN')}`,
  ])('rejects the npm token fallback %s', (tokenSetting) => {
    const workflow = replaceOnce(
      validWorkflow,
      '      - name: Publish packages\n        run:',
      `      - name: Publish packages\n        env:\n          ${tokenSetting}\n        run:`,
    )

    expectFailure(workflow, 'Long-lived npm token fallbacks')
  })

  it('rejects checkout credentials in every checkout job', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '          persist-credentials: false',
      '          persist-credentials: true',
    )

    expectFailure(workflow, 'including persist-credentials: false')
  })

  it.each(['\'false\'', '"false"'])('accepts quoted %s for string-valued Action inputs', (value) => {
    const workflow = replaceOnce(
      validWorkflow,
      '          persist-credentials: false',
      `          persist-credentials: ${value}`,
    )

    expect(checkPublishWorkflow(workflow)).toEqual({
      actionCount: 6,
      jobCount: 3,
    })
  })

  it('rejects a mutable Action reference', () => {
    const workflow = replaceOnce(
      validWorkflow,
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
      'actions/checkout@v7 # v7',
    )

    expectFailure(workflow, 'full 40-character commit SHA')
  })

  it('rejects a changed Action pin even when it remains a full SHA', () => {
    const workflow = replaceOnce(
      validWorkflow,
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7',
      'actions/setup-node@0000000000000000000000000000000000000000 # v7',
    )

    expectFailure(workflow, 'must use the verified pin actions/setup-node@820762786026740c76f36085b0efc47a31fe5020')
  })

  it('requires the audited version comment beside every Action pin', () => {
    const workflow = replaceOnce(
      validWorkflow,
      'pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2 # v2.0.2',
      'pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2 # latest',
    )

    expectFailure(workflow, 'must retain the exact version comment "# v2.0.2"')
  })

  it('rejects an extra Action even when it is pinned', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '      - name: Install dependencies\n        run: pnpm install --frozen-lockfile',
      '      - name: Unexpected cache\n        uses: actions/cache@0000000000000000000000000000000000000000 # v4\n        with:\n          path: node_modules\n\n      - name: Install dependencies\n        run: pnpm install --frozen-lockfile',
    )

    expectFailure(workflow, 'not in that job\'s Action allowlist')
  })

  it('uses job-specific rather than workflow-wide Action allowlists', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '      - name: Create GitHub release\n        run:',
      '      - name: Set up Node.js\n        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\n        with:\n          node-version-file: .node-version\n          cache: pnpm\n\n      - name: Create GitHub release\n        run:',
    )

    expectFailure(workflow, 'Job create-release uses "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020", which is not in that job\'s Action allowlist')
  })

  it('rejects failure suppression', () => {
    const workflow = addReleaseStepField(validWorkflow, '        continue-on-error: true')

    expectFailure(workflow, '`continue-on-error` is forbidden')
  })

  it.each([
    ['a job condition', '    if: success()\n    steps:'],
    ['a step condition', '    steps:\n      - name: Create GitHub release\n        if: success()'],
  ])('rejects release creation guarded by %s', (_case, replacement) => {
    const original = replacement.startsWith('    if:')
      ? '    steps:'
      : '    steps:\n      - name: Create GitHub release'
    const workflow = replaceOnce(validWorkflow, original, replacement)

    expectFailure(workflow, 'Conditional job or step execution is forbidden')
  })

  it('rejects an inline command after GitHub release creation', () => {
    const workflow = replaceOnce(
      validWorkflow,
      '--repo "$GITHUB_REPOSITORY"',
      '--repo "$GITHUB_REPOSITORY" && echo released',
    )

    expectFailure(workflow, 'only the exact audited `gh release create` command')
  })

  it.each(unsupportedYamlWhitespace)(
    'rejects %s before a comment marker after an exact command',
    (codePoint, character) => {
      const workflow = replaceOnce(
        validWorkflow,
        releaseRunLine,
        `${releaseRunLine}${character}# harmless comment`,
      )

      expectFailure(workflow, `unsupported whitespace or control character ${codePoint}`)
    },
  )

  it.each(unsupportedYamlWhitespace)(
    'rejects trailing %s on an exact command scalar',
    (codePoint, character) => {
      const workflow = replaceOnce(validWorkflow, releaseRunLine, `${releaseRunLine}${character}`)

      expectFailure(workflow, `unsupported whitespace or control character ${codePoint}`)
    },
  )

  it.each(unsupportedYamlWhitespace)(
    'rejects %s used for indentation',
    (codePoint, character) => {
      const workflow = replaceOnce(
        validWorkflow,
        releaseRunLine,
        `       ${character}${releaseRunLine.slice(8)}`,
      )

      expectFailure(workflow, `unsupported whitespace or control character ${codePoint}`)
    },
  )

  it('preserves ordinary UTF-8 non-whitespace content in comments', () => {
    const workflow = replaceOnce(
      validWorkflow,
      releaseRunLine,
      `${releaseRunLine} # harmless café 東京 🚀`,
    )

    expect(checkPublishWorkflow(workflow)).toEqual({
      actionCount: 6,
      jobCount: 3,
    })
  })

  it('rejects any extra command in the release job', () => {
    const workflow = replaceOnce(
      validWorkflow,
      `        env:\n          GH_TOKEN: ${githubTokenExpression}`,
      `        env:\n          GH_TOKEN: ${githubTokenExpression}\n\n      - name: Announce\n        run: echo released`,
    )

    expectFailure(workflow, 'Job create-release must contain exactly 1 audited step; found 2')
  })

  it.each([
    ['the wrong environment key', `          GITHUB_TOKEN: ${githubTokenExpression}`],
    ['the implicit token value', `          GH_TOKEN: ${githubExpression('github.token')}`],
    ['an additional environment value', `          GH_TOKEN: ${githubTokenExpression}\n          EXTRA: true`],
  ])('rejects %s for release authentication', (_case, replacement) => {
    const workflow = replaceOnce(
      validWorkflow,
      `          GH_TOKEN: ${githubTokenExpression}`,
      replacement,
    )

    expectFailure(workflow, `must set exactly \`GH_TOKEN: ${githubTokenExpression}\``)
  })

  it.each(['bash', '"bash"', '\'bash\''])('rejects a custom shell override written as %s', (shell) => {
    const workflow = addReleaseStepField(validWorkflow, `        shell: ${shell}`)

    expectFailure(workflow, 'Custom `shell:` overrides are forbidden')
  })
})

function addReleaseStepField(workflow, field) {
  return replaceOnce(
    workflow,
    '        run: gh release create "$GITHUB_REF_NAME" --generate-notes --verify-tag --repo "$GITHUB_REPOSITORY"',
    `        run: gh release create "$GITHUB_REF_NAME" --generate-notes --verify-tag --repo "$GITHUB_REPOSITORY"\n${field}`,
  )
}

function replaceOnce(source, original, replacement) {
  expect(source, `Fixture source must contain ${JSON.stringify(original)}`).toContain(original)
  return source.replace(original, replacement)
}

function expectFailure(source, expectedMessage) {
  let error
  try {
    checkPublishWorkflow(source)
  }
  catch (caught) {
    error = caught
  }

  expect(error).toBeInstanceOf(Error)
  expect(error.message).toContain(expectedMessage)
}

function githubExpression(value) {
  return ['$', `{{ ${value} }}`].join('')
}
