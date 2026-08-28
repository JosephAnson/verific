import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, InjectionKey, MaybeRef, ShallowRef } from 'vue'
import type { IssueNormaliser, MessagePolicy, MessageResolver, ValidationIssue, ValidationIssueContext } from '../messages'
import type { Verific } from '../plugin'
import { computed, getCurrentInstance, getCurrentScope, inject, isRef, onScopeDispose, provide, shallowRef, unref } from 'vue'
import { describeBuiltInIssue } from '../issueNormalisers'
import { resolveIssueMessage } from '../messages'
import { VERIFIC_SYMBOL } from '../utils/constants'
import { unwrapSchema, validateWithStandardSchema } from '../utils/schemaUtils'

export type ValidationFields<Schema extends StandardSchemaV1> = {
  [Key in keyof StandardSchemaV1.InferInput<Schema>]: MaybeRef<StandardSchemaV1.InferInput<Schema>[Key] | undefined>
}

type ValidationInput<Schema extends StandardSchemaV1>
  = StandardSchemaV1.InferInput<Schema> extends object
    ? Partial<StandardSchemaV1.InferInput<Schema>>
    : StandardSchemaV1.InferInput<Schema>

export type ValidationData<Schema extends StandardSchemaV1>
  = | MaybeRef<ValidationInput<Schema>>
    | ValidationFields<Schema>

export type ValidationPath<Schema extends StandardSchemaV1 = StandardSchemaV1>
  = | (StandardSchemaV1.InferInput<Schema> extends object
    ? keyof StandardSchemaV1.InferInput<Schema>
    : PropertyKey)
  | readonly PropertyKey[]

export interface ValidationScopeOptions {
  readonly scope?: 'new'
  readonly messages?: MessageResolver
  readonly messagePrefix?: string
  readonly describeIssue?: IssueNormaliser
}

export interface ValidationOptions extends ValidationScopeOptions {
  readonly at?: readonly PropertyKey[]
}

export type ValidationResult
  = | { readonly success: true, readonly issues: readonly ValidationIssue[] }
    | { readonly success: false, readonly issues: readonly ValidationIssue[] }

export type RegistrationResult<Output>
  = | { readonly status: 'idle' }
    | { readonly status: 'valid', readonly value: Output }
    | { readonly status: 'invalid', readonly issues: readonly ValidationIssue[] }

export interface ValidationGroup<Path = PropertyKey | readonly PropertyKey[]> {
  readonly issues: ComputedRef<readonly ValidationIssue[]>
  readonly errors: ComputedRef<readonly string[]>
  readonly isValidating: ComputedRef<boolean>
  issuesFor: (path: Path) => readonly ValidationIssue[]
  hasError: (path: Path) => boolean
  errorsFor: (path: Path) => readonly string[]
  errorFor: (path: Path) => string | undefined
  validate: () => Promise<ValidationResult>
  validateFor: (path: Path) => Promise<ValidationResult>
}

export interface ValidationController<Schema extends StandardSchemaV1>
  extends ValidationGroup<ValidationPath<Schema>> {
  readonly ownIssues: ComputedRef<readonly ValidationIssue[]>
  readonly result: Readonly<ShallowRef<RegistrationResult<StandardSchemaV1.InferOutput<Schema>>>>
}

interface ScopePolicy {
  readonly messages?: MessageResolver
  readonly messagePrefix?: string
  readonly describeIssue?: IssueNormaliser
}

interface ValidationRegistration {
  readonly schema: MaybeRef<StandardSchemaV1>
  readonly data: unknown
  readonly at: readonly PropertyKey[]
  readonly messagePolicy: MessagePolicy
  readonly normalisers: readonly IssueNormaliser[]
  readonly disposed: CancellationSignal
}

interface CommittedState {
  readonly results: ReadonlyMap<symbol, RegistrationResult<unknown>>
  readonly issues: ReadonlyMap<symbol, readonly ValidationIssue[]>
  readonly failed: boolean
}

interface InternalValidationScope {
  readonly committed: ShallowRef<CommittedState>
  readonly isValidating: ShallowRef<boolean>
  readonly rootPolicy: ScopePolicy
  addValidation: <Schema extends StandardSchemaV1>(
    schema: MaybeRef<Schema>,
    data: ValidationData<Schema>,
    options: ValidationOptions,
    creatingScope: boolean,
  ) => { readonly id: symbol, remove: () => void }
  validate: () => Promise<ValidationResult>
  validateFor: (path: readonly PropertyKey[]) => Promise<ValidationResult>
}

