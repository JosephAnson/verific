import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, InjectionKey, MaybeRef, ShallowRef } from 'vue'
import type { IssueNormaliser, MessageResolver, ValidationIssue } from '../messages'
import type { InternalValidationScope } from '../validation/scope'
import { computed, getCurrentInstance, getCurrentScope, inject, onScopeDispose, provide } from 'vue'
import { VERIFIC_SYMBOL } from '../utils/constants'
import { unwrapSchema } from '../utils/schemaUtils'
import { resolveValidationMessage } from '../validation/issuePipeline'
import { pathsEqual, selectorSegments } from '../validation/paths'
import { structurallyEqual } from '../validation/registrationObservation'
import { createValidationScope } from '../validation/scope'

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
  readonly validateOn?: ValidationTrigger
  readonly debounce?: number
}

export type ValidationResult
  = | { readonly success: true, readonly issues: readonly ValidationIssue[] }
    | { readonly success: false, readonly issues: readonly ValidationIssue[] }

export interface TargetValidationResult {
  readonly issues: readonly ValidationIssue[]
}

export type ValidationTrigger = 'blur' | 'change' | 'input' | 'submit'

export interface ValidationBindingOptions {
  readonly trigger?: ValidationTrigger
  readonly debounce?: number
  readonly describedBy?: string
}

export interface ValidationBindings {
  readonly 'aria-invalid': boolean
  readonly 'aria-describedby': string | undefined
  readonly 'onBlur'?: () => Promise<TargetValidationResult>
  readonly 'onChange'?: () => Promise<TargetValidationResult>
  readonly 'onInput'?: () => Promise<TargetValidationResult>
}

export interface ValidationGroupBindings {
  readonly 'aria-invalid': boolean
  readonly 'aria-describedby': string | undefined
  readonly 'onChange': () => Promise<TargetValidationResult>
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
}

export interface ValidationController<Schema extends StandardSchemaV1>
  extends ValidationGroup<ValidationPath<Schema>> {
  readonly ownIssues: ComputedRef<readonly ValidationIssue[]>
  readonly result: Readonly<ShallowRef<RegistrationResult<StandardSchemaV1.InferOutput<Schema>>>>
  commit: (path: ValidationPath<Schema>, options?: Pick<ValidationBindingOptions, 'debounce'>) => Promise<TargetValidationResult>
  on: (path: ValidationPath<Schema>, options?: ValidationBindingOptions) => ValidationBindings
  group: (path: ValidationPath<Schema>, options?: Pick<ValidationBindingOptions, 'debounce' | 'describedBy'>) => ValidationGroupBindings
}

const localScopes = new WeakMap<object, InternalValidationScope>()
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
  unwrapSchema(schema)
  const registration = scope.addValidation(schema, model as ValidationData<Schema>, options, createScope)
  if (getCurrentScope()) {
    onScopeDispose(registration.remove)
  }

  const group = createGroup<ValidationPath<Schema>>(scope, groupPrefix)
  const result = computed(() => registration.readResult() as RegistrationResult<StandardSchemaV1.InferOutput<Schema>>)
  const ownIssues = computed(registration.readIssues)
  const bindings = createBindings(group, scope, groupPrefix, {
    validateOn: options.validateOn,
    debounce: options.debounce,
  })

  if (getCurrentScope()) {
    onScopeDispose(bindings.dispose)
  }

  return {
    ...group,
    ownIssues,
    result: result as unknown as Readonly<ShallowRef<RegistrationResult<StandardSchemaV1.InferOutput<Schema>>>>,
    commit: bindings.commit,
    on: bindings.on,
    group: bindings.group,
  }
}

interface CommitRecord {
  readonly path: readonly PropertyKey[]
  value: unknown
  pending?: Promise<TargetValidationResult>
  queued?: Promise<TargetValidationResult>
  timer?: ReturnType<typeof setTimeout>
  resolve?: (result: TargetValidationResult) => void
  reject?: (reason: unknown) => void
}

function createBindings<Path>(
  group: ValidationGroup<Path>,
  scope: InternalValidationScope,
  prefix: readonly PropertyKey[],
  defaults: Pick<ValidationOptions, 'validateOn' | 'debounce'>,
) {
  const records: CommitRecord[] = []
  let disposed = false
  const stopReset = scope.onReset(cancelQueued)

  function readValue(path: Path): unknown {
    return scope.captureBindingContext([...prefix, ...selectorSegments(path)])
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

  function run(path: Path, record: CommitRecord, value: unknown): Promise<TargetValidationResult> {
    record.value = value
    group.touch(path)
    const pending = group.validateAt(path)
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

  function commit(path: Path, options: Pick<ValidationBindingOptions, 'debounce'> = {}): Promise<TargetValidationResult> {
    if (disposed)
      return Promise.reject(abortError())
    const debounce = options.debounce ?? defaults.debounce ?? 0
    if (!Number.isFinite(debounce) || debounce < 0)
      return Promise.reject(new RangeError('debounce must be a finite non-negative number'))
    const record = recordFor(path)
    const value = readValue(path)
    const state = group.stateFor(path)
    if (!record.queued && structurallyEqual(record.value, value)) {
      if (record.pending)
        return record.pending
      if (state.validated && !state.stale) {
        group.touch(path)
        return Promise.resolve({ issues: group.issuesFor(path) })
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
      : new Promise<TargetValidationResult>((resolve, reject) => {
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
        void run(path, record, readValue(path)).then(resolve, reject)
      }
      catch (reason) {
        reject(reason)
      }
    }, debounce)
    return pending
  }

  function on(path: Path, options: ValidationBindingOptions = {}): ValidationBindings {
    const trigger = options.trigger ?? defaults.validateOn
    const handler = () => commit(path, options)
    return {
      get 'aria-invalid'() { return group.hasError(path) },
      'aria-describedby': options.describedBy,
      'onBlur': trigger === undefined || trigger === 'blur' ? handler : undefined,
      'onChange': trigger === undefined || trigger === 'change' ? handler : undefined,
      'onInput': trigger === 'input' ? handler : undefined,
    }
  }

  function validationGroup(path: Path, options: Pick<ValidationBindingOptions, 'debounce' | 'describedBy'> = {}): ValidationGroupBindings {
    const commitOptions = { debounce: options.debounce ?? defaults.debounce }
    return {
      get 'aria-invalid'() { return group.hasError(path) },
      'aria-describedby': options.describedBy,
      'onChange': () => commit(path, commitOptions),
    }
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

  return { commit, on, group: validationGroup, dispose }
}

function provideScope(instance: object, options: ValidationScopeOptions): InternalValidationScope {
  const application = inject(VERIFIC_SYMBOL, undefined)
  const scope = createValidationScope(options, application?.options)
  localScopes.set(instance, scope)
  provide(VALIDATION_SCOPE_SYMBOL, scope)
  return scope
}

function createGroup<Path>(scope: InternalValidationScope, prefix: readonly PropertyKey[]): ValidationGroup<Path> {
  const issues = computed(scope.readIssues)

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

  function validateAt(path: Path): Promise<TargetValidationResult> {
    return scope.validateAt(resolvePath(path))
  }

  return {
    issues,
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
    validate: scope.validate,
    validateAt,
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
