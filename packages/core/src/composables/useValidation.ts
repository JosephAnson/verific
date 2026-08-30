import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, InjectionKey, MaybeRef, ShallowRef } from 'vue'
import type { IssueNormaliser, MessageResolver, ValidationIssue } from '../messages'
import type { InternalValidationScope } from '../validation/scope'
import { computed, getCurrentInstance, getCurrentScope, inject, onScopeDispose, provide } from 'vue'
import { VERIFIC_SYMBOL } from '../utils/constants'
import { unwrapSchema } from '../utils/schemaUtils'
import { resolveValidationMessage } from '../validation/issuePipeline'
import { pathsEqual, selectorSegments } from '../validation/paths'
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
}

export interface ValidationController<Schema extends StandardSchemaV1>
  extends ValidationGroup<ValidationPath<Schema>> {
  readonly ownIssues: ComputedRef<readonly ValidationIssue[]>
  readonly result: Readonly<ShallowRef<RegistrationResult<StandardSchemaV1.InferOutput<Schema>>>>
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

  return {
    ...group,
    ownIssues,
    result: result as unknown as Readonly<ShallowRef<RegistrationResult<StandardSchemaV1.InferOutput<Schema>>>>,
  }
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
