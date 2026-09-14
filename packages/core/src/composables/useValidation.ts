import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, InjectionKey, MaybeRef, Ref, ShallowRef } from 'vue'
import type { IssueNormaliser, MessageResolver, ValidationIssue } from '../messages'
import type { ValidationArray } from '../validation/array'
import type { InternalValidationScope } from '../validation/scope'
import type { SubmitCallback } from '../validation/submission'
import { computed, effectScope, getCurrentInstance, getCurrentScope, inject, onScopeDispose, provide, unref } from 'vue'
import { VERIFIC_SYMBOL } from '../utils/constants'
import { unwrapSchema } from '../utils/schemaUtils'
import { createArrayHelpers } from '../validation/array'
import { resolveValidationMessage } from '../validation/issuePipeline'
import { pathsEqual, selectorSegments } from '../validation/paths'
import { structurallyEqual } from '../validation/registrationObservation'
import { createValidationScope as createInternalScope } from '../validation/scope'
import { createSubmission } from '../validation/submission'

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
  readonly debounce?: number
}

export type ValidationResult
  = | { readonly success: true, readonly issues: readonly ValidationIssue[] }
    | { readonly success: false, readonly issues: readonly ValidationIssue[] }

export interface ValidationCommitOptions {
  readonly debounce?: number
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
  readonly isSubmitting: ComputedRef<boolean>
  readonly submitCount: ComputedRef<number>
  handleSubmit: (callback: SubmitCallback) => () => Promise<ValidationResult>
  setIssues: (path: Path, issues: readonly StandardSchemaV1.Issue[]) => void
  clearIssues: (path?: Path) => void
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
  validate: {
    (): Promise<ValidationResult>
    (path: Path): Promise<ValidationResult>
  }
}

export interface ValidationController<Schema extends StandardSchemaV1>
  extends ValidationGroup<ValidationPath<Schema>> {
  array: <Item>(path: ValidationPath<Schema>, items: Ref<Item[]>) => ValidationArray<Item>
  readonly ownIssues: ComputedRef<readonly ValidationIssue[]>
  readonly result: Readonly<ShallowRef<RegistrationResult<StandardSchemaV1.InferOutput<Schema>>>>
  commit: (path: ValidationPath<Schema>, options?: ValidationCommitOptions) => Promise<ValidationResult>
}

export interface StandaloneValidationScope extends ValidationGroup {
  register: <Schema extends StandardSchemaV1>(schema: MaybeRef<Schema>, model: ValidationData<Schema>, options?: Omit<ValidationOptions, 'scope'>) => ValidationController<Schema>
  dispose: () => void
}

export function createValidationScope(options: Omit<ValidationScopeOptions, 'scope'> = {}): StandaloneValidationScope {
  const lifetime = effectScope(true)
  const scope = createInternalScope(options)
  lifetime.run(() => onScopeDispose(scope.dispose))
  const group = createGroup(scope, [])
  if (getCurrentScope())
    onScopeDispose(() => lifetime.stop())
  return {
    ...group,
    register(schema, model, registrationOptions = {}) {
      if (!lifetime.active)
        throw new Error('Validation scope was disposed')
      return lifetime.run(() => createController(scope, schema, model, registrationOptions, false))!
    },
    dispose: () => lifetime.stop(),
  }
}

const localScopes = new WeakMap<object, InternalValidationScope>()
const submissions = new WeakMap<InternalValidationScope, ReturnType<typeof createSubmission>>()
const VALIDATION_SCOPE_SYMBOL = Symbol('validation-scope') as InjectionKey<InternalValidationScope>

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
  return createController(scope, schema, model as ValidationData<Schema>, options, createScope)
}

function createController<Schema extends StandardSchemaV1>(
  scope: InternalValidationScope,
  schema: MaybeRef<Schema>,
  model: ValidationData<Schema>,
  options: ValidationOptions,
  creatingScope: boolean,
): ValidationController<Schema> {
  const groupPrefix = Object.freeze([...(options.at ?? [])])
  unwrapSchema(schema)
  const registration = scope.addValidation(schema, model, options, creatingScope)
  if (getCurrentScope()) {
    onScopeDispose(registration.remove)
  }

  const group = createGroup<ValidationPath<Schema>>(scope, groupPrefix)
  const result = computed(() => registration.readResult() as RegistrationResult<StandardSchemaV1.InferOutput<Schema>>)
  const ownIssues = computed(registration.readIssues)
  const commits = createCommitController(group, scope, groupPrefix, {
    debounce: options.debounce,
  })

  if (getCurrentScope()) {
    onScopeDispose(commits.dispose)
  }

  return {
    ...group,
    ownIssues,
    result: result as unknown as Readonly<ShallowRef<RegistrationResult<StandardSchemaV1.InferOutput<Schema>>>>,
    setIssues: (path, issues) => registration.setIssues(selectorSegments(path), issues),
    commit: commits.commit,
    array(path, items) {
      const local = [...selectorSegments(path)]
      return createArrayHelpers(items, () => {
        scope.signal.throwIfAborted()
        let input: unknown = unref(model)
        for (const segment of local) {
          input = typeof input === 'object' && input !== null && Object.hasOwn(input, segment)
            ? unref(Reflect.get(input, segment))
            : undefined
        }
        if (input !== items.value)
          throw new Error('Array ref must be the registered model property')
        scope.captureCommitContext([...groupPrefix, ...local])
      }, (order, updateModel) => scope.remapArray([...groupPrefix, ...local], order, updateModel))
    },
  }
}

