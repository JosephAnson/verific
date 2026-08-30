import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, EffectScope, MaybeRef } from 'vue'
import { customRef, effect, effectScope, isRef, readonly, shallowRef, unref } from 'vue'
import { unwrapSchema } from '../utils/schemaUtils'
import { pathsEqual, pathStartsWith, resolveInput } from './paths'

export interface ObservableRegistration {
  readonly schema: MaybeRef<StandardSchemaV1>
  readonly data: unknown
  readonly at: readonly PropertyKey[]
}

export interface ValidationSnapshot<Registration extends ObservableRegistration> {
  readonly id: symbol
  readonly registration: Registration
  readonly schema: StandardSchemaV1
  readonly input: unknown
}

export interface ValidationCapture<Registration extends ObservableRegistration> {
  readonly snapshots: readonly ValidationSnapshot<Registration>[]
  readonly stampSnapshots: readonly ValidationSnapshot<Registration>[]
}

export interface ObservedValidationState {
  readonly dirty: boolean
  readonly touched: boolean
  readonly validated: boolean
  readonly stale: boolean
  readonly validating: boolean
}

export interface RegistrationActivity<Registration extends ObservableRegistration> {
  readonly validating: boolean
  readonly activeFull?: {
    readonly snapshots?: readonly ValidationSnapshot<Registration>[]
  }
  readonly targetPaths: readonly (readonly PropertyKey[])[]
}

export interface ResetBaseline<Registration extends ObservableRegistration> {
  readonly id: symbol
  readonly registration: Registration
  readonly input: unknown
}

export interface RegistrationObservation<Registration extends ObservableRegistration> {
  readonly state: ComputedRef<ObservedValidationState>
  addRegistration: (id: symbol, registration: Registration, onRollback: () => void) => void
  removeRegistration: (id: symbol, registration: Registration) => boolean
  captureAll: () => ValidationCapture<Registration>
  captureAt: (path: readonly PropertyKey[]) => ValidationCapture<Registration>
  recordFullValidation: (
    snapshots: readonly ValidationSnapshot<Registration>[],
    activeIds: ReadonlySet<symbol>,
  ) => void
  recordExactValidation: (
    path: readonly PropertyKey[],
    snapshots: readonly ValidationSnapshot<Registration>[],
    activeIds: ReadonlySet<symbol>,
  ) => void
  stateFor: (path: readonly PropertyKey[]) => ObservedValidationState
  touch: (path: readonly PropertyKey[]) => void
  beginReset: () => boolean
  captureResetBaselines: () => readonly ResetBaseline<Registration>[]
  commitResetBaselines: (baselines: readonly ResetBaseline<Registration>[]) => void
  beginResetCommit: () => void
  abortReset: () => void
  finishReset: () => void
  isResetting: () => boolean
  invalidate: () => void
  safelyInvalidate: () => void
}

interface RegistrationState<Registration extends ObservableRegistration> {
  readonly registration: Registration
  baseline: unknown
  readonly touched: Array<readonly PropertyKey[]>
}

interface ValidationStamp<Registration extends ObservableRegistration> {
  readonly snapshots: readonly ValidationSnapshot<Registration>[]
}

interface ExactValidationStamp<Registration extends ObservableRegistration> extends ValidationStamp<Registration> {
  readonly path: readonly PropertyKey[]
}

interface ResetObservation<Registration extends ObservableRegistration> {
  readonly aggregateState: ObservedValidationState
  readonly observedSnapshots: readonly ValidationSnapshot<Registration>[]
  phase: 'capture' | 'commit'
}

const UNCAPTURED_BASELINE = Symbol('uncaptured-baseline')

