import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, MaybeRef } from 'vue'
import type { ValidationIssue } from '../messages'
import type { IssuePipeline, ValidationPolicyOptions } from './issuePipeline'
import type { ObservableRegistration, ObservedValidationState, ValidationSnapshot } from './registrationObservation'
import type { ValidationRun } from './runs'
import { computed, shallowRef } from 'vue'
import { validateWithStandardSchema } from '../utils/schemaUtils'
import { createIssuePipeline, resolveValidationMessage } from './issuePipeline'
import { pathsEqual } from './paths'
import { createRegistrationObservation, snapshotValidationData } from './registrationObservation'
import { abortRun, followLatest, raceCancellation, supersedeRun, throwIfAborted } from './runs'

export interface ScopeRegistrationOptions extends ValidationPolicyOptions {
  readonly at?: readonly PropertyKey[]
}

export type ScopeRegistrationResult<Output>
  = | { readonly status: 'idle' }
    | { readonly status: 'valid', readonly value: Output }
    | { readonly status: 'invalid', readonly issues: readonly ValidationIssue[] }

export type ScopeValidationResult
  = | { readonly success: true, readonly issues: readonly ValidationIssue[] }
    | { readonly success: false, readonly issues: readonly ValidationIssue[] }

export interface ScopeTargetValidationResult {
  readonly issues: readonly ValidationIssue[]
}

interface CommittedValidationState {
  readonly results: ReadonlyMap<symbol, ScopeRegistrationResult<unknown>>
  readonly issues: ReadonlyMap<symbol, readonly ValidationIssue[]>
  readonly failed: boolean
}

export interface InternalValidationScope {
  readonly signal: AbortSignal
  dispose: () => void
  remapArray: (path: readonly PropertyKey[], order: readonly (number | null)[], updateModel: () => void) => void
  setIssues: (path: readonly PropertyKey[], issues: readonly StandardSchemaV1.Issue[]) => void
  clearIssues: (path?: readonly PropertyKey[]) => void
  captureCommitContext: (path: readonly PropertyKey[]) => unknown
  onCancel: (listener: (reason: Error, cause: 'reset' | 'dispose' | 'array') => void) => () => void
  readonly isValidating: ComputedRef<boolean>
  readIssues: () => readonly ValidationIssue[]
  readErrors: () => readonly string[]
  addValidation: (
    schema: MaybeRef<StandardSchemaV1>,
    data: unknown,
    options: ScopeRegistrationOptions,
    creatingScope: boolean,
  ) => {
    readResult: () => ScopeRegistrationResult<unknown>
    readIssues: () => readonly ValidationIssue[]
    setIssues: (path: readonly PropertyKey[], issues: readonly StandardSchemaV1.Issue[]) => void
    remove: () => void
  }
  readonly state: ComputedRef<ObservedValidationState>
  stateFor: (path: readonly PropertyKey[]) => ObservedValidationState
  touch: (path: readonly PropertyKey[]) => void
  resetState: () => void
  validate: () => Promise<ScopeValidationResult>
  validateAt: (path: readonly PropertyKey[]) => Promise<ScopeTargetValidationResult>
}

interface ValidationRegistration extends ObservableRegistration {
  readonly issuePipeline: IssuePipeline
  readonly disposed: AbortController
}

interface PublishedValidationState {
  readonly committed: CommittedValidationState
  readonly isValidating: boolean
}

type ValidationOutcome
  = | {
    readonly id: symbol
    readonly registration: ValidationRegistration
    readonly status: 'fulfilled'
    readonly result: ScopeRegistrationResult<unknown>
  }
  | {
    readonly id: symbol
    readonly registration: ValidationRegistration
    readonly status: 'rejected'
    readonly reason: unknown
  }
  | { readonly status: 'cancelled' }

type CompletedValidationOutcome = Extract<ValidationOutcome, { readonly id: symbol }>
type ValidationWork = ValidationRun<unknown>

interface Deferred<Value> {
  readonly promise: Promise<Value>
  readonly resolve: (value: Value | PromiseLike<Value>) => void
  readonly reject: (reason?: unknown) => void
}

