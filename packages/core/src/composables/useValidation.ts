import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, EffectScope, InjectionKey, MaybeRef, ShallowRef } from 'vue'
import type { IssueNormaliser, MessagePolicy, MessageResolver, ValidationIssue, ValidationIssueContext } from '../messages'
import type { Verific } from '../plugin'
import { computed, customRef, effect, effectScope, getCurrentInstance, getCurrentScope, inject, isRef, onScopeDispose, provide, readonly, shallowRef, unref } from 'vue'
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

type ObjectTopLevelKey<Input> = Input extends object ? keyof Input : never

type ValidationTopLevelKey<Input>
  = [Extract<Input, object>] extends [never] ? PropertyKey : ObjectTopLevelKey<Input>

export type ValidationPath<Schema extends StandardSchemaV1 = StandardSchemaV1>
  = | ValidationTopLevelKey<StandardSchemaV1.InferInput<Schema>>
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

export interface TargetValidationResult {
  readonly issues: readonly ValidationIssue[]
}

export type RegistrationResult<Output>
  = | { readonly status: 'idle' }
    | { readonly status: 'valid', readonly value: Output }
    | { readonly status: 'invalid', readonly issues: readonly ValidationIssue[] }

export interface ValidationState {
  readonly dirty: boolean
  readonly touched: boolean
  readonly validated: boolean
  readonly stale: boolean
  readonly validating: boolean
}

export interface ValidationGroup<Path = PropertyKey | readonly PropertyKey[]> {
  readonly issues: ComputedRef<readonly ValidationIssue[]>
  readonly errors: ComputedRef<readonly string[]>
  readonly isValidating: ComputedRef<boolean>
  readonly state: ComputedRef<ValidationState>
  issuesFor: (path: Path) => readonly ValidationIssue[]
  hasError: (path: Path) => boolean
  errorsFor: (path: Path) => readonly string[]
  errorFor: (path: Path) => string | undefined
  stateFor: (path: Path) => ValidationState
  touch: (path: Path) => void
  resetState: () => void
  validate: () => Promise<ValidationResult>
  validateAt: (path: Path) => Promise<TargetValidationResult>
  /** @deprecated Use validateAt() instead. */
  validateFor: (path: Path) => Promise<TargetValidationResult>
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
  baseline: unknown
  readonly touched: Array<readonly PropertyKey[]>
}

interface ValidationSnapshot {
  readonly id: symbol
  readonly registration: ValidationRegistration
  readonly schema: StandardSchemaV1
  readonly input: unknown
}

interface ValidationStamp {
  readonly snapshots: readonly ValidationSnapshot[]
}

interface ExactValidationStamp extends ValidationStamp {
  readonly path: readonly PropertyKey[]
}

interface CommittedState {
  readonly results: ReadonlyMap<symbol, RegistrationResult<unknown>>
  readonly issues: ReadonlyMap<symbol, readonly ValidationIssue[]>
  readonly failed: boolean
}

interface PublishedValidationState {
  readonly committed: CommittedState
  readonly isValidating: boolean
}