interface CancellationSignal {
  cancel: () => void
  subscribe: (listener: () => void) => () => void
}

type ValidationOutcome
  = | {
    readonly id: symbol
    readonly registration: ValidationRegistration
    readonly status: 'fulfilled'
    readonly result: RegistrationResult<unknown>
  }
  | {
    readonly id: symbol
    readonly registration: ValidationRegistration
    readonly status: 'rejected'
    readonly reason: unknown
  }
  | { readonly status: 'disposed' | 'superseded' }

type CompletedValidationOutcome = Extract<ValidationOutcome, { readonly id: symbol }>
type CancelledValidationOutcome = Exclude<ValidationOutcome, CompletedValidationOutcome>

interface ValidationAuthority {
  readonly signal: CancellationSignal
  readonly promise: Promise<ValidationResult>
  replacement?: Promise<ValidationResult>
}

interface TargetValidationAuthority extends ValidationAuthority {
  readonly path: readonly PropertyKey[]
}

const localScopes = new WeakMap<object, InternalValidationScope>()
const issuePolicies = new WeakMap<ValidationIssue, MessagePolicy>()
const VALIDATION_SCOPE_SYMBOL = Symbol('validation-scope') as InjectionKey<InternalValidationScope>
const IDLE_RESULT = Object.freeze({ status: 'idle' as const })

export function useValidation(options?: ValidationScopeOptions): ValidationGroup
export function useValidation<Schema extends StandardSchemaV1>(
  schema: MaybeRef<Schema>,
  model: ValidationData<Schema>,
  options?: ValidationOptions,
): ValidationController<Schema>
export function useValidation<Schema extends StandardSchemaV1>(
  schemaOrOptions?: MaybeRef<Schema> | ValidationScopeOptions,
  model?: ValidationData<Schema>,
  registrationOptions: ValidationOptions = {},
): ValidationGroup | ValidationController<Schema> {
  const instance = getCurrentInstance()
  if (!instance) {
    throw new Error('useValidation() must be called during component setup')
  }

  const schemaCall = arguments.length >= 2
    || (schemaOrOptions !== undefined && isSchemaReference(schemaOrOptions))
  const options = (schemaCall ? registrationOptions : schemaOrOptions) as ValidationOptions | undefined ?? {}
  const inherited = localScopes.get(instance) ?? inject(VALIDATION_SCOPE_SYMBOL, undefined)
  const createScope = options.scope === 'new' || !inherited

  if (!schemaCall && inherited && !createScope && hasPolicyOptions(options)) {
    throw new Error('Argumentless useValidation() cannot configure an existing scope; use { scope: \'new\' } to create an independent scope')
  }

  const scope = createScope ? provideScope(instance, options) : inherited
  const groupPrefix = schemaCall ? Object.freeze([...(options.at ?? [])]) : Object.freeze([])

  if (!schemaCall) {
    return createGroup<PropertyKey | readonly PropertyKey[]>(scope, groupPrefix)
  }

  const schema = schemaOrOptions as MaybeRef<Schema>
  unwrapSchema(schema)
  const registration = scope.addValidation(schema, model as ValidationData<Schema>, options, createScope)
  if (getCurrentScope()) {
    onScopeDispose(registration.remove)
  }

  const group = createGroup<ValidationPath<Schema>>(scope, groupPrefix)
  const result = computed(() => (scope.committed.value.results.get(registration.id) ?? IDLE_RESULT) as RegistrationResult<StandardSchemaV1.InferOutput<Schema>>)
  const ownIssues = computed(() => scope.committed.value.issues.get(registration.id) ?? [])

  return {
    ...group,
    ownIssues,
    result: result as unknown as Readonly<ShallowRef<RegistrationResult<StandardSchemaV1.InferOutput<Schema>>>>,
  }
}

function provideScope(instance: object, options: ValidationScopeOptions): InternalValidationScope {
  const application = inject(VERIFIC_SYMBOL, undefined)
  const scope = createValidationScope(options, application)
  localScopes.set(instance, scope)
  provide(VALIDATION_SCOPE_SYMBOL, scope)
  return scope
}

