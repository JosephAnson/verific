import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const stableTagFilter = 'v[0-9]+.[0-9]+.[0-9]+'
const releaseCommand = 'gh release create "$GITHUB_REF_NAME" --generate-notes --verify-tag --repo "$GITHUB_REPOSITORY"'
const publishCommand = 'pnpm -r --filter "./packages/**" publish --access public --no-git-checks --provenance'
const githubTokenExpression = ['$', '{{ secrets.GITHUB_TOKEN }}'].join('')
const singleQuote = '\''

const actions = {
  checkout: {
    name: 'actions/checkout',
    reference: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    versionComment: 'v7',
  },
  pnpm: {
    name: 'pnpm/setup',
    reference: 'pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2',
    versionComment: 'v2.0.2',
  },
  node: {
    name: 'actions/setup-node',
    reference: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    versionComment: 'v7',
  },
}

const verifySteps = [
  actionStep('Checkout', actions.checkout, {
    'persist-credentials': 'false',
  }),
  actionStep('Install pnpm', actions.pnpm, {
    install: 'false',
  }),
  actionStep('Set up Node.js', actions.node, {
    'node-version-file': '.node-version',
    'cache': 'pnpm',
  }),
  runStep('Install dependencies', 'pnpm install --frozen-lockfile', 'verify must perform a frozen dependency install.'),
  runStep('Check', 'pnpm check', 'verify must run the complete `pnpm check` quality gate.'),
]

const publishSteps = [
  actionStep('Checkout', actions.checkout, {
    'fetch-depth': '0',
    'persist-credentials': 'false',
  }),
  actionStep('Install pnpm', actions.pnpm, {
    install: 'false',
  }),
  actionStep('Set up Node.js', actions.node, {
    'node-version-file': '.node-version',
    'registry-url': 'https://registry.npmjs.org/',
    'package-manager-cache': 'false',
  }, 'publish-npm setup-node inputs must explicitly disable package-manager caching with `package-manager-cache: false` and must not enable `cache`.'),
  runStep('Install dependencies', 'pnpm install --frozen-lockfile', 'publish-npm must perform a frozen dependency install.'),
  runStep('Verify release version', 'pnpm release:check --publish', 'publish-npm must run `pnpm release:check --publish` before publication.'),
  runStep('Build packages', 'pnpm build', 'publish-npm must build every package before publication.'),
  runStep('Publish packages', publishCommand, 'publish-npm must publish every package under packages/** with explicit provenance.'),
]

const createReleaseSteps = [
  {
    command: releaseCommand,
    env: {
      GH_TOKEN: githubTokenExpression,
    },
    kind: 'run',
    name: 'Create GitHub release',
    problem: 'create-release must contain only the exact audited `gh release create` command.',
  },
]

export function checkPublishWorkflow(source) {
  if (typeof source !== 'string')
    throw new TypeError('Publish workflow source must be a string.')

  const problems = []
  checkRawSafetyRules(source, problems)

  let workflow
  try {
    workflow = parseWorkflowYaml(source)
  }
  catch (error) {
    problems.push(`The workflow could not be parsed by the dependency-free safety checker: ${formatError(error)}`)
  }

  if (workflow !== undefined)
    validateWorkflow(workflow, problems)

  const uniqueProblems = [...new Set(problems)]
  if (uniqueProblems.length > 0) {
    throw new Error(
      `Publish workflow check failed:\n${uniqueProblems.map(problem => `- ${problem}`).join('\n')}`,
    )
  }

  return {
    actionCount: verifySteps.filter(isActionStep).length + publishSteps.filter(isActionStep).length,
    jobCount: 3,
  }
}

function validateWorkflow(workflow, problems) {
  const root = expectMapping(workflow, 'The workflow root', problems)
  if (root === undefined)
    return

  expectExactKeys(root, ['name', 'permissions', 'on', 'concurrency', 'jobs'], 'The workflow root', problems)
  expectScalar(root.name, 'Publish Package', 'The workflow name must remain `Publish Package`.', problems)

  const workflowPermissions = expectMapping(root.permissions, 'Workflow-level permissions', problems)
  if (workflowPermissions !== undefined && Object.keys(workflowPermissions).length !== 0)
    problems.push('Workflow-level permissions must be empty; permissions may only be granted on the job that needs them.')

  validateTrigger(root.on, problems)
  validateConcurrency(root.concurrency, problems)
  validateJobs(root.jobs, problems)
}