export function createRegistrationObservation<Registration extends ObservableRegistration>(
  registrations: Map<symbol, Registration>,
  readActivity: () => RegistrationActivity<Registration>,
): RegistrationObservation<Registration> {
  const registrationStates = new Map<symbol, RegistrationState<Registration>>()
  const stateRevision = shallowRef(0)
  const exactStamps: ExactValidationStamp<Registration>[] = []
  const lastObservedSnapshots = new Map<symbol, ValidationSnapshot<Registration>>()
  const stateObservers = new Map<symbol, EffectScope>()
  const suppressedAccessorCaptures = new Set<Registration>()
  let fullStamp: ValidationStamp<Registration> | undefined
  let lastAggregateState: ObservedValidationState | undefined
  let resetCapture: ResetObservation<Registration> | undefined
  const state = readonly(customRef<ObservedValidationState>(track => ({
    get() {
      track()
      return readAggregateState()
    },
    /* v8 ignore next -- customRef requires a setter; the public state ref is readonly. */
    set() {},
  }))) as ComputedRef<ObservedValidationState>

  function addRegistration(id: symbol, registration: Registration, onRollback: () => void): void {
    const registrationState: RegistrationState<Registration> = {
      registration,
      // Registration must not invoke model accessors. The first successful state
      // or validation capture establishes the exceptional deferred baseline.
      baseline: containsAccessor(registration.data)
        ? UNCAPTURED_BASELINE
        : snapshotValidationData(registration.data),
      touched: [],
    }
    registrations.set(id, registration)
    registrationStates.set(id, registrationState)
    if (registrationState.baseline === UNCAPTURED_BASELINE) {
      suppressedAccessorCaptures.add(registration)
    }
    try {
      invalidate()
    }
    catch (reason) {
      registrations.delete(id)
      registrationStates.delete(id)
      lastObservedSnapshots.delete(id)
      stopStateObserver(id)
      onRollback()
      safelyInvalidate()
      throw reason
    }
    finally {
      suppressedAccessorCaptures.delete(registration)
    }

    if (registrationState.baseline === UNCAPTURED_BASELINE && stateObservers.has(id)) {
      queueMicrotask(() => {
        if (registrations.get(id) === registration
          && registrationState.baseline === UNCAPTURED_BASELINE
          && stateObservers.has(id)) {
          safelyInvalidate()
        }
      })
    }
  }

  function removeRegistration(id: symbol, registration: Registration): boolean {
    if (registrations.get(id) !== registration) {
      return false
    }
    registrations.delete(id)
    registrationStates.delete(id)
    lastObservedSnapshots.delete(id)
    stopStateObserver(id)
    return true
  }

  function captureAll(): ValidationCapture<Registration> {
    return capture([...registrations.entries()])
  }

  function captureAt(path: readonly PropertyKey[]): ValidationCapture<Registration> {
    return capture([...registrations.entries()].filter(([, registration]) => pathStartsWith(path, registration.at)))
  }

  function capture(entries: readonly (readonly [symbol, Registration])[]): ValidationCapture<Registration> {
    const snapshots = entries.map(([id, registration]) => ({
      id,
      registration,
      schema: unwrapSchema(registration.schema),
      input: snapshotValidationData(registration.data),
    }))
    rememberSnapshots(snapshots)
    initialiseDeferredBaselines(snapshots)
    return {
      snapshots,
      stampSnapshots: snapshots.map(snapshotForStamp),
    }
  }

  function recordFullValidation(
    snapshots: readonly ValidationSnapshot<Registration>[],
    activeIds: ReadonlySet<symbol>,
  ): void {
    fullStamp = { snapshots: snapshots.filter(snapshot => activeIds.has(snapshot.id)) }
    exactStamps.splice(0)
  }

  function recordExactValidation(
    path: readonly PropertyKey[],
    snapshots: readonly ValidationSnapshot<Registration>[],
    activeIds: ReadonlySet<symbol>,
  ): void {
    const previousStamp = exactStamps.findIndex(stamp => pathsEqual(stamp.path, path))
    if (previousStamp >= 0) {
      exactStamps.splice(previousStamp, 1)
    }
    exactStamps.push({
      path,
      snapshots: snapshots.filter(snapshot => activeIds.has(snapshot.id)),
    })
  }

  function readAggregateState(): ObservedValidationState {
    void stateRevision.value
    if (resetCapture?.phase === 'capture') {
      return resetCapture.aggregateState
    }
    const currentSnapshots = [...registrations.entries()].map(([id, registration]) => currentSnapshot(id, registration))
    rememberSnapshots(currentSnapshots)
    initialiseDeferredBaselines(currentSnapshots)
    const dirty = currentSnapshots.some((snapshot) => {
      const registrationState = registrationStates.get(snapshot.id)
      return registrationState !== undefined
        && !structurallyEqual(snapshot.input, registrationState.baseline)
    })
    const touched = [...registrationStates.values()].some(registration => registration.touched.length > 0)
    const validated = fullStamp !== undefined
    const stale = fullStamp !== undefined && !stampsEqual(fullStamp.snapshots, currentSnapshots)
    const next = createState(dirty, touched, validated, stale, readActivity().validating)
    if (lastAggregateState === undefined || !validationStatesEqual(lastAggregateState, next)) {
      lastAggregateState = next
    }
    return lastAggregateState
  }

  function stateFor(path: readonly PropertyKey[]): ObservedValidationState {
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
      const registrationState = registrationStates.get(snapshot.id)
      if (!registrationState) {
        return false
      }
      const localPath = path.slice(snapshot.registration.at.length)
      return !resolvedInputsEqual(
        resolveInput(snapshot.input, localPath),
        resolveInput(registrationState.baseline, localPath),
      )
    })
    const touched = matching.some((snapshot) => {
      const registrationState = registrationStates.get(snapshot.id)
      return registrationState?.touched.some(touchedPath => pathsEqual(touchedPath, path)) ?? false
    })
    const stamp = [...exactStamps].reverse().find(candidate => pathsEqual(candidate.path, path)) ?? fullStamp
    const stampedSnapshots = stamp?.snapshots.filter(snapshot => pathStartsWith(path, snapshot.registration.at)) ?? []
    const validated = stampedSnapshots.length > 0
    const stale = validated && !stampsEqual(stampedSnapshots, matching)
    const activity = readActivity()
    const activeFullSnapshots = activity.activeFull?.snapshots
    const validating = activity.targetPaths.some(target => pathsEqual(target, path))
      || (activity.activeFull !== undefined && (activeFullSnapshots === undefined
        ? matching.length > 0
        : activeFullSnapshots.some(snapshot => registrations.get(snapshot.id) === snapshot.registration
          && pathStartsWith(path, snapshot.registration.at))))
    return createState(dirty, touched, validated, stale, validating)
  }

  function readCapturedPathState(
    path: readonly PropertyKey[],
    observedSnapshots: readonly ValidationSnapshot<Registration>[],
  ): ObservedValidationState {
    const matching = [...registrations.entries()].filter(([, registration]) => pathStartsWith(path, registration.at))
    const currentSnapshots = matching.flatMap(([id, registration]) => {
      const snapshot = observedSnapshots.find(candidate => candidate.id === id && candidate.registration === registration)
      return snapshot ? [snapshot] : []
    })
    const dirty = currentSnapshots.some((snapshot) => {
      const registrationState = registrationStates.get(snapshot.id)
      if (!registrationState) {
        return false
      }
      const localPath = path.slice(snapshot.registration.at.length)
      return !resolvedInputsEqual(
        resolveInput(snapshot.input, localPath),
        resolveInput(registrationState.baseline, localPath),
      )
    })
    const touched = matching.some(([id]) => registrationStates.get(id)?.touched.some(
      touchedPath => pathsEqual(touchedPath, path),
    ) ?? false)
    const stamp = [...exactStamps].reverse().find(candidate => pathsEqual(candidate.path, path)) ?? fullStamp
    const stampedSnapshots = stamp?.snapshots.filter(snapshot => matching.some(
      ([id, registration]) => snapshot.id === id && snapshot.registration === registration,
    )) ?? []
    const validated = stampedSnapshots.length > 0
    const stale = validated && (currentSnapshots.length !== matching.length
      || !stampsEqual(stampedSnapshots, currentSnapshots))
    const activity = readActivity()
    const activeFullSnapshots = activity.activeFull?.snapshots
    const validating = activity.targetPaths.some(target => pathsEqual(target, path))
      || (activity.activeFull !== undefined && (activeFullSnapshots === undefined
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
    for (const [id, registration] of registrations) {
      const registrationState = registrationStates.get(id)
      if (!registrationState
        || !pathStartsWith(path, registration.at)
        || registrationState.touched.some(touchedPath => pathsEqual(touchedPath, path))) {
        continue
      }
      registrationState.touched.push(Object.freeze([...path]))
      changed = true
    }
    if (changed) {
      safelyInvalidate()
    }
  }

  function beginReset(): boolean {
    if (resetCapture) {
      return false
    }
    resetCapture = {
      aggregateState: lastAggregateState ?? createState(
        false,
        [...registrationStates.values()].some(registration => registration.touched.length > 0),
        fullStamp !== undefined,
        false,
        readActivity().validating,
      ),
      observedSnapshots: [...lastObservedSnapshots.values()],
      phase: 'capture',
    }
    return true
  }

  function captureResetBaselines(): readonly ResetBaseline<Registration>[] {
    return [...registrations.entries()].map(([id, registration]) => ({
      id,
      registration,
      input: snapshotValidationData(registration.data),
    }))
  }

  function commitResetBaselines(baselines: readonly ResetBaseline<Registration>[]): void {
    for (const baseline of baselines) {
      if (registrations.get(baseline.id) !== baseline.registration) {
        continue
      }
      const registrationState = registrationStates.get(baseline.id)
      if (registrationState?.registration === baseline.registration) {
        registrationState.baseline = baseline.input
        registrationState.touched.splice(0)
      }
    }
    fullStamp = undefined
    exactStamps.splice(0)
  }

  function beginResetCommit(): void {
    if (resetCapture) {
      resetCapture.phase = 'commit'
    }
  }

  function abortReset(): void {
    resetCapture = undefined
    safelyInvalidate()
  }

  function finishReset(): void {
    resetCapture = undefined
    lastAggregateState = undefined
    lastObservedSnapshots.clear()
    safelyInvalidate()
  }

  function isResetting(): boolean {
    return resetCapture !== undefined
  }

  function currentSnapshot(id: symbol, registration: Registration): ValidationSnapshot<Registration> {
    const previousObserver = stateObservers.get(id)
    const observer = effectScope(true)
    let snapshot!: ValidationSnapshot<Registration>
    try {
      observer.run(() => effect(() => {
        const registrationState = registrationStates.get(id)
        snapshot = {
          id,
          registration,
          schema: unref(registration.schema) as StandardSchemaV1,
          input: registrationState?.baseline === UNCAPTURED_BASELINE
            && suppressedAccessorCaptures.has(registration)
            ? UNCAPTURED_BASELINE
            : snapshotValidationData(registration.data),
        }
      }, { scheduler: safelyInvalidate }))
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

  function rememberSnapshots(snapshots: readonly ValidationSnapshot<Registration>[]): void {
    for (const snapshot of snapshots) {
      if (snapshot.input === UNCAPTURED_BASELINE) {
        continue
      }
      lastObservedSnapshots.set(snapshot.id, snapshotForStamp(snapshot))
    }
  }

  function snapshotForStamp(snapshot: ValidationSnapshot<Registration>): ValidationSnapshot<Registration> {
    return {
      ...snapshot,
      input: snapshotValidationData(snapshot.input),
    }
  }

  function initialiseDeferredBaselines(snapshots: readonly ValidationSnapshot<Registration>[]): void {
    if (resetCapture) {
      return
    }
    for (const snapshot of snapshots) {
      const registrationState = registrationStates.get(snapshot.id)
      if (registrationState?.registration === snapshot.registration
        && registrationState.baseline === UNCAPTURED_BASELINE
        && snapshot.input !== UNCAPTURED_BASELINE) {
        registrationState.baseline = snapshotValidationData(snapshot.input)
      }
    }
  }

  function invalidate(): void {
    stateRevision.value++
  }

  function safelyInvalidate(): void {
    try {
      invalidate()
    }
    catch {
      // Rollback must complete even when the observer that caused it still throws.
    }
  }

  return {
    state,
    addRegistration,
    removeRegistration,
    captureAll,
    captureAt,
    recordFullValidation,
    recordExactValidation,
    stateFor,
    touch,
    beginReset,
    captureResetBaselines,
    commitResetBaselines,
    beginResetCommit,
    abortReset,
    finishReset,
    isResetting,
    invalidate,
    safelyInvalidate,
  }
}

function createState(
  dirty: boolean,
  touched: boolean,
  validated: boolean,
  stale: boolean,
  validating: boolean,
): ObservedValidationState {
  return Object.freeze({ dirty, touched, validated, stale, validating })
}

function validationStatesEqual(actual: ObservedValidationState, expected: ObservedValidationState): boolean {
  return actual.dirty === expected.dirty
    && actual.touched === expected.touched
    && actual.validated === expected.validated
    && actual.stale === expected.stale
    && actual.validating === expected.validating
}

function resolvedInputsEqual(
  actual: ReturnType<typeof resolveInput>,
  expected: ReturnType<typeof resolveInput>,
): boolean {
  return actual.present === expected.present
    && (!actual.present || structurallyEqual(actual.value, expected.value))
}

function stampsEqual<Registration extends ObservableRegistration>(
  expected: readonly ValidationSnapshot<Registration>[],
  actual: readonly ValidationSnapshot<Registration>[],
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
