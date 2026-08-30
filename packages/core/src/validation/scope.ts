import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, MaybeRef } from 'vue'
import type { ValidationIssue } from '../messages'
import type { IssuePipeline, ValidationPolicyOptions } from './issuePipeline'
import type { ObservableRegistration, ObservedValidationState, ValidationSnapshot } from './registrationObservation'
import { computed, shallowRef } from 'vue'
import { validateWithStandardSchema } from '../utils/schemaUtils'
import { createIssuePipeline, resolveValidationMessage } from './issuePipeline'
import { pathsEqual } from './paths'
import { createRegistrationObservation } from './registrationObservation'

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
  readonly disposed: CancellationSignal
}

interface PublishedValidationState {
  readonly committed: CommittedValidationState
  readonly isValidating: boolean
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
    readonly result: ScopeRegistrationResult<unknown>
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
}

interface ValidationAuthority extends ValidationWork {
  readonly promise: Promise<ScopeValidationResult>
  snapshots?: readonly ValidationSnapshot<ValidationRegistration>[]
  replacement?: Promise<ScopeValidationResult>
}

interface TargetValidationAuthority extends ValidationWork {
  readonly path: readonly PropertyKey[]
  readonly promise: Promise<ScopeTargetValidationResult>
  replacement?: Promise<ScopeTargetValidationResult>
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
  let activeFull: ValidationAuthority | undefined
  let latestFull: ValidationAuthority | undefined
  const activeTargets: TargetValidationAuthority[] = []
  const latestTargets: TargetValidationAuthority[] = []
  let resetCapture: ResetCapture | undefined
  const observation = createRegistrationObservation(registrations, () => ({
    validating: pendingWork.size > 0,
    activeFull: activeFull && { snapshots: activeFull.snapshots },
    targetPaths: activeTargets.map(target => target.path),
  }))

  function addValidation(
    schema: MaybeRef<StandardSchemaV1>,
    data: unknown,
    registrationOptions: ScopeRegistrationOptions,
    creatingScope: boolean,
  ) {
    const id = Symbol('validation')
    const disposed = createCancellationSignal()
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
      observation.addRegistration(id, registration, disposed.cancel)
    }
    catch (reason) {
      disposed.cancel()
      throw reason
    }

    return {
      readResult: () => committed.value.results.get(id) ?? IDLE_RESULT,
      readIssues: () => committed.value.issues.get(id) ?? [],
      remove: () => {
        if (!observation.removeRegistration(id, registration)) {
          return
        }
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

  function resetState(): void {
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
    rejectBlockedValidations(capture, abortReason)
    observation.commitResetBaselines(baselines)

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
    if (observation.isResetting()) {
      return blockValidationDuringReset<ScopeValidationResult>(resetCapture!)
    }
    const deferred = createDeferred<ScopeValidationResult>()
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

  function validateAt(path: readonly PropertyKey[]): Promise<ScopeTargetValidationResult> {
    if (observation.isResetting()) {
      return blockValidationDuringReset<ScopeTargetValidationResult>(resetCapture!)
    }
    const resolvedPath = Object.freeze([...path])
    const deferred = createDeferred<ScopeTargetValidationResult>()
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

  async function runFullValidation(authority: ValidationAuthority): Promise<ScopeValidationResult> {
    try {
      const capture = observation.captureAll()
      const snapshots = capture.snapshots
      authority.snapshots = snapshots
      observation.safelyInvalidate()
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

      const results = new Map<symbol, ScopeRegistrationResult<unknown>>()
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
      observation.recordFullValidation(capture.stampSnapshots, activeIds)
      safelyPublishCommitted({ results, issues: publishedIssues, failed })

      if (authority.replacement) {
        return adoptLatestFull(authority, authority.replacement)
      }
      const issues = collectIssues(committed.value.issues)
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

  async function runTargetValidation(authority: TargetValidationAuthority): Promise<ScopeTargetValidationResult> {
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

      const capture = observation.captureAt(authority.path)
      const snapshots = capture.snapshots
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
      observation.recordExactValidation(authority.path, capture.stampSnapshots, activeIds)
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
    replacement: Promise<ScopeValidationResult>,
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
    replacement: Promise<ScopeTargetValidationResult>,
  ): void {
    if (!previous || !pendingWork.has(previous)) {
      return
    }
    previous.replacement = replacement
    previous.signal.cancel()
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
    validation: Promise<ScopeValidationResult>,
  ): Promise<ScopeValidationResult> {
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
    replacement: Promise<ScopeTargetValidationResult>,
  ): Promise<ScopeTargetValidationResult> {
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

  async function projectLatestFull(
    authority: ValidationAuthority,
    path: readonly PropertyKey[],
  ): Promise<ScopeTargetValidationResult> {
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
    isValidating,
    readIssues: () => collectIssues(committed.value.issues),
    readErrors: () => collectIssues(committed.value.issues).map(resolveValidationMessage),
    state: observation.state,
    addValidation,
    stateFor: observation.stateFor,
    touch: observation.touch,
    resetState,
    validate,
    validateAt,
  }
}

function projectValidation(
  validation: Promise<ScopeValidationResult>,
  path: readonly PropertyKey[],
): Promise<ScopeTargetValidationResult> {
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

function throwIfAborted(authority: ValidationWork): void {
  if (authority.abortReason) {
    throw authority.abortReason
  }
}

function createResetAbortError(): Error {
  const error = new Error('Validation state was reset')
  error.name = 'AbortError'
  return error
}