function validateTrigger(value, problems) {
  const trigger = expectMapping(value, 'The workflow trigger', problems)
  if (trigger === undefined)
    return

  expectExactKeys(trigger, ['push'], 'The workflow trigger', problems)
  const push = expectMapping(trigger.push, 'The push trigger', problems)
  if (push === undefined)
    return

  expectExactKeys(push, ['tags'], 'The push trigger', problems)
  const tags = expectSequence(push.tags, 'The push tag filters', problems)
  if (tags === undefined)
    return

  if (tags.length !== 1) {
    problems.push(`The push trigger must contain exactly one stable semver tag filter; found ${tags.length}.`)
    return
  }

  expectScalar(
    tags[0],
    stableTagFilter,
    `The push tag filter must be exactly ${JSON.stringify(stableTagFilter)} so broad or prerelease tags cannot start publication.`,
    problems,
  )
}

function validateConcurrency(value, problems) {
  const concurrency = expectMapping(value, 'Release concurrency', problems)
  if (concurrency === undefined)
    return

  expectExactKeys(concurrency, ['group', 'queue', 'cancel-in-progress'], 'Release concurrency', problems)

  const group = scalarValue(concurrency.group)
  if (group === undefined || !/^[\w.-]+$/u.test(group))
    problems.push('Release concurrency must use a fixed, non-expression group name.')

  expectScalar(concurrency.queue, 'max', 'Release concurrency must set `queue: max`.', problems)
  expectScalar(
    concurrency['cancel-in-progress'],
    'false',
    'Release concurrency must set `cancel-in-progress: false` so an active release is never cancelled.',
    problems,
  )
}

function validateJobs(value, problems) {
  const jobs = expectMapping(value, 'The jobs mapping', problems)
  if (jobs === undefined)
    return

  expectExactKeys(jobs, ['verify', 'publish-npm', 'create-release'], 'The jobs mapping', problems)

  validateJob({
    allowedKeys: ['runs-on', 'permissions', 'steps'],
    expectedPermissions: { contents: 'read' },
    id: 'verify',
    job: jobs.verify,
    steps: verifySteps,
  }, problems)
  validateJob({
    allowedKeys: ['needs', 'runs-on', 'environment', 'permissions', 'steps'],
    environment: 'release',
    expectedNeeds: 'verify',
    expectedPermissions: { 'contents': 'read', 'id-token': 'write' },
    id: 'publish-npm',
    job: jobs['publish-npm'],
    steps: publishSteps,
  }, problems)
  validateJob({
    allowedKeys: ['needs', 'runs-on', 'permissions', 'steps'],
    expectedNeeds: 'publish-npm',
    expectedPermissions: { contents: 'write' },
    id: 'create-release',
    job: jobs['create-release'],
    steps: createReleaseSteps,
  }, problems)
}

function validateJob(options, problems) {
  const job = expectMapping(options.job, `Job ${options.id}`, problems)
  if (job === undefined)
    return

  expectExactKeys(job, options.allowedKeys, `Job ${options.id}`, problems)
  expectScalar(job['runs-on'], 'ubuntu-latest', `Job ${options.id} must run on ubuntu-latest.`, problems)

  if (options.expectedNeeds !== undefined) {
    expectScalar(
      job.needs,
      options.expectedNeeds,
      `Job ${options.id} must depend directly on ${options.expectedNeeds} so release operations cannot run out of order.`,
      problems,
    )
  }

  if (options.environment !== undefined) {
    expectScalar(
      job.environment,
      options.environment,
      'Job publish-npm must use the protected `release` environment.',
      problems,
    )
  }

  validateExactScalarMapping(
    job.permissions,
    options.expectedPermissions,
    `Job ${options.id} permissions`,
    'Each job must declare only its required permissions.',
    problems,
  )
  validateSteps(options.id, job.steps, options.steps, problems)
}

function validateSteps(jobId, value, expectedSteps, problems) {
  const steps = expectSequence(value, `Steps for job ${jobId}`, problems)
  if (steps === undefined)
    return

  if (steps.length !== expectedSteps.length) {
    problems.push(
      `Job ${jobId} must contain exactly ${expectedSteps.length} audited step${expectedSteps.length === 1 ? '' : 's'}; found ${steps.length}.`,
    )
  }

  validateActionAllowlist(jobId, steps, expectedSteps, problems)

  for (const [index, expectedStep] of expectedSteps.entries()) {
    const step = expectMapping(steps[index], `Step ${index + 1} of job ${jobId}`, problems)
    if (step === undefined)
      continue

    if (expectedStep.kind === 'action')
      validateActionStep(jobId, index, step, expectedStep, problems)
    else
      validateRunStep(jobId, index, step, expectedStep, problems)
  }
}