function createValidationScope(options: ValidationScopeOptions, application?: Verific): InternalValidationScope {
  const registrations = new Map<symbol, ValidationRegistration>()
  const committed = shallowRef<CommittedState>({ results: new Map(), issues: new Map(), failed: false })
  const isValidating = shallowRef(false)
  const rootPolicy: ScopePolicy = {
    messages: options.messages,
    messagePrefix: options.messagePrefix,
    describeIssue: options.describeIssue,
  }
  const pendingWork = new Set<ValidationAuthority>()
  let activeFull: ValidationAuthority | undefined
  let latestFull: ValidationAuthority | undefined
  const activeTargets: TargetValidationAuthority[] = []

  function addValidation<Schema extends StandardSchemaV1>(
    schema: MaybeRef<Schema>,
    data: ValidationData<Schema>,
    registrationOptions: ValidationOptions,
    creatingScope: boolean,
  ) {
    const id = Symbol('validation')
    const disposed = createCancellationSignal()
    const localMessages = creatingScope ? undefined : registrationOptions.messages
    const localNormaliser = creatingScope ? undefined : registrationOptions.describeIssue
    const registration: ValidationRegistration = {
      schema,
      data,
      at: Object.freeze([...(registrationOptions.at ?? [])]),
      messagePolicy: {
        prefix: creatingScope
          ? rootPolicy.messagePrefix
          : registrationOptions.messagePrefix ?? rootPolicy.messagePrefix,
        resolvers: uniqueValues([
          localMessages,
          rootPolicy.messages,
          application?.options.messages,
        ]),
      },
      normalisers: uniqueValues([
        localNormaliser,
        rootPolicy.describeIssue,
        application?.options.describeIssue,
        describeBuiltInIssue,
      ]),
      disposed,
    }
    registrations.set(id, registration)

    return {
      id,
      remove: () => {
        if (registrations.get(id) !== registration) {
          return
        }
        registrations.delete(id)
        disposed.cancel()
        const results = new Map(committed.value.results)
        const issues = new Map(committed.value.issues)
        results.delete(id)
        issues.delete(id)
        committed.value = {
          results,
          issues,
          failed: [...results.values()].some(result => result.status === 'invalid'),
        }
      },
    }
  }

  function validate(): Promise<ValidationResult> {
    const deferred = createDeferred<ValidationResult>()
    const authority: ValidationAuthority = {
      signal: createCancellationSignal(),
      promise: deferred.promise,
    }
    const previousFull = activeFull
    activeFull = authority
    latestFull = authority
    beginWork(authority)

    if (previousFull) {
      previousFull.replacement = authority.promise
      previousFull.signal.cancel()
      finishWork(previousFull)
    }
    for (const target of [...activeTargets]) {
      target.replacement = projectLatestFull(authority, target.path)
      target.signal.cancel()
      finishWork(target)
      removeActiveTarget(target)
    }

    void runFullValidation(authority).then(deferred.resolve, deferred.reject)
    return authority.promise
  }

  function validateFor(path: readonly PropertyKey[]): Promise<ValidationResult> {
    const resolvedPath = Object.freeze([...path])
    const deferred = createDeferred<ValidationResult>()
    const authority: TargetValidationAuthority = {
      path: resolvedPath,
      signal: createCancellationSignal(),
      promise: deferred.promise,
    }
    const previousTarget = [...activeTargets].reverse().find(target => pathsEqual(target.path, resolvedPath))
    activeTargets.push(authority)
    beginWork(authority)
    if (previousTarget) {
      previousTarget.replacement = authority.promise
      previousTarget.signal.cancel()
      finishWork(previousTarget)
      removeActiveTarget(previousTarget)
    }

    void runTargetValidation(authority).then(deferred.resolve, deferred.reject)
    return authority.promise
  }

  async function runFullValidation(authority: ValidationAuthority): Promise<ValidationResult> {
    try {
      const snapshots = [...registrations.entries()].map(([id, registration]) => ({
        id,
        registration,
        schema: unwrapSchema(registration.schema),
        input: snapshotValidationData(registration.data),
      }))
      const outcomes = await Promise.all(snapshots.map(snapshot => raceValidationOutcome(
        settleValidation(snapshot),
        [
          { signal: snapshot.registration.disposed, outcome: { status: 'disposed' } },
          { signal: authority.signal, outcome: { status: 'superseded' } },
        ],
      )))

      if (authority.replacement) {
        return adoptLatestFull(authority.replacement)
      }

      const activeOutcomes = outcomes.filter(
        (outcome): outcome is CompletedValidationOutcome => 'id' in outcome
          && registrations.get(outcome.id) === outcome.registration,
      )
      const rejection = activeOutcomes.find(outcome => outcome.status === 'rejected')
      if (rejection?.status === 'rejected') {
        throw rejection.reason
      }

      const results = new Map<symbol, RegistrationResult<unknown>>()
      const publishedIssues = new Map<symbol, readonly ValidationIssue[]>()
      for (const [id] of registrations) {
        const outcome = activeOutcomes.find(candidate => candidate.id === id)
        if (outcome?.status === 'fulfilled') {
          results.set(id, outcome.result)
          publishedIssues.set(id, issuesFromResult(outcome.result))
        }
      }
      const failed = [...results.values()].some(result => result.status === 'invalid')
      committed.value = { results, issues: publishedIssues, failed }

      if (authority.replacement) {
        return adoptLatestFull(authority.replacement)
      }
      const issues = collectIssues(committed.value)
      return failed ? { success: false, issues } : { success: true, issues }
    }
    catch (reason) {
      if (authority.replacement) {
        return adoptLatestFull(authority.replacement)
      }
      throw reason
    }
    finally {
      if (activeFull === authority) {
        activeFull = undefined
      }
      finishWork(authority)
    }
  }

  async function runTargetValidation(authority: TargetValidationAuthority): Promise<ValidationResult> {
    try {
      const blockingFull = activeFull
      if (blockingFull) {
        try {
          await blockingFull.promise
        }
        catch {
          // A field request waits for full validation to settle, even when it fails.
        }
      }
      if (authority.replacement) {
        return authority.replacement
      }

      const snapshots = [...registrations.entries()]
        .filter(([, registration]) => pathStartsWith(authority.path, registration.at))
        .map(([id, registration]) => ({
          id,
          registration,
          schema: unwrapSchema(registration.schema),
          input: snapshotValidationData(registration.data),
        }))
      const outcomes = await Promise.all(snapshots.map(snapshot => raceValidationOutcome(
        settleValidation(snapshot),
        [
          { signal: snapshot.registration.disposed, outcome: { status: 'disposed' } },
          { signal: authority.signal, outcome: { status: 'superseded' } },
        ],
      )))

      if (authority.replacement) {
        return authority.replacement
      }

      const activeOutcomes = outcomes.filter(
        (outcome): outcome is CompletedValidationOutcome => 'id' in outcome
          && registrations.get(outcome.id) === outcome.registration,
      )
      const rejection = activeOutcomes.find(outcome => outcome.status === 'rejected')
      if (rejection?.status === 'rejected') {
        throw rejection.reason
      }

      const replacementIssues = new Map<symbol, readonly ValidationIssue[]>()
      for (const outcome of activeOutcomes) {
        if (outcome.status === 'fulfilled') {
          replacementIssues.set(
            outcome.id,
            issuesFromResult(outcome.result).filter(issue => pathsEqual(issue.path, authority.path)),
          )
        }
      }
      const issues = new Map(committed.value.issues)
      const selectedIssues: ValidationIssue[] = []
      for (const [id] of registrations) {
        const replacements = replacementIssues.get(id)
        if (replacements === undefined) {
          continue
        }
        issues.set(id, replaceIssuesAtPath(issues.get(id) ?? [], authority.path, replacements))
        selectedIssues.push(...replacements)
      }
      committed.value = { ...committed.value, issues }

      if (authority.replacement) {
        return authority.replacement
      }
      return selectedIssues.length === 0
        ? { success: true, issues: selectedIssues }
        : { success: false, issues: selectedIssues }
    }
    catch (reason) {
      if (authority.replacement) {
        return authority.replacement
      }
      throw reason
    }
    finally {
      removeActiveTarget(authority)
      finishWork(authority)
    }
  }

  function beginWork(authority: ValidationAuthority): void {
    pendingWork.add(authority)
    isValidating.value = true
  }

  function finishWork(authority: ValidationAuthority): void {
    pendingWork.delete(authority)
    isValidating.value = pendingWork.size > 0
  }

  function removeActiveTarget(authority: TargetValidationAuthority): void {
    const index = activeTargets.indexOf(authority)
    if (index >= 0) {
      activeTargets.splice(index, 1)
    }
  }

  async function adoptLatestFull(validation: Promise<ValidationResult>): Promise<ValidationResult> {
    try {
      return await validation
    }
    catch (reason) {
      const newest = latestFull?.promise
      if (newest && newest !== validation) {
        return newest
      }
      throw reason
    }
  }

  async function projectLatestFull(authority: ValidationAuthority, path: readonly PropertyKey[]): Promise<ValidationResult> {
    try {
      return await projectValidation(authority.promise, path)
    }
    catch (reason) {
      const newest = latestFull
      if (newest && newest !== authority) {
        return projectLatestFull(newest, path)
      }
      throw reason
    }
  }

  async function settleValidation(snapshot: {
    readonly id: symbol
    readonly registration: ValidationRegistration
    readonly schema: StandardSchemaV1
    readonly input: unknown
  }): Promise<CompletedValidationOutcome> {
    try {
      const standardResult = await validateWithStandardSchema(snapshot.schema, snapshot.input)
      if (standardResult.issues !== undefined) {
        const issues = standardResult.issues.map(raw => createValidationIssue(
          raw,
          snapshot.schema['~standard'].vendor,
          snapshot.input,
          snapshot.registration,
        ))
        return {
          id: snapshot.id,
          registration: snapshot.registration,
          status: 'fulfilled',
          result: { status: 'invalid', issues },
        }
      }
      return {
        id: snapshot.id,
        registration: snapshot.registration,
        status: 'fulfilled',
        result: { status: 'valid', value: standardResult.value },
      }
    }
    catch (reason) {
      return { id: snapshot.id, registration: snapshot.registration, status: 'rejected', reason }
    }
  }

  return { committed, isValidating, rootPolicy, addValidation, validate, validateFor }
}