interface CommitRecord {
  readonly path: readonly PropertyKey[]
  value: unknown
  pending?: Promise<ValidationResult>
  queued?: Promise<ValidationResult>
  timer?: ReturnType<typeof setTimeout>
  resolve?: (result: ValidationResult) => void
  reject?: (reason: unknown) => void
}

function createCommitController<Path>(
  group: ValidationGroup<Path>,
  scope: InternalValidationScope,
  prefix: readonly PropertyKey[],
  defaults: ValidationCommitOptions,
) {
  const records: CommitRecord[] = []
  let disposed = false
  const stopReset = scope.onCancel(cancelQueued)

  function readContext(path: Path): unknown {
    return scope.captureCommitContext([...prefix, ...selectorSegments(path)])
  }

  function recordFor(path: Path): CommitRecord {
    const segments = [...selectorSegments(path)]
    let record = records.find(candidate => pathsEqual(candidate.path, segments))
    if (!record) {
      record = { path: Object.freeze(segments), value: Symbol('uncommitted') }
      records.push(record)
    }
    return record
  }

  function run(path: Path, record: CommitRecord, value: unknown): Promise<ValidationResult> {
    record.value = value
    group.touch(path)
    const pending = group.validate(path)
    record.pending = pending
    void pending.then(() => {
      if (record.pending === pending) {
        record.pending = undefined
      }
    }, () => {
      if (record.pending === pending) {
        record.value = Symbol('failed')
        record.pending = undefined
      }
    })
    return pending
  }

  function commit(path: Path, options: ValidationCommitOptions = {}): Promise<ValidationResult> {
    if (disposed)
      return Promise.reject(abortError())
    const debounce = options.debounce ?? defaults.debounce ?? 0
    if (!Number.isFinite(debounce) || debounce < 0)
      return Promise.reject(new RangeError('debounce must be a finite non-negative number'))
    const record = recordFor(path)
    const value = readContext(path)
    const state = group.stateFor(path)
    if (!record.queued && structurallyEqual(record.value, value)) {
      if (record.pending)
        return record.pending
      if (state.validated && !state.stale) {
        group.touch(path)
        const issues = group.issuesFor(path)
        return Promise.resolve({ success: issues.length === 0, issues })
      }
    }

    if (record.timer !== undefined)
      clearTimeout(record.timer)
    if (!debounce) {
      const resolve = record.resolve
      const reject = record.reject
      record.queued = undefined
      record.timer = undefined
      record.resolve = undefined
      record.reject = undefined
      const pending = run(path, record, value)
      if (resolve)
        void pending.then(resolve, reject)
      return pending
    }

    const pending = record.queued
      ? record.queued
      : new Promise<ValidationResult>((resolve, reject) => {
          record.resolve = resolve
          record.reject = reject
        })
    record.queued = pending
    record.timer = setTimeout(() => {
      const resolve = record.resolve!
      const reject = record.reject!
      record.timer = undefined
      record.queued = undefined
      record.resolve = undefined
      record.reject = undefined
      try {
        void run(path, record, readContext(path)).then(resolve, reject)
      }
      catch (reason) {
        reject(reason)
      }
    }, debounce)
    return pending
  }

  function cancelQueued(reason: Error): void {
    for (const record of records) {
      if (record.timer !== undefined) {
        clearTimeout(record.timer)
        record.reject?.(reason)
        record.timer = undefined
        record.pending = undefined
        record.resolve = undefined
        record.reject = undefined
      }
    }
    records.splice(0)
  }

  function abortError(): Error {
    const reason = new Error('Validation commit was disposed')
    reason.name = 'AbortError'
    return reason
  }

  function dispose(): void {
    disposed = true
    stopReset()
    cancelQueued(abortError())
  }

  return { commit, dispose }
}

function provideScope(instance: object, options: ValidationScopeOptions): InternalValidationScope {
  const application = inject(VERIFIC_SYMBOL, undefined)
  const scope = createInternalScope(options, application?.options)
  onScopeDispose(scope.dispose)
  localScopes.set(instance, scope)
  provide(VALIDATION_SCOPE_SYMBOL, scope)
  return scope
}

function createGroup<Path>(scope: InternalValidationScope, prefix: readonly PropertyKey[]): ValidationGroup<Path> {
  const issues = computed(scope.readIssues)
  let submission = submissions.get(scope)
  if (!submission) {
    submission = createSubmission(scope)
    submissions.set(scope, submission)
  }

  function resolvePath(path: Path): PropertyKey[] {
    return [...prefix, ...selectorSegments(path)]
  }

  function issuesFor(path: Path): readonly ValidationIssue[] {
    const resolved = resolvePath(path)
    return issues.value.filter(issue => pathsEqual(issue.path, resolved))
  }

  function errorsFor(path: Path): readonly string[] {
    return issuesFor(path).map(resolveValidationMessage)
  }

  function validate(path?: Path): Promise<ValidationResult> {
    return path === undefined ? scope.validate() : scope.validate(resolvePath(path))
  }

  return {
    issues,
    ...submission,
    setIssues: (path, rawIssues) => scope.setIssues(resolvePath(path), rawIssues),
    clearIssues: path => scope.clearIssues(path === undefined ? undefined : resolvePath(path)),
    errors: computed(scope.readErrors),
    isValidating: computed(() => scope.isValidating.value),
    state: scope.state,
    issuesFor,
    hasError: path => issuesFor(path).length > 0,
    errorsFor,
    errorFor: path => errorsFor(path)[0],
    stateFor: path => scope.stateFor(resolvePath(path)),
    touch: path => scope.touch(resolvePath(path)),
    resetState: scope.resetState,
    validate,
  }
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