function validateActionAllowlist(jobId, steps, expectedSteps, problems) {
  const allowedActions = new Set(
    expectedSteps.filter(isActionStep).map(step => step.action.name),
  )

  for (const step of steps) {
    if (!isMapping(step) || !Object.hasOwn(step, 'uses'))
      continue

    const reference = scalarValue(step.uses)
    const actionName = typeof reference === 'string' ? reference.split('@', 1)[0] : undefined
    if (actionName === undefined || !allowedActions.has(actionName)) {
      problems.push(
        `Job ${jobId} uses ${formatValue(reference)}, which is not in that job's Action allowlist.`,
      )
    }
  }
}

function validateActionStep(jobId, index, step, expectedStep, problems) {
  const label = `Action step ${index + 1} of job ${jobId}`
  expectExactKeys(step, ['name', 'uses', 'with'], label, problems)
  expectScalar(step.name, expectedStep.name, `${label} must be named ${JSON.stringify(expectedStep.name)}.`, problems)

  const reference = scalarValue(step.uses)
  if (typeof reference !== 'string' || !/^[^@\s]+@[0-9a-f]{40}$/.test(reference)) {
    problems.push(`${label} must pin ${expectedStep.action.name} to a full 40-character commit SHA.`)
  }
  else if (reference !== expectedStep.action.reference) {
    problems.push(`${label} must use the verified pin ${expectedStep.action.reference}; received ${JSON.stringify(reference)}.`)
  }

  if (isScalar(step.uses) && step.uses.comment !== expectedStep.action.versionComment) {
    problems.push(
      `${label} must retain the exact version comment "# ${expectedStep.action.versionComment}" beside its pinned Action.`,
    )
  }

  validateExactScalarMapping(
    step.with,
    expectedStep.with,
    `${label} inputs`,
    expectedStep.inputProblem ?? (expectedStep.action.name === actions.checkout.name
      ? `${label} must set checkout inputs exactly, including persist-credentials: false.`
      : `${label} must use only the audited setup inputs.`),
    problems,
  )
}

function validateRunStep(jobId, index, step, expectedStep, problems) {
  const label = `Command step ${index + 1} of job ${jobId}`
  const allowedKeys = expectedStep.env === undefined ? ['name', 'run'] : ['name', 'run', 'env']
  expectExactKeys(step, allowedKeys, label, problems)
  expectScalar(step.name, expectedStep.name, `${label} must be named ${JSON.stringify(expectedStep.name)}.`, problems)
  expectScalar(step.run, expectedStep.command, expectedStep.problem, problems)

  if (expectedStep.env !== undefined) {
    validateExactScalarMapping(
      step.env,
      expectedStep.env,
      `${label} environment`,
      `create-release must set exactly \`GH_TOKEN: ${githubTokenExpression}\` and no other environment values.`,
      problems,
    )
  }
}

function validateExactScalarMapping(value, expected, label, mismatchProblem, problems) {
  const mapping = expectMapping(value, label, problems)
  if (mapping === undefined)
    return

  const expectedKeys = Object.keys(expected)
  const actualKeys = Object.keys(mapping)
  const hasExactKeys = expectedKeys.length === actualKeys.length
    && expectedKeys.every(key => actualKeys.includes(key))
  const hasExactValues = hasExactKeys
    && expectedKeys.every(key => scalarValue(mapping[key]) === expected[key])

  if (!hasExactValues)
    problems.push(mismatchProblem)
}

function expectExactKeys(mapping, expectedKeys, label, problems) {
  if (!isMapping(mapping)) {
    if (mapping === undefined)
      problems.push(`${label} is missing.`)
    return
  }

  const actualKeys = Object.keys(mapping)
  for (const key of expectedKeys) {
    if (!actualKeys.includes(key))
      problems.push(`${label} must define ${JSON.stringify(key)}.`)
  }
  for (const key of actualKeys) {
    if (!expectedKeys.includes(key))
      problems.push(`${label} contains unsupported key ${JSON.stringify(key)}.`)
  }
}

function expectMapping(value, label, problems) {
  if (isMapping(value))
    return value

  if (value === undefined)
    problems.push(`${label} is missing.`)
  else
    problems.push(`${label} must be a mapping.`)
}

function expectSequence(value, label, problems) {
  if (Array.isArray(value))
    return value

  if (value === undefined)
    problems.push(`${label} is missing.`)
  else
    problems.push(`${label} must be a sequence.`)
}

function expectScalar(value, expected, problem, problems) {
  if (scalarValue(value) !== expected)
    problems.push(problem)
}