function createGroup<Path>(scope: InternalValidationScope, prefix: readonly PropertyKey[]): ValidationGroup<Path> {
  const issues = computed(() => collectIssues(scope.committed.value))

  function issuesFor(path: Path): readonly ValidationIssue[] {
    const resolved = [...prefix, ...selectorSegments(path)]
    return issues.value.filter(issue => pathsEqual(issue.path, resolved))
  }

  function errorsFor(path: Path): readonly string[] {
    return issuesFor(path).map(resolveMessage)
  }

  return {
    issues,
    errors: computed(() => issues.value.map(resolveMessage)),
    isValidating: computed(() => scope.isValidating.value),
    issuesFor,
    hasError: path => issuesFor(path).length > 0,
    errorsFor,
    errorFor: path => errorsFor(path)[0],
    validate: scope.validate,
    validateFor: path => scope.validateFor([...prefix, ...selectorSegments(path)]),
  }
}

function createValidationIssue(
  raw: StandardSchemaV1.Issue,
  vendor: string,
  input: unknown,
  registration: ValidationRegistration,
): ValidationIssue {
  const localPath = Object.freeze(normalisePath(raw.path))
  const path = Object.freeze([...registration.at, ...localPath])
  const context: ValidationIssueContext = {
    raw,
    vendor,
    message: raw.message,
    localPath,
    path,
    input: resolveInput(input, localPath),
  }
  let semantic
  for (const normaliser of registration.normalisers) {
    semantic = normaliser(context)
    if (semantic !== undefined) {
      break
    }
  }
  const issue: ValidationIssue = semantic === undefined
    ? { raw, vendor, message: raw.message, localPath, path }
    : { raw, vendor, message: raw.message, localPath, path, semantic }
  issuePolicies.set(issue, registration.messagePolicy)
  return issue
}