interface ResetCapture {
  readonly blockedValidations: Array<(reason: unknown) => void>
}

interface FullRun extends ValidationRun<ScopeValidationResult> {
  snapshots?: readonly ValidationSnapshot<ValidationRegistration>[]
}

interface TargetRun extends ValidationRun<ScopeTargetValidationResult> {
  readonly path: readonly PropertyKey[]
}

const IDLE_RESULT = Object.freeze({ status: 'idle' as const })

function collectIssues(issues: ReadonlyMap<symbol, readonly ValidationIssue[]>): readonly ValidationIssue[] {
  return [...issues.values()].flatMap(registrationIssues => registrationIssues)
}

function issuesFromResult(result: ScopeRegistrationResult<unknown>): readonly ValidationIssue[] {
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
  return [
    ...retained.slice(0, firstMatch),
    ...replacements,
    ...retained.slice(firstMatch),
  ]
}

export function createValidationScope(
  options: ValidationPolicyOptions,
  application?: ValidationPolicyOptions,
): InternalValidationScope {
  const registrations = new Map<symbol, ValidationRegistration>()
  const lifetime = new AbortController()
  const cancelListeners = new Set<(reason: Error, cause: 'reset' | 'dispose' | 'array') => void>()
  const externalIssues = shallowRef<readonly ValidationIssue[]>([])
  const externalPipeline = createIssuePipeline([], { registration: options, root: options, application, creatingScope: true })
  const published = shallowRef<PublishedValidationState>({
    committed: { results: new Map(), issues: new Map(), failed: false },
    isValidating: false,
  })
  const committed = computed(() => published.value.committed)
  const isValidating = computed(() => published.value.isValidating)
  const rootPolicy: ValidationPolicyOptions = {
    messages: options.messages,
    messagePrefix: options.messagePrefix,
    describeIssue: options.describeIssue,
  }
  const pendingWork = new Set<ValidationWork>()
  const unsettledWork = new Set<ValidationWork>()
  let epoch = 0
  let activeFull: FullRun | undefined
  let latestFull: FullRun | undefined
  const activeTargets: TargetRun[] = []
  const latestTargets: TargetRun[] = []
  let resetCapture: ResetCapture | undefined
  const observation = createRegistrationObservation(registrations, () => ({
    validating: pendingWork.size > 0,
    activeFull: activeFull && { snapshots: activeFull.snapshots },
    targetPaths: activeTargets.map(target => target.path),
  }))

  function readIssues(): readonly ValidationIssue[] {
    return [...collectIssues(committed.value.issues), ...externalIssues.value]
  }

  function setIssues(path: readonly PropertyKey[], rawIssues: readonly StandardSchemaV1.Issue[]): void {
    lifetime.signal.throwIfAborted()
    const additions = rawIssues.map(raw => externalPipeline.createIssue(raw, 'server', undefined, path))
    externalIssues.value = [...externalIssues.value.filter(issue => !pathsEqual(issue.path, path)), ...additions]
  }

  function clearIssues(path?: readonly PropertyKey[]): void {
    lifetime.signal.throwIfAborted()
    externalIssues.value = path === undefined ? [] : externalIssues.value.filter(issue => !pathsEqual(issue.path, path))
  }

  function notifyCancellation(reason: Error, cause: 'reset' | 'dispose' | 'array'): void {
    for (const listener of cancelListeners) {
      try {
        listener(reason, cause)
      }
      catch {
        // Reactive observer failures cannot interrupt scope cancellation.
      }
    }
  }

  function cancelWork(reason: Error): void {
    for (const work of [...unsettledWork]) {
      abortRun(work, reason)
    }
    pendingWork.clear()
    unsettledWork.clear()
    activeFull = undefined
    latestFull = undefined
    activeTargets.splice(0)
    latestTargets.splice(0)
  }

  function dispose(): void {
    if (lifetime.signal.aborted)
      return
    const reason = new Error('Validation scope was disposed')
    reason.name = 'AbortError'
    lifetime.abort(reason)
    notifyCancellation(reason, 'dispose')
    cancelListeners.clear()
    cancelWork(reason)
    if (resetCapture)
      rejectBlockedValidations(resetCapture, reason)
    for (const [id, registration] of [...registrations]) {
      observation.removeRegistration(id, registration)
      registration.disposed.abort()
    }
    externalIssues.value = []
    safelyPublishCommitted({ results: new Map(), issues: new Map(), failed: false })
    publishValidatingAndInvalidate(false, false)
  }

  function remapArray(path: readonly PropertyKey[], order: readonly (number | null)[], updateModel: () => void): void {
    lifetime.signal.throwIfAborted()
    if (!observation.beginReset())
      throw new Error('Array structure cannot change during a validation state update')
    const capture: ResetCapture = { blockedValidations: [] }
    resetCapture = capture
    const reason = new Error('Array structure changed')
    reason.name = 'AbortError'
    try {
      updateModel()
      observation.remapArray(path, order)
      notifyCancellation(reason, 'array')
      cancelWork(reason)
      observation.beginResetCommit()
      // Server errors describe the previous request's positional model.
      externalIssues.value = []
      safelyPublishCommitted({ results: new Map(), issues: new Map(), failed: false })
      publishValidatingAndInvalidate(false, false)
    }
    finally {
      rejectBlockedValidations(capture, reason)
      resetCapture = undefined
      observation.finishReset()
    }
  }
  function addValidation(
    schema: MaybeRef<StandardSchemaV1>,
    data: unknown,
    registrationOptions: ScopeRegistrationOptions,
    creatingScope: boolean,
  ) {
    lifetime.signal.throwIfAborted()
    const id = Symbol('validation')
    const disposed = new AbortController()
    const at = Object.freeze([...(registrationOptions.at ?? [])])
    const issuePipeline = createIssuePipeline(at, {
      registration: registrationOptions,
      root: rootPolicy,
      application,
      creatingScope,
    })
    const registration: ValidationRegistration = {
      schema,
      data,
      at,
      issuePipeline,
      disposed,
    }
    try {
      observation.addRegistration(id, registration, () => disposed.abort())
    }
    catch (reason) {
      disposed.abort()
      throw reason
    }

    return {
      readResult: () => committed.value.results.get(id) ?? IDLE_RESULT,
      readIssues: () => committed.value.issues.get(id) ?? [],
      setIssues: (path: readonly PropertyKey[], rawIssues: readonly StandardSchemaV1.Issue[]) => {
        lifetime.signal.throwIfAborted()
        if (registrations.get(id) !== registration)
          throw new Error('Validation registration was disposed')
        const resolved = [...at, ...path]
        const input = snapshotValidationData(registration.data)
        const additions = rawIssues.map(raw => issuePipeline.createIssue(raw, 'server', input, path))
        externalIssues.value = [...externalIssues.value.filter(issue => !pathsEqual(issue.path, resolved)), ...additions]
      },
      remove: () => {
        if (!observation.removeRegistration(id, registration)) {
          return
        }
        disposed.abort()
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

  function resetState(): void {
    lifetime.signal.throwIfAborted()
    if (!observation.beginReset()) {
      return
    }

    const capture: ResetCapture = { blockedValidations: [] }
    resetCapture = capture
    let baselines
    try {
      baselines = observation.captureResetBaselines()
    }
    catch (reason) {
      rejectBlockedValidations(capture, reason)
      resetCapture = undefined
      observation.abortReset()
      throw reason
    }

    const abortReason = createResetAbortError()
    notifyCancellation(abortReason, 'reset')
    rejectBlockedValidations(capture, abortReason)
    observation.commitResetBaselines(baselines)
    externalIssues.value = []

    cancelWork(abortReason)

    observation.beginResetCommit()
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
    observation.finishReset()
  }

  function validate(): Promise<ScopeValidationResult> {
    if (lifetime.signal.aborted)
      return Promise.reject(lifetime.signal.reason)
    if (observation.isResetting()) {
      return blockValidationDuringReset<ScopeValidationResult>(resetCapture!)
    }
    const deferred = createDeferred<ScopeValidationResult>()
    const run: FullRun = {
      id: ++epoch,
      controller: new AbortController(),
      state: { status: 'running' },
      promise: deferred.promise,
    }
    const previousFull = activeFull
    const previousLatestFull = latestFull
    activeFull = run
    latestFull = run
    try {
      beginWork(run)
    }
    catch (reason) {
      if (activeFull?.id === run.id) {
        activeFull = previousFull
      }
      if (latestFull?.id === run.id) {
        latestFull = previousLatestFull
      }
      finishWork(run)
      if (run.state.status === 'aborted') {
        unsettledWork.delete(run)
        deferred.reject(run.state.reason)
      }
      else if (run.state.status === 'superseded') {
        supersedeFull(previousFull, run.promise)
        deliverValidation(run, followLatest(run, run.state.next, () => latestFull?.promise), deferred)
      }
      else {
        unsettledWork.delete(run)
        deferred.reject(reason)
      }
      return run.promise
    }

    supersedeFull(previousFull, run.promise)
    for (const target of [...activeTargets]) {
      const replacement = projectLatestFull(run, target.path)
      // Reset can abort the target before it adopts this internal projection.
      // Observe rejection while preserving the caller's original promise.
      void replacement.catch(() => {})
      supersedeRun(target, replacement)
      finishWork(target)
      removeActiveTarget(target)
    }

    deliverValidation(run, executeRun(run, () => runFullValidation(run), () => latestFull?.promise), deferred)
    return run.promise
  }

  function validateAt(path: readonly PropertyKey[]): Promise<ScopeTargetValidationResult> {
    if (lifetime.signal.aborted)
      return Promise.reject(lifetime.signal.reason)
    if (observation.isResetting()) {
      return blockValidationDuringReset<ScopeTargetValidationResult>(resetCapture!)
    }
    const resolvedPath = Object.freeze([...path])
    const deferred = createDeferred<ScopeTargetValidationResult>()
    const run: TargetRun = {
      path: resolvedPath,
      id: ++epoch,
      controller: new AbortController(),
      state: { status: 'running' },
      promise: deferred.promise,
    }
    const previousActiveTarget = [...activeTargets].reverse().find(target => pathsEqual(target.path, resolvedPath))
    const previousLatestTarget = latestTargetFor(resolvedPath)
    activeTargets.push(run)
    setLatestTarget(run)
    try {
      beginWork(run)
    }
    catch (reason) {
      removeActiveTarget(run)
      finishWork(run)
      if (run.state.status === 'aborted') {
        unsettledWork.delete(run)
        releaseLatestTarget(run.path)
        deferred.reject(run.state.reason)
      }
      else if (run.state.status === 'superseded') {
        supersedeTarget(previousActiveTarget, run.promise)
        deliverValidation(run, followLatest(run, run.state.next, () => latestTargetFor(run.path)?.promise), deferred)
      }
      else {
        if (latestTargetFor(run.path) === run
          && previousLatestTarget) {
          setLatestTarget(previousLatestTarget)
        }
        unsettledWork.delete(run)
        releaseLatestTarget(run.path)
        deferred.reject(reason)
      }
      return run.promise
    }
    supersedeTarget(previousActiveTarget, run.promise)

    deliverValidation(run, executeRun(run, () => runTargetValidation(run), () => latestTargetFor(run.path)?.promise), deferred)
    return run.promise
  }

  function assertCurrent(run: FullRun | TargetRun): void {
    throwIfAborted(run)
    const latest = isTargetRun(run) ? latestTargetFor(run.path) : latestFull
    if (run.state.status !== 'running' || latest?.id !== run.id)
      throw new Error('Validation run was superseded')
  }

  async function collectOutcomes(
    run: ValidationWork,
    snapshots: readonly ValidationSnapshot<ValidationRegistration>[],
  ): Promise<CompletedValidationOutcome[]> {
    const outcomes = await Promise.all(snapshots.map(snapshot => raceCancellation(
      settleValidation(snapshot),
      [snapshot.registration.disposed.signal, run.controller.signal],
    )))
    const active = outcomes.filter(
      (outcome): outcome is CompletedValidationOutcome => 'id' in outcome
        && registrations.get(outcome.id) === outcome.registration,
    )
    const rejection = active.find(outcome => outcome.status === 'rejected')
    if (rejection?.status === 'rejected')
      throw rejection.reason
    return active
  }

  async function runFullValidation(run: FullRun): Promise<ScopeValidationResult> {
    assertCurrent(run)
    const capture = observation.captureAll()
    run.snapshots = capture.snapshots
    observation.safelyInvalidate()
    const outcomes = await collectOutcomes(run, capture.snapshots)
    assertCurrent(run)

    const results = new Map<symbol, ScopeRegistrationResult<unknown>>()
    const publishedIssues = new Map<symbol, readonly ValidationIssue[]>()
    for (const [id] of registrations) {
      const outcome = outcomes.find(candidate => candidate.id === id)
      if (outcome?.status === 'fulfilled') {
        results.set(id, outcome.result)
        publishedIssues.set(id, issuesFromResult(outcome.result))
      }
    }
    const failed = [...results.values()].some(result => result.status === 'invalid')
    observation.recordFullValidation(capture.stampSnapshots, new Set(outcomes.map(outcome => outcome.id)))
    safelyPublishCommitted({ results, issues: publishedIssues, failed })
    const issues = readIssues()
    return failed || externalIssues.value.length > 0 ? { success: false, issues } : { success: true, issues }
  }

  async function runTargetValidation(run: TargetRun): Promise<ScopeTargetValidationResult> {
    while (true) {
      const blockingFull = activeFull
      if (!blockingFull)
        break
      try {
        await blockingFull.promise
      }
      catch {
        // Exact requests wait for full validation, including failed full runs.
      }
      assertCurrent(run)
    }
    assertCurrent(run)
    const capture = observation.captureAt(run.path)
    const outcomes = await collectOutcomes(run, capture.snapshots)
    assertCurrent(run)

    const replacements = new Map<symbol, readonly ValidationIssue[]>()
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        replacements.set(outcome.id, issuesFromResult(outcome.result).filter(issue => pathsEqual(issue.path, run.path)))
      }
    }
    const issues = new Map(committed.value.issues)
    const selectedIssues: ValidationIssue[] = []
    for (const [id] of registrations) {
      const selected = replacements.get(id)
      if (selected === undefined)
        continue
      issues.set(id, replaceIssuesAtPath(issues.get(id) ?? [], run.path, selected))
      selectedIssues.push(...selected)
    }
    observation.recordExactValidation(run.path, capture.stampSnapshots, new Set(outcomes.map(outcome => outcome.id)))
    safelyPublishCommitted({ ...committed.value, issues })
    return { issues: [...selectedIssues, ...externalIssues.value.filter(issue => pathsEqual(issue.path, run.path))] }
  }

  async function executeRun<Value>(
    run: ValidationRun<Value>,
    operation: () => Promise<Value>,
    latest: () => Promise<Value> | undefined,
  ): Promise<Value> {
    let outcome: { value: Value } | { reason: unknown }
    try {
      outcome = { value: await operation() }
    }
    catch (reason) {
      outcome = { reason }
    }
    try {
      throwIfAborted(run)
      if (run.state.status === 'superseded')
        return followLatest(run, run.state.next, latest)
      if ('reason' in outcome)
        throw outcome.reason
      return outcome.value
    }
    finally {
      if (activeFull?.id === run.id)
        activeFull = undefined
      if (isTargetRun(run))
        removeActiveTarget(run)
      finishWork(run)
    }
  }

  function deliverValidation<Value>(
    run: ValidationWork,
    operation: Promise<Value>,
    deferred: Deferred<Value>,
  ): void {
    void operation.then(
      (value) => {
        const abortReason = run.state.status === 'aborted' ? run.state.reason : undefined
        if (abortReason) {
          deferred.reject(abortReason)
        }
        else {
          deferred.resolve(value)
        }
        unsettledWork.delete(run)
        if (isTargetRun(run)) {
          releaseLatestTarget(run.path)
        }
      },
      (reason) => {
        deferred.reject(run.state.status === 'aborted' ? run.state.reason : reason)
        unsettledWork.delete(run)
        if (isTargetRun(run)) {
          releaseLatestTarget(run.path)
        }
      },
    )
  }

  function beginWork(run: ValidationWork): void {
    pendingWork.add(run)
    unsettledWork.add(run)
    publishValidatingAndInvalidate(true, true)
  }

  function finishWork(run: ValidationWork): void {
    pendingWork.delete(run)
    publishValidatingAndInvalidate(pendingWork.size > 0, false)
  }

  function supersedeFull(
    previous: FullRun | undefined,
    replacement: Promise<ScopeValidationResult>,
  ): void {
    if (!previous || !pendingWork.has(previous)) {
      return
    }
    supersedeRun(previous, replacement)
    finishWork(previous)
  }

  function supersedeTarget(
    previous: TargetRun | undefined,
    replacement: Promise<ScopeTargetValidationResult>,
  ): void {
    if (!previous || !pendingWork.has(previous)) {
      return
    }
    supersedeRun(previous, replacement)
    finishWork(previous)
    removeActiveTarget(previous)
  }

  function publishCommitted(next: CommittedValidationState): void {
    published.value = { ...published.value, committed: next }
  }

  function publishValidating(validating: boolean): void {
    if (published.value.isValidating !== validating) {
      published.value = { ...published.value, isValidating: validating }
    }
  }

  function safelyPublishCommitted(next: CommittedValidationState): void {
    try {
      publishCommitted(next)
    }
    catch {
      // Committed validation and disposal are authoritative, not observer callbacks.
    }
    observation.safelyInvalidate()
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
      observation.invalidate()
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

  function removeActiveTarget(run: TargetRun): void {
    const index = activeTargets.indexOf(run)
    if (index >= 0) {
      activeTargets.splice(index, 1)
    }
  }

  function isTargetRun(run: ValidationWork): run is TargetRun {
    return Object.hasOwn(run, 'path')
  }

  function latestTargetFor(path: readonly PropertyKey[]): TargetRun | undefined {
    return latestTargets.find(target => pathsEqual(target.path, path))
  }

  function setLatestTarget(run: TargetRun): void {
    const previous = latestTargetFor(run.path)
    if (previous) {
      latestTargets.splice(latestTargets.indexOf(previous), 1, run)
    }
    else {
      latestTargets.push(run)
    }
  }

  function releaseLatestTarget(path: readonly PropertyKey[]): void {
    const hasUnsettledTarget = [...unsettledWork].some(work => isTargetRun(work)
      && pathsEqual(work.path, path))
    if (hasUnsettledTarget) {
      return
    }
    const latest = latestTargetFor(path)
    if (latest) {
      latestTargets.splice(latestTargets.indexOf(latest), 1)
    }
  }

  function projectLatestFull(run: FullRun, path: readonly PropertyKey[]): Promise<ScopeTargetValidationResult> {
    return followLatest(run, run.promise, () => latestFull?.promise).then(result => ({
      issues: result.issues.filter(issue => pathsEqual(issue.path, path)),
    }))
  }

  async function settleValidation(
    snapshot: ValidationSnapshot<ValidationRegistration>,
  ): Promise<CompletedValidationOutcome> {
    try {
      const standardResult = await validateWithStandardSchema(snapshot.schema, snapshot.input)
      if (standardResult.issues !== undefined) {
        const issues = standardResult.issues.map(raw => snapshot.registration.issuePipeline.createIssue(
          raw,
          snapshot.schema['~standard'].vendor,
          snapshot.input,
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

  return {
    signal: lifetime.signal,
    dispose,
    isValidating,
    remapArray,
    captureCommitContext: path => observation.captureAt(path).stampSnapshots.map(({ id, schema, input }) => ({ id, schema, input })),
    onCancel: (listener) => {
      cancelListeners.add(listener)
      return () => {
        cancelListeners.delete(listener)
      }
    },
    readIssues,
    readErrors: () => readIssues().map(resolveValidationMessage),
    setIssues,
    clearIssues,
    state: observation.state,
    addValidation,
    stateFor: observation.stateFor,
    touch: observation.touch,
    resetState,
    validate,
    validateAt,
  }
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

function createResetAbortError(): Error {
  const error = new Error('Validation state was reset')
  error.name = 'AbortError'
  return error
}