function scalarValue(value) {
  return isScalar(value) ? value.value : undefined
}

function isScalar(value) {
  return value !== null && typeof value === 'object' && value.type === 'scalar'
}

function isMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !isScalar(value)
}

function isActionStep(step) {
  return step.kind === 'action'
}

function actionStep(name, action, withInputs, inputProblem) {
  return { action, inputProblem, kind: 'action', name, with: withInputs }
}

function runStep(name, command, problem) {
  return { command, kind: 'run', name, problem }
}

function checkRawSafetyRules(source, problems) {
  const uncommentedSource = source
    .split(/\r?\n/u)
    .map(line => splitYamlComment(line).content)
    .join('\n')

  if (/^\s*(?:shell|'shell'|"shell")\s*:/mu.test(uncommentedSource))
    problems.push('Custom `shell:` overrides are forbidden, whether their values are quoted or unquoted.')

  if (/^\s*(?:continue-on-error|'continue-on-error'|"continue-on-error")\s*:/mu.test(uncommentedSource))
    problems.push('`continue-on-error` is forbidden because release failures must remain visible.')

  if (/^\s*(?:if|'if'|"if")\s*:/mu.test(uncommentedSource))
    problems.push('Conditional job or step execution is forbidden in the release workflow.')

  if (/\b(?:NODE_AUTH_TOKEN|NPM_TOKEN)\b|_authToken|npm-token/iu.test(uncommentedSource))
    problems.push('Long-lived npm token fallbacks, including NODE_AUTH_TOKEN and NPM_TOKEN, are forbidden.')
}

function parseWorkflowYaml(source) {
  const records = tokeniseYaml(source)
  if (records.length === 0)
    throw new Error('the file is empty')
  if (records[0].indent !== 0)
    throw new Error(`line ${records[0].line} must start at indentation zero`)

  const parsed = parseBlock(records, 0, 0)
  if (parsed.nextIndex !== records.length)
    throw new Error(`line ${records[parsed.nextIndex].line} has unexpected indentation`)

  return parsed.value
}

function tokeniseYaml(source) {
  const records = []
  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    if (rawLine.includes('\t'))
      throw new Error(`line ${index + 1} contains a tab`)

    const firstContentIndex = rawLine.search(/\S/u)
    if (firstContentIndex === -1)
      continue
    if (firstContentIndex % 2 !== 0)
      throw new Error(`line ${index + 1} must use two-space indentation`)

    const split = splitYamlComment(rawLine.slice(firstContentIndex))
    const content = split.content.trimEnd()
    if (content.length === 0)
      continue

    records.push({
      comment: split.comment,
      content,
      indent: firstContentIndex,
      line: index + 1,
    })
  }
  return records
}

function splitYamlComment(value) {
  let quote
  let escaped = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if (quote === '"') {
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\') {
        escaped = true
        continue
      }
      if (character === '"')
        quote = undefined
      continue
    }

    if (quote === singleQuote) {
      if (character === singleQuote && value[index + 1] === singleQuote) {
        index += 1
        continue
      }
      if (character === singleQuote)
        quote = undefined
      continue
    }

    if (character === '"' || character === singleQuote) {
      quote = character
      continue
    }

    if (character === '#' && (index === 0 || /\s/u.test(value[index - 1]))) {
      return {
        comment: value.slice(index + 1).trim(),
        content: value.slice(0, index),
      }
    }
  }

  return { comment: undefined, content: value }
}

function parseBlock(records, startIndex, indent) {
  const firstRecord = records[startIndex]
  if (firstRecord === undefined || firstRecord.indent !== indent)
    throw new Error(`expected a value at indentation ${indent}`)

  return firstRecord.content === '-' || firstRecord.content.startsWith('- ')
    ? parseSequence(records, startIndex, indent)
    : parseMapping(records, startIndex, indent)
}

function parseMapping(records, startIndex, indent) {
  const mapping = Object.create(null)
  let index = startIndex

  while (index < records.length) {
    const record = records[index]
    if (record.indent < indent)
      break
    if (record.indent > indent)
      throw new Error(`line ${record.line} has unexpected indentation`)
    if (record.content === '-' || record.content.startsWith('- '))
      throw new Error(`line ${record.line} mixes a sequence into a mapping`)

    const entry = parseMappingEntry(record)
    if (Object.hasOwn(mapping, entry.key))
      throw new Error(`line ${record.line} duplicates key ${JSON.stringify(entry.key)}`)

    index += 1
    if (entry.rawValue.length > 0) {
      mapping[entry.key] = parseInlineValue(entry.rawValue, record)
      continue
    }

    const child = records[index]
    if (child === undefined || child.indent <= indent)
      throw new Error(`line ${record.line} does not provide a value for ${JSON.stringify(entry.key)}`)
    if (child.indent !== indent + 2)
      throw new Error(`line ${child.line} must be indented two spaces below ${JSON.stringify(entry.key)}`)

    const parsedChild = parseBlock(records, index, indent + 2)
    mapping[entry.key] = parsedChild.value
    index = parsedChild.nextIndex
  }

  return { nextIndex: index, value: mapping }
}