function resolveMessage(issue: ValidationIssue): string {
  return resolveIssueMessage(issue, issuePolicies.get(issue) ?? { resolvers: [] })
}

function collectIssues(state: CommittedState): readonly ValidationIssue[] {
  return [...state.issues.values()].flatMap(issues => issues)
}

function issuesFromResult(result: RegistrationResult<unknown>): readonly ValidationIssue[] {
  return result.status === 'invalid' ? result.issues : []
}

function replaceIssuesAtPath(
  previous: readonly ValidationIssue[],
  path: readonly PropertyKey[],
  replacements: readonly ValidationIssue[],
): readonly ValidationIssue[] {
  const firstMatch = previous.findIndex(issue => pathsEqual(issue.path, path))
  const retained = previous.filter(issue => !pathsEqual(issue.path, path))
  if (firstMatch < 0) {
    return [...retained, ...replacements]
  }
  const insertionIndex = firstMatch
  return [
    ...retained.slice(0, insertionIndex),
    ...replacements,
    ...retained.slice(insertionIndex),
  ]
}

function pathStartsWith(path: readonly PropertyKey[], prefix: readonly PropertyKey[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => Object.is(segment, path[index]))
}

function projectValidation(validation: Promise<ValidationResult>, path: readonly PropertyKey[]): Promise<ValidationResult> {
  return validation.then((result) => {
    const issues = result.issues.filter(issue => pathsEqual(issue.path, path))
    return issues.length === 0 ? { success: true, issues } : { success: false, issues }
  })
}