interface InternalValidationScope {
  readonly committed: ComputedRef<CommittedState>
  readonly isValidating: ComputedRef<boolean>
  readonly rootPolicy: ScopePolicy
  addValidation: <Schema extends StandardSchemaV1>(
    schema: MaybeRef<Schema>,
    data: ValidationData<Schema>,
    options: ValidationOptions,
    creatingScope: boolean,
  ) => { readonly id: symbol, remove: () => void }
  readonly state: ComputedRef<ValidationState>
  stateFor: (path: readonly PropertyKey[]) => ValidationState
  touch: (path: readonly PropertyKey[]) => void
  resetState: () => void
  validate: () => Promise<ValidationResult>
  validateAt: (path: readonly PropertyKey[]) => Promise<TargetValidationResult>
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

interface ValidationWork {
  readonly signal: CancellationSignal
  abortReason?: Error
}

interface Deferred<Value> {
  readonly promise: Promise<Value>
  readonly resolve: (value: Value | PromiseLike<Value>) => void
  readonly reject: (reason?: unknown) => void
}

interface ResetCapture {
  readonly blockedValidations: Array<(reason: unknown) => void>
  readonly aggregateState: ValidationState
  readonly observedSnapshots: readonly ValidationSnapshot[]
  phase: 'capture' | 'commit'
}

interface ValidationAuthority extends ValidationWork {
  readonly promise: Promise<ValidationResult>
  snapshots?: readonly ValidationSnapshot[]
  replacement?: Promise<ValidationResult>
}

interface TargetValidationAuthority extends ValidationWork {
  readonly path: readonly PropertyKey[]
  readonly promise: Promise<TargetValidationResult>
  replacement?: Promise<TargetValidationResult>
}

const localScopes = new WeakMap<object, InternalValidationScope>()
const issuePolicies = new WeakMap<ValidationIssue, MessagePolicy>()
const VALIDATION_SCOPE_SYMBOL = Symbol('validation-scope') as InjectionKey<InternalValidationScope>
const IDLE_RESULT = Object.freeze({ status: 'idle' as const })
const UNCAPTURED_BASELINE = Symbol('uncaptured-baseline')

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
  const published = shallowRef<PublishedValidationState>({
    committed: { results: new Map(), issues: new Map(), failed: false },
    isValidating: false,
  })
  const committed = computed(() => published.value.committed)
  const isValidating = computed(() => published.value.isValidating)
  const stateRevision = shallowRef(0)
  const rootPolicy: ScopePolicy = {
    messages: options.messages,
    messagePrefix: options.messagePrefix,
    describeIssue: options.describeIssue,
  }
  const pendingWork = new Set<ValidationWork>()
  const unsettledWork = new Set<ValidationWork>()
  let activeFull: ValidationAuthority | undefined
  let latestFull: ValidationAuthority | undefined
  const activeTargets: TargetValidationAuthority[] = []
  let fullStamp: ValidationStamp | undefined
  const exactStamps: ExactValidationStamp[] = []
  let lastAggregateState: ValidationState | undefined
  const lastObservedSnapshots = new Map<symbol, ValidationSnapshot>()
  const stateObservers = new Map<symbol, EffectScope>()
  const latestTargets: TargetValidationAuthority[] = []
  let resetCapture: ResetCapture | undefined
  const suppressedAccessorCaptures = new Set<ValidationRegistration>()
  const state = readonly(customRef<ValidationState>(track => ({
    get() {
      track()
      return readAggregateState()
    },
    /* v8 ignore next -- customRef requires a setter; the public state ref is readonly. */
    set() {},
  }))) as ComputedRef<ValidationState>

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
      // Preserve the existing invariant that registration does not invoke model accessors.
      // The first successful state or validation capture establishes that exceptional baseline.
      baseline: containsAccessor(data) ? UNCAPTURED_BASELINE : snapshotValidationData(data),
      touched: [],
    }
    registrations.set(id, registration)
    if (registration.baseline === UNCAPTURED_BASELINE) {
      suppressedAccessorCaptures.add(registration)
    }
    try {
      invalidateState()
    }
    catch (reason) {
      registrations.delete(id)
      lastObservedSnapshots.delete(id)
      stopStateObserver(id)
      disposed.cancel()
      safelyInvalidateState()
      throw reason
    }
    finally {
      suppressedAccessorCaptures.delete(registration)
    }

    if (registration.baseline === UNCAPTURED_BASELINE && stateObservers.has(id)) {
      queueMicrotask(() => {
        if (registrations.get(id) === registration
          && registration.baseline === UNCAPTURED_BASELINE
          && stateObservers.has(id)) {
          safelyInvalidateState()
        }
      })
    }

    return {
      id,
      remove: () => {
        if (registrations.get(id) !== registration) {
          return
        }
        registrations.delete(id)
        lastObservedSnapshots.delete(id)
        stopStateObserver(id)
        disposed.cancel()
        const results = new Map(committed.value.results)
        const issues = new Map(committed.value.issues)
        results.delete(id)
        issues.delete(id)
        safelyPublishCommitted({
          results,
          issues,
          failed: [...results.values()].some(result => result.status === 'invalid'),
        })
      },
    }
  }

  function readAggregateState(): ValidationState {
    void stateRevision.value
    if (resetCapture?.phase === 'capture') {
      return resetCapture.aggregateState
    }
    const currentSnapshots = [...registrations.entries()].map(([id, registration]) => currentSnapshot(id, registration))
    rememberSnapshots(currentSnapshots)
    initialiseDeferredBaselines(currentSnapshots)
    const dirty = currentSnapshots.some(snapshot => !structurallyEqual(snapshot.input, snapshot.registration.baseline))
    const touched = currentSnapshots.some(snapshot => snapshot.registration.touched.length > 0)
    const validated = fullStamp !== undefined
    const stale = fullStamp !== undefined && !stampsEqual(fullStamp.snapshots, currentSnapshots)
    const next = createState(dirty, touched, validated, stale, pendingWork.size > 0)
    if (lastAggregateState === undefined || !validationStatesEqual(lastAggregateState, next)) {
      lastAggregateState = next
    }
    return lastAggregateState
  }

  function stateFor(path: readonly PropertyKey[]): ValidationState {
    void stateRevision.value
    if (resetCapture?.phase === 'capture') {
      return readCapturedPathState(path, resetCapture.observedSnapshots)
    }
    const matching = [...registrations.entries()]
      .filter(([, registration]) => pathStartsWith(path, registration.at))
      .map(([id, registration]) => currentSnapshot(id, registration))
    rememberSnapshots(matching)
    initialiseDeferredBaselines(matching)
    const dirty = matching.some((snapshot) => {
      const localPath = path.slice(snapshot.registration.at.length)
      return !resolvedInputsEqual(
        resolveInput(snapshot.input, localPath),
        resolveInput(snapshot.registration.baseline, localPath),
      )
    })
    const touched = matching.some(snapshot => snapshot.registration.touched.some(touchedPath => pathsEqual(touchedPath, path)))
    const stamp = [...exactStamps].reverse().find(candidate => pathsEqual(candidate.path, path)) ?? fullStamp
    const stampedSnapshots = stamp?.snapshots.filter(snapshot => pathStartsWith(path, snapshot.registration.at)) ?? []
    const validated = stampedSnapshots.length > 0
    const stale = validated && !stampsEqual(stampedSnapshots, matching)
    const activeFullSnapshots = activeFull?.snapshots
    const validating = activeTargets.some(target => pathsEqual(target.path, path))
      || (activeFull !== undefined && (activeFullSnapshots === undefined
        ? matching.length > 0
        : activeFullSnapshots.some(snapshot => registrations.get(snapshot.id) === snapshot.registration
          && pathStartsWith(path, snapshot.registration.at))))
    return createState(dirty, touched, validated, stale, validating)
  }

  function readCapturedPathState(
    path: readonly PropertyKey[],
    observedSnapshots: readonly ValidationSnapshot[],
  ): ValidationState {
    const matching = [...registrations.entries()].filter(([, registration]) => pathStartsWith(path, registration.at))
    const currentSnapshots = matching.flatMap(([id, registration]) => {
      const snapshot = observedSnapshots.find(candidate => candidate.id === id && candidate.registration === registration)
      return snapshot ? [snapshot] : []
    })
    const dirty = currentSnapshots.some((snapshot) => {
      const localPath = path.slice(snapshot.registration.at.length)
      return !resolvedInputsEqual(
        resolveInput(snapshot.input, localPath),
        resolveInput(snapshot.registration.baseline, localPath),
      )
    })
    const touched = matching.some(([, registration]) => registration.touched.some(touchedPath => pathsEqual(touchedPath, path)))
    const stamp = [...exactStamps].reverse().find(candidate => pathsEqual(candidate.path, path)) ?? fullStamp
    const stampedSnapshots = stamp?.snapshots.filter(snapshot => matching.some(
      ([id, registration]) => snapshot.id === id && snapshot.registration === registration,
    )) ?? []
    const validated = stampedSnapshots.length > 0
    const stale = validated && (currentSnapshots.length !== matching.length
      || !stampsEqual(stampedSnapshots, currentSnapshots))
    const activeFullSnapshots = activeFull?.snapshots
    const validating = activeTargets.some(target => pathsEqual(target.path, path))
      || (activeFull !== undefined && (activeFullSnapshots === undefined
        ? matching.length > 0
        : activeFullSnapshots.some(snapshot => pathStartsWith(path, snapshot.registration.at)
          && matching.some(([id, registration]) => id === snapshot.id
            && registration === snapshot.registration))))
    return createState(dirty, touched, validated, stale, validating)
  }

  function touch(path: readonly PropertyKey[]): void {
    if (resetCapture) {
      return
    }
    let changed = false
    for (const registration of registrations.values()) {
      if (!pathStartsWith(path, registration.at)
        || registration.touched.some(touchedPath => pathsEqual(touchedPath, path))) {
        continue
      }
      registration.touched.push(Object.freeze([...path]))
      changed = true
    }
    if (changed) {
      safelyInvalidateState()
    }
  }

  function resetState(): void {
    if (resetCapture) {
      return
    }

    const capture: ResetCapture = {
      aggregateState: lastAggregateState ?? createState(
        false,
        [...registrations.values()].some(registration => registration.touched.length > 0),
        fullStamp !== undefined,
        false,
        pendingWork.size > 0,
      ),
      blockedValidations: [],
      observedSnapshots: [...lastObservedSnapshots.values()],
      phase: 'capture',
    }
    resetCapture = capture
    let baselines: Array<{
      readonly id: symbol
      readonly registration: ValidationRegistration
      readonly input: unknown
    }>
    try {
      baselines = [...registrations.entries()].map(([id, registration]) => ({
        id,
        registration,
        input: snapshotValidationData(registration.data),
      }))
    }
    catch (reason) {
      rejectBlockedValidations(capture, reason)
      resetCapture = undefined
      safelyInvalidateState()
      throw reason
    }

    const abortReason = createResetAbortError()
    rejectBlockedValidations(capture, abortReason)

    for (const baseline of baselines) {
      if (registrations.get(baseline.id) === baseline.registration) {
        baseline.registration.baseline = baseline.input
        baseline.registration.touched.splice(0)
      }
    }
    fullStamp = undefined
    exactStamps.splice(0)

    for (const work of [...unsettledWork]) {
      work.abortReason = abortReason
      work.signal.cancel()
    }
    pendingWork.clear()
    unsettledWork.clear()
    activeFull = undefined
    latestFull = undefined
    activeTargets.splice(0)
    latestTargets.splice(0)

    capture.phase = 'commit'
    try {
      published.value = {
        committed: { results: new Map(), issues: new Map(), failed: false },
        isValidating: false,
      }
    }
    catch {
      // Synchronous observers cannot change whether a successful reset commits.
    }
    rejectBlockedValidations(capture, abortReason)
    resetCapture = undefined
    lastAggregateState = undefined
    lastObservedSnapshots.clear()
    safelyInvalidateState()
  }

  function validate(): Promise<ValidationResult> {
    if (resetCapture) {
      return blockValidationDuringReset<ValidationResult>(resetCapture)
    }
    const deferred = createDeferred<ValidationResult>()
    const authority: ValidationAuthority = {
      signal: createCancellationSignal(),
      promise: deferred.promise,
    }
    const previousFull = activeFull
    const previousLatestFull = latestFull
    activeFull = authority
    latestFull = authority
    try {
      beginWork(authority)
    }
    catch (reason) {
      if (activeFull === authority) {
        activeFull = previousFull
      }
      if (latestFull === authority) {
        latestFull = previousLatestFull
      }
      finishWork(authority)
      if (authority.abortReason) {
        unsettledWork.delete(authority)
        deferred.reject(authority.abortReason)
      }
      else if (authority.replacement) {
        supersedeFullAuthority(previousFull, authority.promise)
        deliverValidation(authority, adoptLatestFull(authority, authority.replacement), deferred)
      }
      else {
        unsettledWork.delete(authority)
        deferred.reject(reason)
      }
      return authority.promise
    }

    supersedeFullAuthority(previousFull, authority.promise)
    for (const target of [...activeTargets]) {
      const replacement = projectLatestFull(authority, target.path)
      // Reset can abort the target before it adopts this internal projection.
      // Observe rejection without changing the original promise's authority.
      void replacement.catch(() => {})
      target.replacement = replacement
      target.signal.cancel()
      finishWork(target)
      removeActiveTarget(target)
    }

    deliverValidation(authority, runFullValidation(authority), deferred)
    return authority.promise
  }

  function validateAt(path: readonly PropertyKey[]): Promise<TargetValidationResult> {
    if (resetCapture) {
      return blockValidationDuringReset<TargetValidationResult>(resetCapture)
    }
    const resolvedPath = Object.freeze([...path])
    const deferred = createDeferred<TargetValidationResult>()
    const authority: TargetValidationAuthority = {
      path: resolvedPath,
      signal: createCancellationSignal(),
      promise: deferred.promise,
    }
    const previousActiveTarget = [...activeTargets].reverse().find(target => pathsEqual(target.path, resolvedPath))
    const previousLatestTarget = latestTargetFor(resolvedPath)
    activeTargets.push(authority)
    setLatestTarget(authority)
    try {
      beginWork(authority)
    }
    catch (reason) {
      removeActiveTarget(authority)
      finishWork(authority)
      if (authority.abortReason) {
        unsettledWork.delete(authority)
        releaseLatestTarget(authority.path)
        deferred.reject(authority.abortReason)
      }
      else if (authority.replacement) {
        supersedeTargetAuthority(previousActiveTarget, authority.promise)
        deliverValidation(authority, adoptTargetReplacement(authority, authority.replacement), deferred)
      }
      else {
        if (latestTargetFor(authority.path) === authority
          && previousLatestTarget) {
          setLatestTarget(previousLatestTarget)
        }
        unsettledWork.delete(authority)
        releaseLatestTarget(authority.path)
        deferred.reject(reason)
      }
      return authority.promise
    }
    supersedeTargetAuthority(previousActiveTarget, authority.promise)

    deliverValidation(authority, runTargetValidation(authority), deferred)
    return authority.promise
  }

  async function runFullValidation(authority: ValidationAuthority): Promise<ValidationResult> {
    try {
      const snapshots: ValidationSnapshot[] = [...registrations.entries()].map(([id, registration]) => ({
        id,
        registration,
        schema: unwrapSchema(registration.schema),
        input: snapshotValidationData(registration.data),
      }))
      rememberSnapshots(snapshots)
      initialiseDeferredBaselines(snapshots)
      const stampSnapshots = snapshots.map(snapshotForStamp)
      authority.snapshots = snapshots
      safelyInvalidateState()
      const outcomes = await Promise.all(snapshots.map(snapshot => raceValidationOutcome(
        settleValidation(snapshot),
        [
          { signal: snapshot.registration.disposed, outcome: { status: 'disposed' } },
          { signal: authority.signal, outcome: { status: 'superseded' } },
        ],
      )))

      throwIfAborted(authority)
      if (authority.replacement) {
        return adoptLatestFull(authority, authority.replacement)
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
      const activeIds = new Set(activeOutcomes.map(outcome => outcome.id))
      fullStamp = { snapshots: stampSnapshots.filter(snapshot => activeIds.has(snapshot.id)) }
      exactStamps.splice(0)
      safelyPublishCommitted({ results, issues: publishedIssues, failed })

      if (authority.replacement) {
        return adoptLatestFull(authority, authority.replacement)
      }
      const issues = collectIssues(committed.value)
      return failed ? { success: false, issues } : { success: true, issues }
    }
    catch (reason) {
      throwIfAborted(authority)
      if (authority.replacement) {
        return adoptLatestFull(authority, authority.replacement)
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

  async function runTargetValidation(authority: TargetValidationAuthority): Promise<TargetValidationResult> {
    try {
      while (true) {
        const blockingFull = activeFull
        if (!blockingFull) {
          break
        }
        try {
          await blockingFull.promise
        }
        catch {
          // A field request waits for full validation to settle, even when it fails.
        }
        throwIfAborted(authority)
        if (authority.replacement) {
          return adoptTargetReplacement(authority, authority.replacement)
        }
      }
      throwIfAborted(authority)
      if (authority.replacement) {
        return adoptTargetReplacement(authority, authority.replacement)
      }

      const snapshots: ValidationSnapshot[] = [...registrations.entries()]
        .filter(([, registration]) => pathStartsWith(authority.path, registration.at))
        .map(([id, registration]) => ({
          id,
          registration,
          schema: unwrapSchema(registration.schema),
          input: snapshotValidationData(registration.data),
        }))
      rememberSnapshots(snapshots)
      initialiseDeferredBaselines(snapshots)
      const stampSnapshots = snapshots.map(snapshotForStamp)
      const outcomes = await Promise.all(snapshots.map(snapshot => raceValidationOutcome(
        settleValidation(snapshot),
        [
          { signal: snapshot.registration.disposed, outcome: { status: 'disposed' } },
          { signal: authority.signal, outcome: { status: 'superseded' } },
        ],
      )))

      throwIfAborted(authority)
      if (authority.replacement) {
        return adoptTargetReplacement(authority, authority.replacement)
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
      const activeIds = new Set(activeOutcomes.map(outcome => outcome.id))
      const previousStamp = exactStamps.findIndex(stamp => pathsEqual(stamp.path, authority.path))
      if (previousStamp >= 0) {
        exactStamps.splice(previousStamp, 1)
      }
      exactStamps.push({
        path: authority.path,
        snapshots: stampSnapshots.filter(snapshot => activeIds.has(snapshot.id)),
      })
      safelyPublishCommitted({ ...committed.value, issues })

      if (authority.replacement) {
        return adoptTargetReplacement(authority, authority.replacement)
      }
      return { issues: selectedIssues }
    }
    catch (reason) {
      throwIfAborted(authority)
      if (authority.replacement) {
        return adoptTargetReplacement(authority, authority.replacement)
      }
      throw reason
    }
    finally {
      removeActiveTarget(authority)
      finishWork(authority)
    }
  }

  function deliverValidation<Value>(
    authority: ValidationWork,
    operation: Promise<Value>,
    deferred: Deferred<Value>,
  ): void {
    void operation.then(
      (value) => {
        const abortReason = authority.abortReason
        if (abortReason) {
          deferred.reject(abortReason)
        }
        else {
          deferred.resolve(value)
        }
        unsettledWork.delete(authority)
        if (isTargetAuthority(authority)) {
          releaseLatestTarget(authority.path)
        }
      },
      (reason) => {
        deferred.reject(authority.abortReason ?? reason)
        unsettledWork.delete(authority)
        if (isTargetAuthority(authority)) {
          releaseLatestTarget(authority.path)
        }
      },
    )
  }

  function beginWork(authority: ValidationWork): void {
    pendingWork.add(authority)
    unsettledWork.add(authority)
    publishValidatingAndInvalidate(true, true)
  }

  function finishWork(authority: ValidationWork): void {
    pendingWork.delete(authority)
    publishValidatingAndInvalidate(pendingWork.size > 0, false)
  }

  function supersedeFullAuthority(
    previous: ValidationAuthority | undefined,
    replacement: Promise<ValidationResult>,
  ): void {
    if (!previous || !pendingWork.has(previous)) {
      return
    }
    previous.replacement = replacement
    previous.signal.cancel()
    finishWork(previous)
  }

  function supersedeTargetAuthority(
    previous: TargetValidationAuthority | undefined,
    replacement: Promise<TargetValidationResult>,
  ): void {
    if (!previous || !pendingWork.has(previous)) {
      return
    }
    previous.replacement = replacement
    previous.signal.cancel()
    finishWork(previous)
    removeActiveTarget(previous)
  }

  function publishCommitted(next: CommittedState): void {
    published.value = { ...published.value, committed: next }
  }

  function publishValidating(validating: boolean): void {
    if (published.value.isValidating !== validating) {
      published.value = { ...published.value, isValidating: validating }
    }
  }

  function safelyPublishCommitted(next: CommittedState): void {
    try {
      publishCommitted(next)
    }
    catch {
      // Committed validation and disposal are authoritative, not observer callbacks.
    }
    safelyInvalidateState()
  }

  function publishValidatingAndInvalidate(validating: boolean, propagateFailure: boolean): void {
    let failed = false
    let failure: unknown
    try {
      publishValidating(validating)
    }
    catch (reason) {
      failed = true
      failure = reason
    }
    try {
      invalidateState()
    }
    catch (reason) {
      if (!failed) {
        failed = true
        failure = reason
      }
    }
    if (failed && propagateFailure) {
      throw failure
    }
  }

  function removeActiveTarget(authority: TargetValidationAuthority): void {
    const index = activeTargets.indexOf(authority)
    if (index >= 0) {
      activeTargets.splice(index, 1)
    }
  }

  function isTargetAuthority(authority: ValidationWork): authority is TargetValidationAuthority {
    return Object.hasOwn(authority, 'path')
  }

  function latestTargetFor(path: readonly PropertyKey[]): TargetValidationAuthority | undefined {
    return latestTargets.find(target => pathsEqual(target.path, path))
  }

  function setLatestTarget(authority: TargetValidationAuthority): void {
    const previous = latestTargetFor(authority.path)
    if (previous) {
      latestTargets.splice(latestTargets.indexOf(previous), 1, authority)
    }
    else {
      latestTargets.push(authority)
    }
  }

  function releaseLatestTarget(path: readonly PropertyKey[]): void {
    const hasUnsettledTarget = [...unsettledWork].some(work => isTargetAuthority(work)
      && pathsEqual(work.path, path))
    if (hasUnsettledTarget) {
      return
    }
    const latest = latestTargetFor(path)
    if (latest) {
      latestTargets.splice(latestTargets.indexOf(latest), 1)
    }
  }

  async function adoptLatestFull(
    owner: ValidationAuthority,
    validation: Promise<ValidationResult>,
  ): Promise<ValidationResult> {
    try {
      const result = await validation
      throwIfAborted(owner)
      const newest = latestFull?.promise
      if (newest && newest !== validation && newest !== owner.promise) {
        return adoptLatestFull(owner, newest)
      }
      return result
    }
    catch (reason) {
      throwIfAborted(owner)
      const newest = latestFull?.promise
      if (newest && newest !== validation && newest !== owner.promise) {
        return adoptLatestFull(owner, newest)
      }
      throw reason
    }
  }

  async function adoptTargetReplacement(
    authority: TargetValidationAuthority,
    replacement: Promise<TargetValidationResult>,
  ): Promise<TargetValidationResult> {
    try {
      const result = await replacement
      throwIfAborted(authority)
      const newest = latestTargetFor(authority.path)?.promise
      if (newest && newest !== authority.promise && newest !== replacement) {
        return adoptTargetReplacement(authority, newest)
      }
      return result
    }
    catch (reason) {
      throwIfAborted(authority)
      const newest = latestTargetFor(authority.path)?.promise
      if (newest && newest !== authority.promise && newest !== replacement) {
        return adoptTargetReplacement(authority, newest)
      }
      throw reason
    }
  }

  async function projectLatestFull(authority: ValidationAuthority, path: readonly PropertyKey[]): Promise<TargetValidationResult> {
    try {
      const result = await projectValidation(authority.promise, path)
      throwIfAborted(authority)
      const newest = latestFull
      if (newest && newest !== authority) {
        return projectLatestFull(newest, path)
      }
      return result
    }
    catch (reason) {
      throwIfAborted(authority)
      const newest = latestFull
      if (newest && newest !== authority) {
        return projectLatestFull(newest, path)
      }
      throw reason
    }
  }

  async function settleValidation(snapshot: ValidationSnapshot): Promise<CompletedValidationOutcome> {
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

  function currentSnapshot(id: symbol, registration: ValidationRegistration): ValidationSnapshot {
    const previousObserver = stateObservers.get(id)
    const observer = effectScope(true)
    let snapshot!: ValidationSnapshot
    try {
      observer.run(() => effect(() => {
        snapshot = {
          id,
          registration,
          schema: unref(registration.schema) as StandardSchemaV1,
          input: registration.baseline === UNCAPTURED_BASELINE && suppressedAccessorCaptures.has(registration)
            ? UNCAPTURED_BASELINE
            : snapshotValidationData(registration.data),
        }
      }, { scheduler: safelyInvalidateState }))
    }
    catch (reason) {
      observer.stop()
      throw reason
    }

    if (registrations.get(id) !== registration || stateObservers.get(id) !== previousObserver) {
      observer.stop()
      return snapshot
    }

    stateObservers.set(id, observer)
    previousObserver?.stop()
    return snapshot
  }

  function stopStateObserver(id: symbol): void {
    stateObservers.get(id)?.stop()
    stateObservers.delete(id)
  }

  function rememberSnapshots(snapshots: readonly ValidationSnapshot[]): void {
    for (const snapshot of snapshots) {
      if (snapshot.input === UNCAPTURED_BASELINE) {
        continue
      }
      lastObservedSnapshots.set(snapshot.id, snapshotForStamp(snapshot))
    }
  }

  function snapshotForStamp(snapshot: ValidationSnapshot): ValidationSnapshot {
    return {
      ...snapshot,
      input: snapshotValidationData(snapshot.input),
    }
  }

  function initialiseDeferredBaselines(snapshots: readonly ValidationSnapshot[]): void {
    if (resetCapture) {
      return
    }
    for (const snapshot of snapshots) {
      if (snapshot.registration.baseline === UNCAPTURED_BASELINE && snapshot.input !== UNCAPTURED_BASELINE) {
        snapshot.registration.baseline = snapshotValidationData(snapshot.input)
      }
    }
  }

  function throwIfAborted(authority: ValidationWork): void {
    if (authority.abortReason) {
      throw authority.abortReason
    }
  }

  function invalidateState(): void {
    stateRevision.value++
  }

  function safelyInvalidateState(): void {
    try {
      invalidateState()
    }
    catch {
      // Rollback must complete even when the observer that caused it still throws.
    }
  }

  return {
    committed,
    isValidating,
    rootPolicy,
    state,
    addValidation,
    stateFor,
    touch,
    resetState,
    validate,
    validateAt,
  }
}

function createGroup<Path>(scope: InternalValidationScope, prefix: readonly PropertyKey[]): ValidationGroup<Path> {
  const issues = computed(() => collectIssues(scope.committed.value))

  function resolvePath(path: Path): PropertyKey[] {
    return [...prefix, ...selectorSegments(path)]
  }

  function issuesFor(path: Path): readonly ValidationIssue[] {
    const resolved = resolvePath(path)
    return issues.value.filter(issue => pathsEqual(issue.path, resolved))
  }

  function errorsFor(path: Path): readonly string[] {
    return issuesFor(path).map(resolveMessage)
  }

  function validateAt(path: Path): Promise<TargetValidationResult> {
    return scope.validateAt(resolvePath(path))
  }

  return {
    issues,
    errors: computed(() => issues.value.map(resolveMessage)),
    isValidating: computed(() => scope.isValidating.value),
    state: scope.state,
    issuesFor,
    hasError: path => issuesFor(path).length > 0,
    errorsFor,
    errorFor: path => errorsFor(path)[0],
    stateFor: path => scope.stateFor(resolvePath(path)),
    touch: path => scope.touch(resolvePath(path)),
    resetState: scope.resetState,
    validate: scope.validate,
    validateAt,
    validateFor: validateAt,
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

function projectValidation(validation: Promise<ValidationResult>, path: readonly PropertyKey[]): Promise<TargetValidationResult> {
  return validation.then((result) => {
    const issues = result.issues.filter(issue => pathsEqual(issue.path, path))
    return { issues }
  })
}

function createDeferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value | PromiseLike<Value>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function blockValidationDuringReset<Value>(capture: ResetCapture): Promise<Value> {
  const deferred = createDeferred<Value>()
  capture.blockedValidations.push(deferred.reject)
  // Accessors commonly discard re-entrant calls. Keep their eventual rejection observed
  // while preserving the rejection for callers that do await the original promise.
  void deferred.promise.catch(() => {})
  return deferred.promise
}

function rejectBlockedValidations(capture: ResetCapture, reason: unknown): void {
  capture.blockedValidations.splice(0).forEach(reject => reject(reason))
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

function createState(
  dirty: boolean,
  touched: boolean,
  validated: boolean,
  stale: boolean,
  validating: boolean,
): ValidationState {
  return Object.freeze({ dirty, touched, validated, stale, validating })
}

function validationStatesEqual(actual: ValidationState, expected: ValidationState): boolean {
  return actual.dirty === expected.dirty
    && actual.touched === expected.touched
    && actual.validated === expected.validated
    && actual.stale === expected.stale
    && actual.validating === expected.validating
}

function resolvedInputsEqual(
  actual: ValidationIssueContext['input'],
  expected: ValidationIssueContext['input'],
): boolean {
  return actual.present === expected.present
    && (!actual.present || structurallyEqual(actual.value, expected.value))
}

function stampsEqual(
  expected: readonly ValidationSnapshot[],
  actual: readonly ValidationSnapshot[],
): boolean {
  if (expected.length !== actual.length) {
    return false
  }
  const actualById = new Map(actual.map(snapshot => [snapshot.id, snapshot]))
  return expected.every((snapshot) => {
    const current = actualById.get(snapshot.id)
    return current !== undefined
      && current.registration === snapshot.registration
      && Object.is(current.schema, snapshot.schema)
      && structurallyEqual(current.input, snapshot.input)
  })
}

function structurallyEqual(
  actual: unknown,
  expected: unknown,
  actualToExpected = new WeakMap<object, object>(),
  expectedToActual = new WeakMap<object, object>(),
): boolean {
  if (Object.is(actual, expected)) {
    return true
  }
  if (typeof actual !== 'object' || actual === null || typeof expected !== 'object' || expected === null) {
    return false
  }
  const actualIsArray = Array.isArray(actual)
  if (actualIsArray !== Array.isArray(expected)) {
    return false
  }
  const actualPrototype = Object.getPrototypeOf(actual)
  const expectedPrototype = Object.getPrototypeOf(expected)
  const actualIsPlain = actualIsArray || actualPrototype === Object.prototype || actualPrototype === null
  const expectedIsPlain = actualIsArray || expectedPrototype === Object.prototype || expectedPrototype === null
  if (!actualIsPlain || !expectedIsPlain || actualPrototype !== expectedPrototype) {
    return false
  }

  const pairedExpected = actualToExpected.get(actual)
  const pairedActual = expectedToActual.get(expected)
  if (pairedExpected !== undefined || pairedActual !== undefined) {
    return pairedExpected === expected && pairedActual === actual
  }
  actualToExpected.set(actual, expected)
  expectedToActual.set(expected, actual)

  const actualKeys = Reflect.ownKeys(actual)
  const expectedKeys = Reflect.ownKeys(expected)
  if (actualKeys.length !== expectedKeys.length) {
    return false
  }
  return actualKeys.every((key) => {
    if (!Object.hasOwn(expected, key)) {
      return false
    }
    const actualDescriptor = Reflect.getOwnPropertyDescriptor(actual, key)
    const expectedDescriptor = Reflect.getOwnPropertyDescriptor(expected, key)
    return actualDescriptor !== undefined
      && expectedDescriptor !== undefined
      && actualDescriptor.enumerable === expectedDescriptor.enumerable
      && structurallyEqual(
        Reflect.get(actual, key),
        Reflect.get(expected, key),
        actualToExpected,
        expectedToActual,
      )
  })
}

function createResetAbortError(): Error {
  const error = new Error('Validation state was reset')
  error.name = 'AbortError'
  return error
}

function containsAccessor(data: unknown, seen = new WeakSet<object>()): boolean {
  if (isRef(data) && !Object.hasOwn(data, '_rawValue')) {
    // Computed and custom refs execute caller code when read. Ordinary Vue refs
    // retain `_rawValue`, so they can still establish their baseline eagerly.
    return true
  }
  const value = isRef(data) ? unref(data) : data
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return false
  }
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return false
    }
  }
  seen.add(value)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      return true
    }
    if (descriptor && 'value' in descriptor && containsAccessor(descriptor.value, seen)) {
      return true
    }
  }
  return false
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
    snapshot.length = value.length
    seen.set(value, snapshot)
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') {
        continue
      }
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
