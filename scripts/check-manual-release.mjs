import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { readReleaseManifests, releasePackages } from './check-release-version.mjs'

const releaseManifestPaths = ['package.json', ...releasePackages.map(({ manifestPath }) => manifestPath)]

export const releaseCommand = [
  'bumpp',
  ...releaseManifestPaths,
  '--no-commit',
  '--no-tag',
  '--no-push',
  '--ignore-scripts',
].join(' ')

const publicationCommandPattern = /\b(?:bun|bunx|npm|npx|pnpm|pnpx|pnx|yarn|yarnpkg)\b[^\n]+\bpu(?:b(?:l(?:i(?:sh?)?)?)?)?\b/i
const publicationEntryPattern = /\brelease:publish\b|scripts\/publish-release\.mjs/i
const releaseAutomationPattern = /\b(?:changesets?\s+publish|lerna\s+publish|np|release-it|semantic-release)\b/i
const releaseScriptNamePattern = /(?:^|:)(?:(?:pre|post)?release|(?:pre|post)?version|prepublishOnly|(?:pre|post)?publish|ship)(?::|$)/i
const packageManagerPattern = /\b(?:bun|bunx|npm|npx|pnpm|pnpx|pnx|yarn|yarnpkg)\b/
const githubApiMutationPattern = /\bgh\s+api\b[^\n]*(?:(?:--method|-X)(?:=|\s+)(?:POST|PUT|PATCH|DELETE|post|put|patch|delete)\b|(?:-f|-F|--field|--raw-field|--input)(?:=|\s))/
const githubReleaseApiPattern = /\bgh\s+api\b[^\n]*\/releases(?:\/|\b)/i
const githubReleaseCommandPattern = /\bgh\s+release\s+create\b/i
const githubReleaseActionPattern = /actions\/create-release|softprops\/action-gh-release|\bchangelogithub\b/i
const npmCredentialPattern = /\b(?:NPM_TOKEN|NPM_AUTH_TOKEN|NODE_AUTH_TOKEN|NPM_CONFIG_OTP|YARN_NPM_AUTH_TOKEN)\b/
const npmRegistryPattern = /https:\/\/registry\.npmjs\.org/i
const workflowSecretPattern = /\bsecrets(?:\.([A-Za-z_]\w*)|\[['"]([A-Za-z_]\w*)['"]\])/g
const dollar = '$'
const workflowExpression = value => `${dollar}{{ ${value} }}`
const deployWorkflowPath = '.github/workflows/deploy.yml'
const workflowActions = {
  buildPush: 'docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a',
  checkout: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  dockerLogin: 'docker/login-action@dbcb813823bdd20940b903addbd779551569679f',
  pnpm: 'pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2',
  setupBuildx: 'docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f',
  setupNode: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
}
const allowedWorkflowActions = new Set(Object.values(workflowActions))
const dockerPublicationActions = new Set([
  workflowActions.buildPush,
  workflowActions.dockerLogin,
])
const dockerPublicationSecrets = new Set([
  'DOCKERHUB_DEPLOY_TOKEN_V2',
  'DOCKERHUB_DEPLOY_USERNAME_V2',
])
const allowedWorkflowSecrets = dockerPublicationSecrets
const verifySuccessfulCiCommand = [
  'set -euo pipefail',
  'ci_run_count="$(gh api',
  '--method GET',
  '--header \'Accept: application/vnd.github+json\'',
  '--header \'X-GitHub-Api-Version: 2026-03-10\'',
  `"/repos/${dollar}{GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&head_sha=${dollar}{GITHUB_SHA}&per_page=1"`,
  '--jq \'.workflow_runs | length\')"',
  'if [[ "$ci_run_count" -eq 0 ]]; then',
  `echo "::error::No successful push-triggered CI run found for ${dollar}{GITHUB_SHA}"`,
  'exit 1',
  'fi',
].join(' ')
const promoteCurrentMainCommand = [
  'set -euo pipefail',
  'current_sha="$(gh api',
  '--method GET',
  '--header \'Accept: application/vnd.github+json\'',
  '--header \'X-GitHub-Api-Version: 2026-03-10\'',
  `"/repos/${dollar}{GITHUB_REPOSITORY}/git/ref/heads/main"`,
  '--jq \'.object.sha\')"',
  'if [[ "$current_sha" != "$EXPECTED_SHA" ]]; then',
  `echo "::notice::Skipping latest promotion because ${dollar}{EXPECTED_SHA} is no longer the main tip"`,
  'exit 0',
  'fi',
  'if [[ -z "$DIGEST" ]]; then',
  'echo "::error::Docker build did not return a digest"',
  'exit 1',
  'fi',
  'docker buildx imagetools create',
  `--tag "${dollar}{IMAGE}:latest"`,
  `"${dollar}{IMAGE}@${dollar}{DIGEST}"`,
].join(' ')
const manualDeploySteps = [
  {
    env: { GH_TOKEN: workflowExpression('github.token') },
    name: 'Verify successful CI for selected commit',
    run: verifySuccessfulCiCommand,
  },
  {
    uses: workflowActions.checkout,
    with: {
      'persist-credentials': false,
      'ref': workflowExpression('github.sha'),
    },
  },
  { name: 'Set up Docker Buildx', uses: workflowActions.setupBuildx },
  {
    name: 'Login to DockerHub',
    uses: workflowActions.dockerLogin,
    with: {
      password: workflowExpression('secrets.DOCKERHUB_DEPLOY_TOKEN_V2'),
      username: workflowExpression('secrets.DOCKERHUB_DEPLOY_USERNAME_V2'),
    },
  },
  {
    id: 'docker_build',
    name: 'Build and push',
    uses: workflowActions.buildPush,
    with: {
      context: '.',
      push: true,
      sbom: true,
      tags: `${workflowExpression('secrets.DOCKERHUB_DEPLOY_USERNAME_V2')}/verific:${workflowExpression('github.sha')}`,
    },
  },
  {
    env: {
      DIGEST: workflowExpression('steps.docker_build.outputs.digest'),
      EXPECTED_SHA: workflowExpression('github.sha'),
      GH_TOKEN: workflowExpression('github.token'),
      IMAGE: `${workflowExpression('secrets.DOCKERHUB_DEPLOY_USERNAME_V2')}/verific`,
    },
    name: 'Promote current main digest to latest',
    run: promoteCurrentMainCommand,
  },
]
const manualDeployJobCondition = workflowExpression('github.ref == \'refs/heads/main\'')
const manualDeployConcurrency = {
  'cancel-in-progress': false,
  'group': 'deploy-main-v2',
  'queue': 'max',
}
const manualDeployPermissions = { actions: 'read', contents: 'read' }
const manualDeployTrigger = { workflow_dispatch: null }
const allowedWorkflowActionSteps = new Set([
  { uses: workflowActions.checkout, with: { 'persist-credentials': false } },
  { uses: workflowActions.pnpm, with: { install: false } },
  {
    uses: workflowActions.setupNode,
    with: { 'cache': 'pnpm', 'node-version-file': '.node-version' },
  },
  {
    uses: workflowActions.setupNode,
    with: { 'cache': 'pnpm', 'node-version': workflowExpression('matrix.node-version') },
  },
  ...manualDeploySteps.filter(step => step.uses),
].map(serialiseWorkflowStep))
const allowedWorkflowRunStepValues = [
  { name: 'Install', run: 'pnpm install --frozen-lockfile' },
  { name: 'Check', run: 'pnpm check' },
  {
    name: 'Install Chromium',
    run: 'pnpm --dir playgrounds/docs exec playwright install --with-deps chromium',
  },
  {
    name: 'Check browser-only documentation behaviour',
    run: 'pnpm --dir playgrounds/docs test:browser',
  },
  {
    name: 'Check Node compatibility',
    run: 'pnpm build && pnpm packages:typecheck && pnpm test',
  },
  ...manualDeploySteps.filter(step => step.run),
]
const allowedWorkflowCommands = new Set(
  allowedWorkflowRunStepValues.map(({ run }) => normaliseCommand(run)),
)
const allowedWorkflowRunSteps = new Set(allowedWorkflowRunStepValues.map(serialiseWorkflowStep))
const allowedRootReleaseScriptNames = new Set([
  'release',
  'release:check',
  'release:policy',
  'release:publish',
])

export function checkManualReleasePolicy({ packageManifests = [], rootManifest, workflows }) {
  const problems = []
  const scripts = rootManifest.scripts ?? {}

  if (scripts.release !== releaseCommand) {
    problems.push(
      `package.json must expose the exact coordinated release command: ${releaseCommand}`,
    )
  }

  if (scripts['release:publish'] !== 'node scripts/publish-release.mjs') {
    problems.push(
      'package.json must expose "release:publish" as exactly "node scripts/publish-release.mjs".',
    )
  }

  if (scripts['release:check'] !== 'node scripts/check-release-version.mjs') {
    problems.push(
      'package.json must expose "release:check" as exactly "node scripts/check-release-version.mjs".',
    )
  }

  if (scripts['release:policy'] !== 'node scripts/check-manual-release.mjs') {
    problems.push(
      'package.json must expose "release:policy" as exactly "node scripts/check-manual-release.mjs".',
    )
  }

  if (scripts['publish:ci'] !== undefined)
    problems.push('package.json must not expose the obsolete "publish:ci" command.')

  checkManifestScripts(problems, 'package.json', scripts, { allowPublicationEntry: true })
  for (const packageManifest of packageManifests) {
    checkManifestScripts(
      problems,
      packageManifest.path,
      packageManifest.manifest.scripts ?? {},
    )
  }

  for (const workflow of workflows)
    checkWorkflow(problems, workflow)

  return problems
}

export async function readManualReleasePolicyInputs(repositoryRoot) {
  const workflowsDirectory = join(repositoryRoot, '.github', 'workflows')
  const workflowNames = (await readdir(workflowsDirectory))
    .filter(name => /\.ya?ml$/.test(name))
    .sort((left, right) => left.localeCompare(right))

  const manifests = await readReleaseManifests(repositoryRoot)

  return {
    packageManifests: manifests.packageManifests,
    rootManifest: manifests.rootManifest.manifest,
    workflows: await Promise.all(workflowNames.map(async name => ({
      path: `.github/workflows/${name}`,
      source: await readFile(join(workflowsDirectory, name), 'utf8'),
    }))),
  }
}

function checkWorkflow(problems, workflow) {
  const descriptions = new Set()
  const report = description => descriptions.add(description)
  const isDeployWorkflow = workflow.path === deployWorkflowPath

  if (basename(workflow.path) === 'publish.yml' || basename(workflow.path) === 'publish.yaml')
    problems.push(`${workflow.path} must not exist in the manual release design.`)

  let document
  try {
    document = parse(workflow.source)
  }
  catch (error) {
    problems.push(`${workflow.path} must contain valid, unambiguous YAML: ${formatError(error)}.`)
    return
  }

  if (!isRecord(document)) {
    problems.push(`${workflow.path} must contain a YAML mapping.`)
    return
  }

  const expectedPermissions = isDeployWorkflow
    ? manualDeployPermissions
    : { contents: 'read' }

  if (!hasExplicitReadOnlyPermissions(document.permissions, expectedPermissions)) {
    report(isDeployWorkflow
      ? 'Docker publish permissions other than explicit read-only actions and contents access'
      : 'permissions other than explicit read-only contents access')
  }

  if (isDeployWorkflow)
    checkManualDeployWorkflow(document, report)

  inspectWorkflowValue(document, undefined, report, {
    allowDockerPublication: isDeployWorkflow,
  })

  for (const description of descriptions)
    problems.push(`${workflow.path} contains ${description}.`)
}

function checkManualDeployWorkflow(document, report) {
  if (!hasExactWorkflowValue(document.on, manualDeployTrigger))
    report('a deploy trigger other than workflow_dispatch only')

  const jobNames = isRecord(document.jobs) ? Object.keys(document.jobs).sort() : []
  if (!hasExactWorkflowValue(jobNames, ['build']))
    report('Docker jobs other than the single approved build job')

  const buildJob = isRecord(document.jobs) && isRecord(document.jobs.build)
    ? document.jobs.build
    : undefined

  if (!buildJob) {
    report('no approved Docker build job')
    return
  }

  if (buildJob.if !== manualDeployJobCondition)
    report('a Docker publish job without the exact refs/heads/main guard')

  if (!hasExactWorkflowValue(buildJob.concurrency, manualDeployConcurrency)) {
    report('Docker deployment concurrency other than the approved non-cancelling queue')
  }

  const jobKeys = Object.keys(buildJob).sort()
  const approvedJobKeys = ['concurrency', 'if', 'runs-on', 'steps', 'timeout-minutes']
  if (!hasExactWorkflowValue(jobKeys, approvedJobKeys))
    report('an unapproved Docker publish job configuration')

  if (buildJob['runs-on'] !== 'ubuntu-latest' || buildJob['timeout-minutes'] !== 45)
    report('a Docker publish runner or timeout other than the approved values')

  const steps = Array.isArray(buildJob.steps) ? buildJob.steps : []
  if (!hasExactWorkflowValue(steps[0], manualDeploySteps[0]))
    report('no exact successful push CI preflight before Docker publication')

  if (!hasExactWorkflowValue(steps, manualDeploySteps))
    report('Docker deploy steps other than the exact approved sequence')
}

function inspectWorkflowValue(value, key, report, context) {
  if (typeof value === 'string') {
    if (npmCredentialPattern.test(value))
      report('an npm publication credential')

    if (npmRegistryPattern.test(value))
      report('npm registry publication setup')

    for (const match of value.matchAll(workflowSecretPattern)) {
      const secretName = match[1] ?? match[2]
      if (!allowedWorkflowSecrets.has(secretName))
        report('an unapproved workflow secret')
      else if (!context.allowDockerPublication)
        report(`Docker publication capability outside ${deployWorkflowPath}`)
    }

    if (key === 'run')
      inspectRunCommand(value, report, context)

    if (key === 'uses') {
      if (githubReleaseActionPattern.test(value))
        report('GitHub Release creation')
      if (!allowedWorkflowActions.has(value))
        report('an unapproved workflow action')
      if (dockerPublicationActions.has(value) && !context.allowDockerPublication)
        report(`Docker publication capability outside ${deployWorkflowPath}`)
    }

    return
  }

  if (Array.isArray(value)) {
    for (const child of value)
      inspectWorkflowValue(child, key, report, context)
    return
  }

  if (!isRecord(value))
    return

  if (typeof value.uses === 'string' && !allowedWorkflowActionSteps.has(serialiseWorkflowStep(value)))
    report('an unapproved workflow action configuration')

  if (typeof value.run === 'string' && !allowedWorkflowRunSteps.has(serialiseWorkflowStep(value)))
    report('an unapproved workflow run configuration')

  if ('env' in value && typeof value.run !== 'string' && typeof value.uses !== 'string')
    report('an unapproved workflow environment')

  for (const [childKey, childValue] of Object.entries(value)) {
    if (npmCredentialPattern.test(childKey))
      report('an npm publication credential')
    if (dockerPublicationSecrets.has(childKey) && !context.allowDockerPublication)
      report(`Docker publication capability outside ${deployWorkflowPath}`)

    if (childKey === 'permissions' && childValue === 'write-all') {
      report('release-capable repository permission')
      report('publication OIDC permission')
    }
    if (childKey === 'contents' && childValue === 'write')
      report('release-capable repository permission')
    if (childKey === 'id-token' && childValue === 'write')
      report('publication OIDC permission')
    if (childKey === 'shell')
      report('an unapproved workflow shell')
    if (childKey === 'working-directory')
      report('an unapproved workflow working directory')

    inspectWorkflowValue(childValue, childKey, report, context)
  }
}

function inspectRunCommand(source, report, context) {
  const command = normaliseCommand(source)
  const approved = allowedWorkflowCommands.has(command)

  if (command === promoteCurrentMainCommand && !context.allowDockerPublication)
    report(`Docker publication capability outside ${deployWorkflowPath}`)

  if (publicationCommandPattern.test(command))
    report('an npm publication command')
  if (publicationEntryPattern.test(command))
    report('the manual publication entry point')
  if (packageManagerPattern.test(command) && !approved)
    report('an unapproved package-manager command')
  if (!approved)
    report('an unapproved workflow command')
  if (githubApiMutationPattern.test(command))
    report('GitHub API mutation')
  if (githubReleaseApiPattern.test(command))
    report('GitHub Release API access')
  if (githubReleaseCommandPattern.test(command))
    report('GitHub Release creation')
}

function checkManifestScripts(problems, manifestPath, scripts, { allowPublicationEntry = false } = {}) {
  for (const [name, command] of Object.entries(scripts)) {
    if (allowPublicationEntry && name === 'release:publish')
      continue

    const normalisedCommand = normaliseCommand(String(command))
    if (
      publicationCommandPattern.test(normalisedCommand)
      || publicationEntryPattern.test(normalisedCommand)
      || releaseAutomationPattern.test(normalisedCommand)
    ) {
      problems.push(`${manifestPath} script "${name}" provides another npm publication path.`)
    }

    const allowedRootReleaseScript = manifestPath === 'package.json'
      && allowedRootReleaseScriptNames.has(name)

    if (manifestPath !== 'package.json' && /^(?:publish|release)(?::|$)/.test(name)) {
      problems.push(`${manifestPath} must not expose package-local script "${name}".`)
    }
    else if (releaseScriptNamePattern.test(name) && !allowedRootReleaseScript) {
      problems.push(`${manifestPath} script "${name}" creates another release entry point.`)
    }
  }
}

function normaliseCommand(source) {
  return source
    .replace(/\\\r?\n[\t ]*/g, '')
    .replace(/[\t\r\n ]+/g, ' ')
    .trim()
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExplicitReadOnlyPermissions(value, expected) {
  return hasExactWorkflowValue(value, expected)
}

function hasExactWorkflowValue(value, expected) {
  return serialiseWorkflowStep(value) === serialiseWorkflowStep(expected)
}

function serialiseWorkflowStep(step) {
  return JSON.stringify(normaliseWorkflowValue(step))
}

function normaliseWorkflowValue(value, key) {
  if (typeof value === 'string')
    return key === 'run' ? normaliseCommand(value) : value

  if (Array.isArray(value))
    return value.map(child => normaliseWorkflowValue(child))

  if (!isRecord(value))
    return value

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([childKey, childValue]) => [
        childKey,
        normaliseWorkflowValue(childValue, childKey),
      ]),
  )
}

function formatError(error) {
  return error instanceof Error ? error.message.replace(/\s+/g, ' ').trim() : String(error)
}

async function main() {
  try {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const inputs = await readManualReleasePolicyInputs(repositoryRoot)
    const problems = checkManualReleasePolicy(inputs)

    if (problems.length > 0) {
      throw new Error(
        `Manual release policy check failed:\n${problems.map(problem => `- ${problem}`).join('\n')}`,
      )
    }

    console.log(`Manual publication policy check passed: ${inputs.workflows.length} workflows cannot publish npm packages, create GitHub Releases or publish Docker images automatically.`)
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