function createDeferred<Value>(): {
  readonly promise: Promise<Value>
  readonly resolve: (value: Value | PromiseLike<Value>) => void
  readonly reject: (reason?: unknown) => void
} {
  let resolve!: (value: Value | PromiseLike<Value>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function selectorSegments(path: unknown): readonly PropertyKey[] {
  return Array.isArray(path) ? path : [path as PropertyKey]
}

function normalisePath(path: StandardSchemaV1.Issue['path']): PropertyKey[] {
  return path?.map(segment => typeof segment === 'object' && segment !== null && 'key' in segment
    ? segment.key
    : segment) ?? []
}

function pathsEqual(actual: readonly PropertyKey[], expected: readonly PropertyKey[]): boolean {
  return actual.length === expected.length && actual.every((segment, index) => Object.is(segment, expected[index]))
}

function resolveInput(input: unknown, path: readonly PropertyKey[]): ValidationIssueContext['input'] {
  let value = input
  if (path.length === 0) {
    return { present: true, value }
  }
  for (const segment of path) {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null || !Object.hasOwn(value, segment)) {
      return { present: false, value: undefined }
    }
    value = Reflect.get(value, segment)
  }
  return { present: true, value }
}

function uniqueValues<Value>(values: readonly (Value | undefined)[]): Value[] {
  return [...new Set(values.filter((value): value is Value => value !== undefined))]
}

function hasPolicyOptions(options: ValidationScopeOptions): boolean {
  return options.messages !== undefined
    || options.messagePrefix !== undefined
    || options.describeIssue !== undefined
}

function isSchemaReference(value: unknown): boolean {
  try {
    return unwrapSchema(value as MaybeRef<StandardSchemaV1>) !== undefined
  }
  catch {
    return false
  }
}

function createCancellationSignal(): CancellationSignal {
  const listeners = new Set<() => void>()
  let cancelled = false
  return {
    cancel: () => {
      if (cancelled) {
        return
      }
      cancelled = true
      for (const listener of [...listeners]) {
        listener()
      }
      listeners.clear()
    },
    subscribe: (listener) => {
      if (cancelled) {
        listener()
      }
      else {
        listeners.add(listener)
      }
      return () => listeners.delete(listener)
    },
  }
}

function raceValidationOutcome(
  validation: Promise<CompletedValidationOutcome>,
  cancellations: readonly { readonly signal: CancellationSignal, readonly outcome: CancelledValidationOutcome }[],
): Promise<ValidationOutcome> {
  return new Promise((resolve) => {
    const unsubscribe: Array<() => void> = []
    let completed = false
    const finish = (outcome: ValidationOutcome) => {
      if (completed) {
        return
      }
      completed = true
      unsubscribe.splice(0).forEach(stop => stop())
      resolve(outcome)
    }
    void validation.then(finish)
    for (const cancellation of cancellations) {
      if (completed) {
        break
      }
      unsubscribe.push(cancellation.signal.subscribe(() => finish(cancellation.outcome)))
    }
  })
}

function snapshotValidationData(data: unknown, seen = new WeakMap<object, unknown>()): unknown {
  const value = isRef(data) ? unref(data) : data
  if (typeof value !== 'object' || value === null) {
    return value
  }
  const existingSnapshot = seen.get(value)
  if (existingSnapshot) {
    return existingSnapshot
  }
  if (Array.isArray(value)) {
    const snapshot: unknown[] = []
    seen.set(value, snapshot)
    for (const item of value) {
      snapshot.push(snapshotValidationData(item, seen))
    }
    return snapshot
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return value
  }
  const snapshot: Record<PropertyKey, unknown> = Object.create(prototype)
  seen.set(value, snapshot)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    Reflect.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      value: snapshotValidationData(Reflect.get(value, key), seen),
      writable: true,
    })
  }
  return snapshot
}