function parseSequence(records, startIndex, indent) {
  const sequence = []
  let index = startIndex

  while (index < records.length) {
    const record = records[index]
    if (record.indent < indent)
      break
    if (record.indent > indent)
      throw new Error(`line ${record.line} has unexpected indentation`)
    if (!(record.content === '-' || record.content.startsWith('- ')))
      break

    const itemText = record.content === '-' ? '' : record.content.slice(2)
    if (itemText.length === 0)
      throw new Error(`line ${record.line} uses an unsupported empty sequence item`)

    const firstEntry = tryParseMappingEntry(itemText)
    if (firstEntry === undefined) {
      sequence.push(parseInlineValue(itemText, record))
      index += 1
      if (records[index]?.indent > indent)
        throw new Error(`line ${records[index].line} cannot be nested below a scalar sequence item`)
      continue
    }

    const item = Object.create(null)
    index += 1
    if (firstEntry.rawValue.length > 0) {
      item[firstEntry.key] = parseInlineValue(firstEntry.rawValue, record)
    }
    else {
      const child = records[index]
      if (child === undefined || child.indent !== indent + 4)
        throw new Error(`line ${record.line} does not provide a nested value for ${JSON.stringify(firstEntry.key)}`)
      const parsedChild = parseBlock(records, index, indent + 4)
      item[firstEntry.key] = parsedChild.value
      index = parsedChild.nextIndex
    }

    if (records[index]?.indent === indent + 2) {
      const remaining = parseMapping(records, index, indent + 2)
      for (const [key, value] of Object.entries(remaining.value)) {
        if (Object.hasOwn(item, key))
          throw new Error(`line ${records[index].line} duplicates key ${JSON.stringify(key)}`)
        item[key] = value
      }
      index = remaining.nextIndex
    }
    else if (records[index]?.indent > indent) {
      throw new Error(`line ${records[index].line} has unexpected indentation in a sequence item`)
    }

    sequence.push(item)
  }

  return { nextIndex: index, value: sequence }
}

function parseMappingEntry(record) {
  const entry = tryParseMappingEntry(record.content)
  if (entry === undefined)
    throw new Error(`line ${record.line} must use a plain mapping key followed by a colon`)
  return entry
}

function tryParseMappingEntry(content) {
  const colonIndex = content.indexOf(':')
  if (colonIndex <= 0)
    return undefined

  const key = content.slice(0, colonIndex)
  const remainder = content.slice(colonIndex + 1)
  if (!/^[\w-]+$/u.test(key) || (remainder.length > 0 && !remainder.startsWith(' ')))
    return undefined

  return { key, rawValue: remainder.trimStart() }
}

function parseInlineValue(rawValue, record) {
  if (rawValue === '{}')
    return Object.create(null)
  if (rawValue === '[]')
    return []

  let value = rawValue
  if (rawValue.startsWith(singleQuote)) {
    if (!rawValue.endsWith(singleQuote) || rawValue.length < 2)
      throw new Error(`line ${record.line} has an unterminated single-quoted scalar`)
    value = rawValue.slice(1, -1).replaceAll(singleQuote.repeat(2), singleQuote)
  }
  else if (rawValue.startsWith('"')) {
    try {
      value = JSON.parse(rawValue)
    }
    catch {
      throw new Error(`line ${record.line} has an invalid double-quoted scalar`)
    }
  }

  return {
    comment: record.comment,
    line: record.line,
    type: 'scalar',
    value,
  }
}

function formatValue(value) {
  return JSON.stringify(value) ?? String(value)
}

function formatError(error) {
  return error instanceof Error ? error.message : formatValue(error)
}

async function main() {
  try {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const workflowPath = resolve(repositoryRoot, '.github/workflows/publish.yml')
    const result = checkPublishWorkflow(await readFile(workflowPath, 'utf8'))
    console.log(
      `Publish workflow check passed: ${result.jobCount} ordered jobs and ${result.actionCount} pinned Action uses satisfy the release contract.`,
    )
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
