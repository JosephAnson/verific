import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { App, Component } from 'vue'
import type { DiagnosticMessageAdapter, IssueNormaliser, MessageContext, TargetValidationResult, ValidationController, ValidationGroup, ValidationIssue, ValidationResult, ValidationState } from '../src/main'
import process from 'node:process'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { computed, createApp, customRef, defineComponent, h, isReadonly, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { createVerific, useValidation } from '../src/main'
import { loadValibot, loadZod, valibotVersion, zodVersion } from './fixtures/pinnedValidators'

const mountedApps: App[] = []

afterEach(() => {
  vi.restoreAllMocks()
  mountedApps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
})

describe('useValidation composition', () => {
  it('creates a schema-owning scope without a plugin and joins it in the same component', async () => {
    const first = createSchema<{ email: string }>('test', value => value.email
      ? { value }
      : { issues: [{ message: 'Email is required', path: ['email'] }] })
    const secondValidator = vi.fn(() => ({ issues: [{ message: 'Code is required', path: ['code'] }] }))
    const second = createSchema<{ code: string }>('test', secondValidator)
    const mounted = mountValidation(() => {
      const root = useValidation(first, { email: ref('') })
      const sibling = useValidation(second, { code: ref('') })
      return { root, sibling }
    }, false)

    const result = await mounted.value.root.validate()

    expect(result.success).toBe(false)
    expect(result.issues.map(issue => issue.message)).toEqual(['Email is required', 'Code is required'])
    expect(mounted.value.sibling.issues.value).toEqual(result.issues)
    expect(mounted.value.root.ownIssues.value.map(issue => issue.message)).toEqual(['Email is required'])
    expect(mounted.value.sibling.ownIssues.value.map(issue => issue.message)).toEqual(['Code is required'])
    expect(secondValidator).toHaveBeenCalledOnce()
  })

  it('supports an orchestration-only root and descendant registrations', async () => {
    const validator = vi.fn(() => ({ issues: [{ message: 'Invalid child', path: ['name'] }] }))
    const schema = createSchema<{ name: string }>('test', validator)
    let root!: ValidationGroup
    let child!: ReturnType<typeof useValidation<typeof schema>>
    const Child = defineComponent({
      setup() {
        child = useValidation(schema, { name: ref('') })
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        root = useValidation()
        return () => h(Child)
      },
    })
    mountComponent(Parent, false)

    await expect(root.validate()).resolves.toMatchObject({ success: false })
    expect(root.issues.value).toEqual(child.issues.value)
    expect(validator).toHaveBeenCalledOnce()
  })

  it('creates independent nested scopes with scope new', async () => {
    const outerSchema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Outer' }] }))
    const innerSchema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Inner' }] }))
    const grandchildSchema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Grandchild' }] }))
    let outer!: ReturnType<typeof useValidation<typeof outerSchema>>
    let inner!: ReturnType<typeof useValidation<typeof innerSchema>>
    const Grandchild = defineComponent({
      setup() {
        useValidation(grandchildSchema, {})
        return () => null
      },
    })
    const Inner = defineComponent({
      setup() {
        inner = useValidation(innerSchema, {}, { scope: 'new' })
        return () => h(Grandchild)
      },
    })
    const Parent = defineComponent({
      setup() {
        outer = useValidation(outerSchema, {})
        return () => h(Inner)
      },
    })
    mountComponent(Parent, false)

    await outer.validate()
    await inner.validate()

    expect(outer.issues.value.map(issue => issue.message)).toEqual(['Outer'])
    expect(inner.issues.value.map(issue => issue.message)).toEqual(['Inner', 'Grandchild'])
  })

  it('rejects scope operations outside component setup', () => {
    expect(() => useValidation()).toThrow('useValidation() must be called during component setup')
  })

  it('rejects policy changes on an argumentless joining call', () => {
    expect(() => mountValidation(() => {
      useValidation()
      return useValidation({ messages: () => 'message' })
    }, false)).toThrow('cannot configure an existing scope')
  })
})

describe('validation state and paths', () => {
  it('preserves raw issues, normalises paths and selects exact relative paths', async () => {
    const rawParent = { message: 'Address issue', path: [{ key: 'address' }] }
    const rawChild = { message: 'Postcode issue', path: [{ key: 'address' }, { key: 'postcode' }] }
    const schema = createSchema<{ address: { postcode: string } }>('test', () => ({ issues: [rawParent, rawChild] }))
    const mounted = mountValidation(() => useValidation(schema, ref({ address: { postcode: '' } }), { at: ['shipping'] }), false)

    await mounted.value.validate()

    expect(mounted.value.issuesFor('address').map(issue => issue.message)).toEqual(['Address issue'])
    expect(mounted.value.hasError('address')).toBe(true)
    expect(mounted.value.issuesFor(['address', 'postcode']).map(issue => issue.message)).toEqual(['Postcode issue'])
    expect(mounted.value.hasError(['address', 'postcode'])).toBe(true)
    expect(mounted.value.issuesFor('shipping' as never)).toEqual([])
    expect(mounted.value.hasError('shipping' as never)).toBe(false)
    const issue = mounted.value.ownIssues.value[1]!
    expect(issue.raw).toBe(rawChild)
    expect(issue.vendor).toBe('test')
    expect(issue.localPath).toEqual(['address', 'postcode'])
    expect(issue.path).toEqual(['shipping', 'address', 'postcode'])
  })

  it('resolves pathless child issues to the registration prefix', async () => {
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Shipping invalid' }] }))
    const mounted = mountValidation(() => useValidation(schema, {}, { at: ['shipping'] }), false)

    await mounted.value.validate()

    expect(mounted.value.issuesFor([]).map(issue => issue.message)).toEqual(['Shipping invalid'])
  })

  it('retains duplicate issues in registration and validator order', async () => {
    const schema = createSchema<{ email: string }>('test', () => ({
      issues: [
        { message: 'Invalid', path: ['email'] },
        { message: 'Invalid', path: ['email'] },
      ],
    }))
    const mounted = mountValidation(() => {
      const first = useValidation(schema, { email: ref('') })
      useValidation(schema, { email: ref('') })
      return first
    }, false)

    await mounted.value.validate()

    expect(mounted.value.errorsFor('email')).toEqual(['Invalid', 'Invalid', 'Invalid', 'Invalid'])
  })

  it('preserves transformed output without mutating the model', async () => {
    const schema = createSchema<{ count: string }, { count: number }>('test', value => ({ value: { count: Number(value.count) } }))
    const model = reactive({ count: '42' })
    const mounted = mountValidation(() => useValidation(schema, model), false)

    await mounted.value.validate()

    expect(mounted.value.result.value).toEqual({ status: 'valid', value: { count: 42 } })
    expect(model).toEqual({ count: '42' })
    expectTypeOf(mounted.value.result.value).toEqualTypeOf<
      | { readonly status: 'idle' }
      | { readonly status: 'valid', readonly value: { count: number } }
      | { readonly status: 'invalid', readonly issues: readonly import('../src/main').ValidationIssue[] }
    >()
  })

  it('treats defined empty issues as failure and undefined issues as success', async () => {
    const emptyFailure = createSchema<unknown>('test', () => ({ issues: [] }))
    const explicitSuccess = createSchema<unknown, string>('test', () => ({ value: 'ok', issues: undefined }))
    const mounted = mountValidation(() => {
      const failure = useValidation(emptyFailure, {})
      const success = useValidation(explicitSuccess, {})
      return { failure, success }
    }, false)

    await expect(mounted.value.failure.validate()).resolves.toEqual({ success: false, issues: [] })
    expect(mounted.value.failure.result.value).toEqual({ status: 'invalid', issues: [] })
    expect(mounted.value.success.result.value).toEqual({ status: 'valid', value: 'ok' })
  })

  it('snapshots nested data synchronously', async () => {
    let resume!: () => void
    const validator = vi.fn(async (value: { profile: { name: string } }) => {
      await new Promise<void>((resolve) => {
        resume = resolve
      })
      return { value }
    })
    const schema = createSchema<{ profile: { name: string } }>('test', validator)
    const model = ref({ profile: { name: 'Before' } })
    const mounted = mountValidation(() => useValidation(schema, model), false)

    const validation = mounted.value.validate()
    model.value.profile.name = 'After'
    resume()
    await validation

    expect(validator).toHaveBeenCalledWith({ profile: { name: 'Before' } })
  })
})

describe('targeted validation', () => {
  it('runs the complete schema, publishes only the exact path and leaves full results idle', async () => {
    const model = reactive({ password: 'secret', confirmation: '', profile: { name: '' } })
    const validator = vi.fn((value: typeof model) => ({
      issues: [
        ...(value.confirmation === value.password ? [] : [{ message: 'Does not match', path: ['confirmation'] }]),
        { message: 'Nested', path: ['profile', 'name'] },
        { message: 'Unrelated', path: ['password'] },
      ],
    }))
    const schema = createSchema<typeof model>('test', validator)
    const mounted = mountValidation(() => useValidation(schema, model), false)

    const targeted = mounted.value.validateAt('confirmation')
    expectTypeOf(targeted).toEqualTypeOf<Promise<TargetValidationResult>>()
    expectTypeOf(mounted.value.validate).returns.toEqualTypeOf<Promise<ValidationResult>>()
    const targetedResult = await targeted
    expect(targetedResult).toMatchObject({
      issues: [expect.objectContaining({ message: 'Does not match' })],
    })
    expect(targetedResult).not.toHaveProperty('success')
    expectTypeOf(targetedResult).toEqualTypeOf<TargetValidationResult>()
    if (false) {
      // @ts-expect-error Targeted validation does not expose submission authority.
      void targetedResult.success
      // @ts-expect-error Targeted issue collections are readonly.
      targetedResult.issues.push(targetedResult.issues[0]!)
    }

    expect(validator).toHaveBeenCalledWith({ password: 'secret', confirmation: '', profile: { name: '' } })
    expect(mounted.value.errors.value).toEqual(['Does not match'])
    expect(mounted.value.ownIssues.value).toEqual(mounted.value.issues.value)
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    expectTypeOf(mounted.value.validateAt).parameter(0).toEqualTypeOf<'password' | 'confirmation' | 'profile' | readonly PropertyKey[]>()
    if (false) {
      // @ts-expect-error Schema controllers reject unknown top-level keys.
      void mounted.value.validateAt('missing')
    }
  })

  it('replaces one path in place, clears stale issues and preserves unrelated issue identity', async () => {
    const name = ref('')
    const email = ref('')
    const password = ref('')
    const schema = createSchema<{ name: string, email: string, password: string }>('test', value => ({
      issues: [
        { message: 'Name required', path: ['name'] },
        ...(value.email === 'valid@example.com'
          ? []
          : [{ message: value.email ? 'Email invalid' : 'Email required', path: ['email'] }]),
        ...(value.password ? [] : [{ message: 'Password required', path: ['password'] }]),
      ],
    }))
    const mounted = mountValidation(() => useValidation(schema, { name, email, password }), false)
    await mounted.value.validate()
    const retainedNameIssue = mounted.value.issuesFor('name')[0]
    const retainedPasswordIssue = mounted.value.issuesFor('password')[0]

    email.value = 'invalid@example.com'
    await expect(mounted.value.validateAt('email')).resolves.toMatchObject({
      issues: [{ message: 'Email invalid' }],
    })

    expect(mounted.value.errors.value).toEqual(['Name required', 'Email invalid', 'Password required'])
    expect(mounted.value.issuesFor('name')[0]).toBe(retainedNameIssue)
    expect(mounted.value.issuesFor('password')[0]).toBe(retainedPasswordIssue)

    email.value = 'valid@example.com'
    await expect(mounted.value.validateAt('email')).resolves.toEqual({ issues: [] })

    expect(mounted.value.errors.value).toEqual(['Name required', 'Password required'])
    expect(mounted.value.issuesFor('name')[0]).toBe(retainedNameIssue)
    expect(mounted.value.issuesFor('password')[0]).toBe(retainedPasswordIssue)
    expect(mounted.value.result.value).toMatchObject({ status: 'invalid' })
  })

  it('resolves controller prefixes and skips unrelated registration namespaces', async () => {
    const shippingValidator = vi.fn(() => ({ issues: [{ message: 'Postcode required', path: ['postcode'] }] }))
    const billingValidator = vi.fn(() => ({ issues: [{ message: 'Billing issue', path: ['postcode'] }] }))
    const shippingSchema = createSchema<{ postcode: string }>('test', shippingValidator)
    const billingSchema = createSchema<{ postcode: string }>('test', billingValidator)
    const mounted = mountValidation(() => {
      const shipping = useValidation(shippingSchema, { postcode: '' }, { at: ['shipping'] })
      useValidation(billingSchema, { postcode: '' }, { at: ['billing'] })
      return shipping
    }, false)

    await mounted.value.validateAt('postcode')

    expect(shippingValidator).toHaveBeenCalledOnce()
    expect(billingValidator).not.toHaveBeenCalled()
    expect(mounted.value.issues.value[0]?.path).toEqual(['shipping', 'postcode'])
  })

  it('targets a pathless issue at the controller registration prefix', async () => {
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Shipping invalid' }] }))
    const mounted = mountValidation(() => useValidation(schema, {}, { at: ['shipping'] }), false)

    const result = await mounted.value.validateAt([])

    expect(result).toEqual({ issues: mounted.value.issuesFor([]) })
    expect(mounted.value.errorsFor([])).toEqual(['Shipping invalid'])
    expect(mounted.value.issues.value[0]?.path).toEqual(['shipping'])
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
  })

  it('preserves symbol-key selectors through targeted validation', async () => {
    const field = Symbol('field')
    const schema = createSchema<{ [field]: string }>('test', () => ({
      issues: [{ message: 'Symbol field invalid', path: [field] }],
    }))
    const mounted = mountValidation(() => useValidation(schema, { [field]: '' }), false)

    const result = await mounted.value.validateAt(field)

    expect(result).toEqual({ issues: mounted.value.issuesFor(field) })
    expect(mounted.value.errorsFor(field)).toEqual(['Symbol field invalid'])
    expect(mounted.value.issues.value[0]?.path).toEqual([field])
  })

  it('commits disjoint targeted runs independently in either settlement order', async () => {
    const resolvers = new Map<string, (result: StandardSchemaV1.Result<{ email: string, password: string }>) => void>()
    const model = reactive({ email: 'email-run', password: 'password-run' })
    const schema = createSchema<typeof model>('test', value => new Promise((resolve) => {
      const key = value.email === 'email-run' ? 'email' : 'password'
      resolvers.set(key, resolve)
    }))
    const mounted = mountValidation(() => useValidation(schema, model), false)

    const emailRun = mounted.value.validateAt('email')
    model.email = 'other'
    const passwordRun = mounted.value.validateAt('password')
    resolvers.get('password')?.({ issues: [{ message: 'Password issue', path: ['password'] }] })
    await passwordRun
    resolvers.get('email')?.({ issues: [{ message: 'Email issue', path: ['email'] }] })
    await emailRun

    expect([...mounted.value.errors.value].sort()).toEqual(['Email issue', 'Password issue'])
  })

  it('makes the newest targeted run authoritative for the same path', async () => {
    const resolvers = new Map<string, (result: StandardSchemaV1.Result<{ email: string }>) => void>()
    const email = ref('older')
    const schema = createSchema<{ email: string }>('test', value => new Promise(resolve => resolvers.set(value.email, resolve)))
    const mounted = mountValidation(() => useValidation(schema, { email }), false)

    const older = mounted.value.validateAt('email')
    email.value = 'newer'
    const newer = mounted.value.validateAt('email')
    resolvers.get('newer')?.({ issues: [{ message: 'Current', path: ['email'] }] })

    const result = await newer
    expect(result).toEqual({ issues: mounted.value.issuesFor('email') })
    await expect(older).resolves.toEqual(result)
    resolvers.get('older')?.({ issues: [{ message: 'Stale', path: ['email'] }] })
    await Promise.resolve()
    expect(mounted.value.errors.value).toEqual(['Current'])
  })

  it('lets full validation supersede a pending target and project its result to the target caller', async () => {
    let resolveTarget!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    let calls = 0
    const schema = createSchema<{ email: string }>('test', () => {
      calls++
      return calls === 1
        ? new Promise((resolve) => { resolveTarget = resolve })
        : { issues: [{ message: 'Full issue', path: ['email'] }] }
    })
    const mounted = mountValidation(() => useValidation(schema, { email: '' }), false)

    const target = mounted.value.validateAt('email')
    const full = mounted.value.validate()

    await expect(full).resolves.toMatchObject({ success: false })
    await expect(target).resolves.toEqual({ issues: mounted.value.issuesFor('email') })
    resolveTarget({ issues: [{ message: 'Stale target', path: ['email'] }] })
    await Promise.resolve()
    expect(mounted.value.errors.value).toEqual(['Full issue'])
  })

  it('waits behind full validation and captures fresh input afterwards', async () => {
    let resolveFull!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    const observed: string[] = []
    const email = ref('before')
    const schema = createSchema<{ email: string }>('test', (value) => {
      observed.push(value.email)
      return observed.length === 1
        ? new Promise((resolve) => { resolveFull = resolve })
        : { issues: [{ message: value.email, path: ['email'] }] }
    })
    const mounted = mountValidation(() => useValidation(schema, { email }), false)

    const full = mounted.value.validate()
    const target = mounted.value.validateAt('email')
    email.value = 'after'
    resolveFull({ value: { email: 'before' } })

    await full
    await target
    expect(observed).toEqual(['before', 'after'])
    expect(mounted.value.errorsFor('email')).toEqual(['after'])
  })

  it('rejects atomically when a participating validator fails', async () => {
    let rejectTarget = false
    const stable = createSchema<{ email: string }>('test', () => ({ issues: [{ message: 'Original', path: ['email'] }] }))
    const unstable = createSchema<{ email: string }>('test', () => rejectTarget
      ? Promise.reject(new Error('Unavailable'))
      : { value: { email: '' } })
    const mounted = mountValidation(() => {
      const root = useValidation(stable, { email: '' })
      useValidation(unstable, { email: '' })
      return root
    }, false)
    await mounted.value.validate()
    const retained = mounted.value.issues.value
    rejectTarget = true

    await expect(mounted.value.validateAt('email')).rejects.toThrow('Unavailable')
    expect(mounted.value.issues.value).toEqual(retained)
  })

  it('settles after a pending matching child is disposed', async () => {
    const showChild = ref(true)
    const schema = createSchema<{ email: string }>('test', () => new Promise(() => {}))
    let root!: ValidationGroup
    const Child = defineComponent({
      setup() {
        useValidation(schema, { email: '' })
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        root = useValidation()
        return () => showChild.value ? h(Child) : null
      },
    })
    mountComponent(Parent, false)

    const target = root.validateAt('email')
    showChild.value = false
    await nextTick()

    await expect(target).resolves.toEqual({ issues: [] })
    expect(root.isValidating.value).toBe(false)
  })

  it('resolves targeted messages immediately after the locale changes', async () => {
    const locale = ref<'en' | 'es'>('en')
    const validator = vi.fn(() => ({ issues: [{ message: 'Raw', path: ['email'] }] }))
    const schema = createSchema<{ email: string }>('test', validator)
    const mounted = mountValidation(() => useValidation(schema, { email: '' }, {
      messages: () => locale.value === 'en' ? 'Invalid email' : 'Correo no válido',
    }), false)

    await mounted.value.validateAt('email')
    locale.value = 'es'

    expect(mounted.value.errorsFor('email')).toEqual(['Correo no válido'])
    expect(validator).toHaveBeenCalledOnce()
  })

  it('lets the next full run replace the ledger and update transformed output atomically', async () => {
    const email = ref('invalid')
    const schema = createSchema<{ email: string }, { email: string, normalised: true }>('test', value => value.email === 'valid'
      ? { value: { email: value.email, normalised: true } }
      : { issues: [{ message: 'Invalid email', path: ['email'] }] })
    const mounted = mountValidation(() => useValidation(schema, { email }), false)
    await mounted.value.validateAt('email')

    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    email.value = 'valid'
    await mounted.value.validate()

    expect(mounted.value.issues.value).toEqual([])
    expect(mounted.value.result.value).toEqual({ status: 'valid', value: { email: 'valid', normalised: true } })
  })

  it('keeps validation activity true for a target queued behind full validation', async () => {
    let resolveFull!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    let resolveTarget!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    let call = 0
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      call++
      if (call === 1) {
        resolveFull = resolve
      }
      else {
        resolveTarget = resolve
      }
    }))
    const mounted = mountValidation(() => useValidation(schema, { email: '' }), false)

    const full = mounted.value.validate()
    const target = mounted.value.validateAt('email')
    expect(mounted.value.isValidating.value).toBe(true)

    resolveFull({ value: { email: '' } })
    await full
    await Promise.resolve()
    expect(mounted.value.isValidating.value).toBe(true)

    resolveTarget({ value: { email: '' } })
    await target
    expect(mounted.value.isValidating.value).toBe(false)
  })
})

describe('validation lifecycle', () => {
  it('validates registrations concurrently and makes the newest run authoritative', async () => {
    const resolvers = new Map<string, (result: StandardSchemaV1.Result<{ name: string }>) => void>()
    const schema = createSchema<{ name: string }>('test', value => new Promise((resolve) => {
      resolvers.set(value.name, resolve)
    }))
    const name = ref('old')
    const mounted = mountValidation(() => useValidation(schema, { name }), false)

    const oldRun = mounted.value.validate()
    name.value = 'new'
    const newRun = mounted.value.validate()
    resolvers.get('new')?.({ issues: [{ message: 'New', path: ['name'] }] })

    const result = await newRun
    await expect(oldRun).resolves.toEqual(result)
    expect(mounted.value.errorsFor('name')).toEqual(['New'])
    expect(mounted.value.isValidating.value).toBe(false)
  })

  it.each(['fulfils', 'rejects'] as const)('ignores a superseded validator that later %s', async (settlement) => {
    let settleOlder!: () => void
    const name = ref<'older' | 'newer'>('older')
    const schema = createSchema<{ name: 'older' | 'newer' }>('test', value => value.name === 'older'
      ? new Promise((resolve, reject) => {
          settleOlder = () => settlement === 'fulfils'
            ? resolve({ issues: [{ message: 'Stale', path: ['name'] }] })
            : reject(new Error('Stale rejection'))
        })
      : { issues: [{ message: 'Current', path: ['name'] }] })
    const mounted = mountValidation(() => useValidation(schema, { name }), false)

    const older = mounted.value.validate()
    name.value = 'newer'
    const newer = mounted.value.validate()

    await expect(newer).resolves.toMatchObject({ success: false })
    await expect(older).resolves.toEqual(await newer)
    settleOlder()
    await Promise.resolve()
    await Promise.resolve()

    expect(mounted.value.errorsFor('name')).toEqual(['Current'])
    expect(mounted.value.result.value).toMatchObject({ status: 'invalid' })
  })

  it('adopts a re-entrant validation started during an atomic commit', async () => {
    const name = ref('old')
    const schema = createSchema<{ name: string }>('test', value => value.name === 'new'
      ? { value }
      : { issues: [{ message: 'Old', path: ['name'] }] })
    let newerRun!: Promise<ValidationResult>
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { name })
      watch(validation.issues, (issues) => {
        if (issues.length && name.value === 'old') {
          name.value = 'new'
          newerRun = validation.validate()
        }
      }, { flush: 'sync' })
      return validation
    }, false)

    const first = await mounted.value.validate()
    const second = await newerRun

    expect(first).toEqual(second)
    expect(second).toEqual({ success: true, issues: [] })
  })

  it('does not partially commit when one validator rejects', async () => {
    let reject = false
    const stable = createSchema<unknown>('test', () => ({ issues: [{ message: reject ? 'Replacement' : 'Original' }] }))
    const unstable = createSchema<unknown>('test', () => reject ? Promise.reject(new Error('Unavailable')) : { value: {} })
    const mounted = mountValidation(() => {
      const root = useValidation(stable, {})
      useValidation(unstable, {})
      return root
    }, false)
    await mounted.value.validate()
    reject = true

    await expect(mounted.value.validate()).rejects.toThrow('Unavailable')
    expect(mounted.value.errors.value).toEqual(['Original'])
  })

  it('adopts a newer validation started during synchronous model capture', async () => {
    const staleCaptureFailure = new Error('Stale capture failed')
    let state: 'reentrant' | 'current' = 'reentrant'
    const schema = createSchema<{ name: string }>('test', value => ({ value }))
    let validation!: ReturnType<typeof useValidation<typeof schema>>
    let newer!: Promise<ValidationResult>
    const model = {
      get name() {
        if (state === 'reentrant') {
          state = 'current'
          newer = validation.validate()
          throw staleCaptureFailure
        }
        return state
      },
    }
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      return validation
    }, false)

    const superseded = mounted.value.validate()
    const current = await newer

    expect(current).toEqual({ success: true, issues: [] })
    await expect(superseded).resolves.toEqual(current)
    expect(mounted.value.result.value).toEqual({ status: 'valid', value: { name: 'current' } })
    expect(mounted.value.isValidating.value).toBe(false)
  })

  it('rethrows the original synchronous capture error while authoritative', async () => {
    const captureFailure = new Error('Authoritative capture failed')
    const model = {
      get name(): string {
        throw captureFailure
      },
    }
    const schema = createSchema<{ name: string }>('test', value => ({ value }))
    const mounted = mountValidation(() => useValidation(schema, model), false)

    await expect(mounted.value.validate()).rejects.toBe(captureFailure)
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    expect(mounted.value.isValidating.value).toBe(false)
  })

  it('clears validating state and preserves committed results when snapshotting throws', async () => {
    const snapshotFailure = new Error('Model getter failed')
    let throwFromGetter = false
    const model = {
      get name() {
        if (throwFromGetter) {
          throw snapshotFailure
        }
        return ''
      },
    }
    const schema = createSchema<{ name: string }>('test', () => ({
      issues: [{ message: 'Original', path: ['name'] }],
    }))
    const mounted = mountValidation(() => useValidation(schema, model), false)
    await mounted.value.validate()
    const committedResult = mounted.value.result.value

    throwFromGetter = true
    const validation = mounted.value.validate()

    await expect(validation).rejects.toBe(snapshotFailure)
    expect(mounted.value.isValidating.value).toBe(false)
    expect(mounted.value.errors.value).toEqual(['Original'])
    expect(mounted.value.result.value).toBe(committedResult)
  })

  it('clears validating state and preserves committed results when a reactive schema becomes invalid', async () => {
    const schema = ref<StandardSchemaV1<{ name: string }> | null>(createSchema<{ name: string }>('test', () => ({
      issues: [{ message: 'Original', path: ['name'] }],
    })))
    const mounted = mountValidation(
      () => useValidation(schema as unknown as StandardSchemaV1<{ name: string }>, { name: ref('') }),
      false,
    )
    await mounted.value.validate()
    const committedResult = mounted.value.result.value

    schema.value = null

    await expect(mounted.value.validate()).rejects.toThrow('not Standard Schema compliant')
    expect(mounted.value.isValidating.value).toBe(false)
    expect(mounted.value.errors.value).toEqual(['Original'])
    expect(mounted.value.result.value).toBe(committedResult)
  })

  it('makes a superseding synchronous failure authoritative for older callers', async () => {
    const snapshotFailure = new Error('Superseding snapshot failed')
    let rejectSnapshot = false
    let resolveOld!: (result: StandardSchemaV1.Result<{ name: string }>) => void
    const model = {
      get name() {
        if (rejectSnapshot) {
          throw snapshotFailure
        }
        return 'pending'
      },
    }
    const schema = createSchema<{ name: string }>('test', () => new Promise((resolve) => {
      resolveOld = resolve
    }))
    const mounted = mountValidation(() => useValidation(schema, model), false)

    const older = mounted.value.validate()
    rejectSnapshot = true
    const newer = mounted.value.validate()
    resolveOld({ value: { name: 'pending' } })

    await expect(newer).rejects.toBe(snapshotFailure)
    await expect(older).rejects.toBe(snapshotFailure)
    expect(mounted.value.isValidating.value).toBe(false)
  })

  it('keeps a re-entrant newest run authoritative after synchronous capture fails', async () => {
    const snapshotFailure = new Error('Snapshot failed')
    let modelState: 'pending' | 'throw' | 'success' = 'pending'
    let newest!: Promise<ValidationResult>
    const model = {
      get name() {
        if (modelState === 'throw') {
          throw snapshotFailure
        }
        return modelState
      },
    }
    const schema = createSchema<{ name: string }>('test', input => input.name === 'pending'
      ? new Promise(() => {})
      : { value: input })
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, model)
      watch(validation.isValidating, (validating) => {
        if (!validating && modelState === 'throw') {
          modelState = 'success'
          newest = validation.validate()
        }
      }, { flush: 'sync' })
      return validation
    }, false)

    const pending = mounted.value.validate()
    modelState = 'throw'
    const failing = mounted.value.validate()

    await expect(failing).rejects.toBe(snapshotFailure)
    await expect(newest).resolves.toEqual({ success: true, issues: [] })
    await expect(pending).resolves.toEqual({ success: true, issues: [] })
    expect(mounted.value.result.value).toEqual({ status: 'valid', value: { name: 'success' } })
    expect(mounted.value.isValidating.value).toBe(false)
  })

  it('removes a disposed hanging registration immediately', async () => {
    const showChild = ref(true)
    const schema = createSchema<unknown>('test', () => new Promise(() => {}))
    let root!: ValidationGroup
    const Child = defineComponent({
      setup() {
        useValidation(schema, {})
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        root = useValidation()
        return () => showChild.value ? h(Child) : null
      },
    })
    mountComponent(Parent, false)
    const validation = root.validate()
    showChild.value = false
    await nextTick()

    await expect(validation).resolves.toEqual({ success: true, issues: [] })
  })

  it.each(['fulfils', 'rejects'] as const)('removes committed descendant issues and ignores a disposed validator that later %s', async (settlement) => {
    let pending = false
    let settleDisposed!: () => void
    const showChild = ref(true)
    const schema = createSchema<unknown>('test', () => {
      if (!pending) {
        return { issues: [{ message: 'Committed child issue' }] }
      }
      return new Promise((resolve, reject) => {
        settleDisposed = () => settlement === 'fulfils'
          ? resolve({ issues: [{ message: 'Stale child issue' }] })
          : reject(new Error('Disposed rejection'))
      })
    })
    let root!: ValidationGroup
    const Child = defineComponent({
      setup() {
        useValidation(schema, {})
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        root = useValidation()
        return () => showChild.value ? h(Child) : null
      },
    })
    mountComponent(Parent, false)
    await root.validate()
    expect(root.errors.value).toEqual(['Committed child issue'])

    pending = true
    const validation = root.validate()
    showChild.value = false
    await nextTick()

    expect(root.issues.value).toEqual([])
    await expect(validation).resolves.toEqual({ success: true, issues: [] })
    settleDisposed()
    await Promise.resolve()
    await Promise.resolve()

    expect(root.issues.value).toEqual([])
    expect(root.isValidating.value).toBe(false)
  })

  it('validates an empty scope successfully', async () => {
    const mounted = mountValidation(() => useValidation(), false)
    await expect(mounted.value.validate()).resolves.toEqual({ success: true, issues: [] })
  })
})

describe('form state', () => {
  it('derives aggregate and exact dirty state on the same stack and becomes pristine after reversion', () => {
    const model = reactive({ email: '', profile: { name: '' } })
    const schema = createSchema<typeof model>('test', value => ({ value }))
    const mounted = mountValidation(() => useValidation(schema, model), false)

    expect(mounted.value.state.value).toEqual({
      dirty: false,
      touched: false,
      validated: false,
      stale: false,
      validating: false,
    })
    expect(mounted.value.stateFor('email')).toEqual(mounted.value.state.value)

    model.profile.name = 'Ada'

    expect(mounted.value.state.value.dirty).toBe(true)
    expect(mounted.value.stateFor('email').dirty).toBe(false)
    expect(mounted.value.stateFor(['profile', 'name']).dirty).toBe(true)

    model.profile.name = ''

    expect(mounted.value.state.value.dirty).toBe(false)
    expect(mounted.value.stateFor(['profile', 'name']).dirty).toBe(false)
  })

  it('captures the baseline before the first state observation', () => {
    const email = ref('initial@example.com')
    const schema = createSchema<{ email: string }>('test', value => ({ value }))
    const mounted = mountValidation(() => useValidation(schema, { email }), false)

    email.value = 'edited@example.com'

    expect(mounted.value.state.value.dirty).toBe(true)
    expect(mounted.value.stateFor('email').dirty).toBe(true)
  })

  it('does not execute an accessor while adding an observed registration', async () => {
    let getterCalls = 0
    const validator = vi.fn((value: { email: string }) => ({ value }))
    const schema = createSchema<{ email: string }>('test', validator)
    const model = {
      get email() {
        getterCalls++
        return 'safe@example.com'
      },
    }
    const mounted = mountValidation(() => {
      const root = useValidation()
      watch(() => root.state.value.dirty, () => {}, { flush: 'sync' })
      const child = useValidation(schema, model)
      return { child, root }
    }, false)

    expect(getterCalls).toBe(0)
    expect(mounted.value.root.state.value.dirty).toBe(false)
    expect(getterCalls).toBe(1)

    const callsBeforeValidation = getterCalls
    await mounted.value.root.validate()
    expect(getterCalls).toBeGreaterThan(callsBeforeValidation)
    expect(validator).toHaveBeenCalledOnce()
  })

  it('rolls back a joining registration when observed-state invalidation throws', async () => {
    const observationFailure = new Error('Observed state failed')
    let throwOnRead = false
    const retainedValidator = vi.fn((value: { email: string }) => ({ value }))
    const leakedValidator = vi.fn((value: { code: string }) => ({ value }))
    const retainedSchema = createSchema<{ email: string }>('test', retainedValidator)
    const leakedSchema = createSchema<{ code: string }>('test', leakedValidator)
    const model = {
      get email() {
        if (throwOnRead) {
          throw observationFailure
        }
        return 'safe@example.com'
      },
    }
    const mounted = mountValidation(() => {
      const retained = useValidation(retainedSchema, model)
      const root = useValidation()
      watch(() => root.state.value.dirty, () => {}, { flush: 'sync' })
      throwOnRead = true
      let registrationFailure: unknown
      try {
        useValidation(leakedSchema, { code: '' })
      }
      catch (reason) {
        registrationFailure = reason
      }
      throwOnRead = false
      return { registrationFailure, retained, root }
    }, false)

    expect(mounted.value.registrationFailure).toBe(observationFailure)
    await expect(mounted.value.root.validate()).resolves.toEqual({ success: true, issues: [] })
    expect(retainedValidator).toHaveBeenCalledOnce()
    expect(leakedValidator).not.toHaveBeenCalled()
  })

  it('returns a rejected promise and rolls back full activity when a sync state observer throws', async () => {
    const observationFailure = new Error('Full state observation failed')
    let throwOnRead = false
    const validator = vi.fn((value: { email: string }) => ({ value }))
    const schema = createSchema<{ email: string }>('test', validator)
    const model = {
      get email() {
        if (throwOnRead) {
          throw observationFailure
        }
        return 'safe@example.com'
      },
    }
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, model)
      watch(() => validation.state.value.validating, () => {}, { flush: 'sync' })
      return validation
    }, false)

    throwOnRead = true
    let validation!: Promise<ValidationResult>
    expect(() => {
      validation = mounted.value.validate()
    }).not.toThrow()
    await expect(validation).rejects.toBe(observationFailure)

    throwOnRead = false
    expect(mounted.value.isValidating.value).toBe(false)
    expect(mounted.value.state.value.validating).toBe(false)
    expect(mounted.value.stateFor('email').validating).toBe(false)
    await expect(mounted.value.validate()).resolves.toEqual({ success: true, issues: [] })
    expect(validator).toHaveBeenCalledOnce()
  })

  it('returns a rejected promise and rolls back exact activity when a sync state observer throws', async () => {
    const observationFailure = new Error('Exact state observation failed')
    let throwOnRead = false
    const validator = vi.fn((value: { email: string }) => ({ value }))
    const schema = createSchema<{ email: string }>('test', validator)
    const model = {
      get email() {
        if (throwOnRead) {
          throw observationFailure
        }
        return 'safe@example.com'
      },
    }
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, model)
      watch(() => validation.stateFor('email').validating, () => {}, { flush: 'sync' })
      return validation
    }, false)

    throwOnRead = true
    let validation!: Promise<TargetValidationResult>
    expect(() => {
      validation = mounted.value.validateAt('email')
    }).not.toThrow()
    await expect(validation).rejects.toBe(observationFailure)

    throwOnRead = false
    expect(mounted.value.isValidating.value).toBe(false)
    expect(mounted.value.state.value.validating).toBe(false)
    expect(mounted.value.stateFor('email').validating).toBe(false)
    await expect(mounted.value.validateAt('email')).resolves.toEqual({ issues: [] })
    expect(validator).toHaveBeenCalledOnce()
  })

  it('compares cyclic and shared structures, symbols, property presence, arrays and non-plain values', () => {
    const field = Symbol('field')
    const shared = { value: 'shared' }
    const originalDate = new Date('2026-01-01T00:00:00.000Z')
    const items: Array<undefined | { value: string }> = [undefined]
    const raw: {
      [field]: string
      optional?: undefined
      items: Array<undefined | { value: string }>
      first: { value: string }
      second: { value: string }
      date: Date
      self?: unknown
    } = {
      [field]: '',
      items,
      first: shared,
      second: shared,
      date: originalDate,
    }
    raw.self = raw
    const model = reactive(raw)
    const schema = createSchema<typeof raw>('test', value => ({ value }))
    const mounted = mountValidation(() => useValidation(schema, model), false)

    expect(mounted.value.state.value.dirty).toBe(false)

    model.optional = undefined
    expect(mounted.value.state.value.dirty).toBe(true)
    delete model.optional
    expect(mounted.value.state.value.dirty).toBe(false)

    model.items[0] = { value: 'item' }
    expect(mounted.value.state.value.dirty).toBe(true)
    model.items[0] = undefined
    expect(mounted.value.state.value.dirty).toBe(false)

    model.second = { value: 'shared' }
    expect(mounted.value.state.value.dirty).toBe(true)
    model.second = model.first
    expect(mounted.value.state.value.dirty).toBe(false)

    model[field] = 'changed'
    expect(mounted.value.stateFor(field).dirty).toBe(true)
    model[field] = ''
    expect(mounted.value.stateFor(field).dirty).toBe(false)

    model.date.setUTCFullYear(2027)
    expect(mounted.value.stateFor('date').dirty).toBe(false)
    model.date = new Date(model.date)
    expect(mounted.value.state.value.dirty).toBe(true)
  })

  it('preserves sparse arrays, length and own string and symbol properties in snapshots', async () => {
    const marker = Symbol('marker')
    type Items = Array<string | undefined> & { note: string, [marker]: string }
    const items = [] as unknown as Items
    items.length = 2
    Object.defineProperty(items, 'note', {
      configurable: true,
      enumerable: false,
      value: 'baseline',
      writable: true,
    })
    items[marker] = 'baseline'
    const model = reactive({ items })
    const validator = vi.fn((value: { items: Items }) => ({ value }))
    const schema = createSchema<{ items: Items }>('test', validator)
    const mounted = mountValidation(() => useValidation(schema, model), false)

    expect(mounted.value.state.value.dirty).toBe(false)
    await mounted.value.validate()
    const captured = validator.mock.calls[0]![0].items
    expect(captured).toHaveLength(2)
    expect(0 in captured).toBe(false)
    expect(captured.note).toBe('baseline')
    expect(Object.getOwnPropertyDescriptor(captured, 'note')?.enumerable).toBe(false)
    expect(captured[marker]).toBe('baseline')

    model.items[0] = undefined
    expect(mounted.value.stateFor(['items', 0]).dirty).toBe(true)
    expect(mounted.value.state.value.dirty).toBe(true)
    delete model.items[0]
    expect(mounted.value.state.value.dirty).toBe(false)

    model.items.length = 3
    expect(mounted.value.state.value.dirty).toBe(true)
    model.items.length = 2
    expect(mounted.value.state.value.dirty).toBe(false)

    model.items.note = 'changed'
    expect(mounted.value.state.value.dirty).toBe(true)
    model.items.note = 'baseline'
    expect(mounted.value.state.value.dirty).toBe(false)

    model.items[marker] = 'changed'
    expect(mounted.value.state.value.dirty).toBe(true)
    model.items[marker] = 'baseline'
    expect(mounted.value.state.value.dirty).toBe(false)
  })

  it('tracks schema-observable enumerability changes in dirty and stale state', async () => {
    const model = reactive({ details: { note: 'baseline' } })
    const validator = vi.fn((value: typeof model) => ({ value }))
    const schema = createSchema<typeof model>('test', validator)
    const mounted = mountValidation(() => useValidation(schema, model), false)

    await mounted.value.validate()
    expect(Object.keys(validator.mock.calls[0]![0].details)).toEqual(['note'])
    expect(mounted.value.state.value).toMatchObject({ dirty: false, stale: false })
    expect(isReadonly(mounted.value.state)).toBe(true)

    Object.defineProperty(model.details, 'note', { enumerable: false })

    expect(mounted.value.state.value).toMatchObject({ dirty: true, stale: true })
    expect(mounted.value.stateFor('details')).toMatchObject({ dirty: true, stale: true })

    await mounted.value.validate()
    expect(Object.keys(validator.mock.calls[1]![0].details)).toEqual([])
    expect(mounted.value.state.value).toMatchObject({ dirty: true, stale: false })
    expect(mounted.value.stateFor('details')).toMatchObject({ dirty: true, stale: false })
  })

  it('records touch explicitly at resolved paths and removes disposed contributions', async () => {
    const field = Symbol('field')
    const showChild = ref(true)
    const schema = createSchema<{ postcode: string, [field]: string }>('test', value => ({ value }))
    let root!: ValidationGroup
    let child!: ReturnType<typeof useValidation<typeof schema>>
    const Child = defineComponent({
      setup() {
        child = useValidation(schema, { postcode: '', [field]: '' }, { at: ['shipping'] })
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        root = useValidation()
        return () => showChild.value ? h(Child) : null
      },
    })
    mountComponent(Parent, false)

    await child.validateAt('postcode')
    expect(child.stateFor('postcode').touched).toBe(false)

    root.touch(['billing', 'postcode'])
    expect(root.state.value.touched).toBe(false)

    child.touch([])
    child.touch('postcode')
    child.touch(field)
    expect(child.stateFor([]).touched).toBe(true)
    expect(root.stateFor(['shipping']).touched).toBe(true)
    expect(child.stateFor('postcode').touched).toBe(true)
    expect(root.stateFor(['shipping', 'postcode']).touched).toBe(true)
    expect(root.stateFor(['shipping', field]).touched).toBe(true)
    expect(root.state.value.touched).toBe(true)

    showChild.value = false
    await nextTick()

    expect(root.stateFor(['shipping', 'postcode']).touched).toBe(false)
    expect(root.state.value.touched).toBe(false)
  })

  it('does not infer interaction from full validation', async () => {
    const schema = createSchema<{ email: string }>('test', value => ({ value }))
    const mounted = mountValidation(() => useValidation(schema, { email: '' }), false)

    await mounted.value.validate()

    expect(mounted.value.state.value.touched).toBe(false)
    expect(mounted.value.stateFor('email').touched).toBe(false)
  })

  it('tracks full and exact validation history on the same stack', async () => {
    const firstSchema = createSchema<{ email: string, password: string }>('test', value => ({ value }))
    const secondSchema = createSchema<{ email: string, password: string }>('test', value => ({ value }))
    const schema = shallowRef(firstSchema)
    const model = reactive({ email: '', password: '' })
    const mounted = mountValidation(() => useValidation(schema, model), false)

    await mounted.value.validateAt('email')

    expect(mounted.value.state.value.validated).toBe(false)
    expect(mounted.value.stateFor('email')).toMatchObject({ validated: true, stale: false, touched: false })
    expect(mounted.value.stateFor('password')).toMatchObject({ validated: false, stale: false })
    expect(mounted.value.result.value).toEqual({ status: 'idle' })

    model.password = 'changed sibling'
    expect(mounted.value.stateFor('email').stale).toBe(true)
    model.password = ''
    expect(mounted.value.stateFor('email').stale).toBe(false)

    await mounted.value.validate()
    expect(mounted.value.state.value).toMatchObject({ validated: true, stale: false })
    expect(mounted.value.stateFor('password')).toMatchObject({ validated: true, stale: false })

    schema.value = secondSchema
    expect(mounted.value.state.value.stale).toBe(true)
    expect(mounted.value.stateFor('email').stale).toBe(true)
    schema.value = firstSchema
    expect(mounted.value.state.value.stale).toBe(false)
    expect(mounted.value.stateFor('email').stale).toBe(false)
  })

  it('marks a committed async snapshot stale when the model changes in flight', async () => {
    let resolve!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    const email = ref('captured')
    const schema = createSchema<{ email: string }>('test', () => new Promise((resume) => {
      resolve = resume
    }))
    const mounted = mountValidation(() => useValidation(schema, { email }), false)

    const validation = mounted.value.validate()
    email.value = 'changed'
    resolve({ value: { email: 'captured' } })
    await validation

    expect(mounted.value.state.value).toMatchObject({ validated: true, stale: true })
    expect(mounted.value.stateFor('email')).toMatchObject({ validated: true, stale: true })
    email.value = 'captured'
    expect(mounted.value.state.value.stale).toBe(false)
  })

  it('isolates validation freshness from identity-schema output mutation', async () => {
    const model = reactive({ profile: { name: 'Ada' } })
    const schema = createSchema<typeof model>('test', value => ({ value }))
    const mounted = mountValidation(() => useValidation(schema, model), false)

    await mounted.value.validate()
    const result = mounted.value.result.value
    expect(result.status).toBe('valid')
    if (result.status !== 'valid') {
      return
    }

    result.value.profile.name = 'Mutated output'

    expect(model.profile.name).toBe('Ada')
    expect(mounted.value.state.value.stale).toBe(false)
    expect(mounted.value.stateFor(['profile', 'name']).stale).toBe(false)

    model.profile.name = 'Mutated output'
    expect(mounted.value.state.value.stale).toBe(true)
    model.profile.name = 'Ada'
    expect(mounted.value.state.value.stale).toBe(false)
  })

  it('invalidates validation history when matching registrations are added or disposed', async () => {
    const showChild = ref(false)
    const schema = createSchema<{ email: string }>('test', value => ({ value }))
    let root!: ReturnType<typeof useValidation<typeof schema>>
    const Child = defineComponent({
      setup() {
        useValidation(schema, { email: '' })
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        root = useValidation(schema, { email: '' })
        return () => showChild.value ? h(Child) : null
      },
    })
    mountComponent(Parent, false)
    await root.validate()

    showChild.value = true
    await nextTick()
    expect(root.state.value).toMatchObject({ validated: true, stale: true })
    expect(root.stateFor('email')).toMatchObject({ validated: true, stale: true })

    await root.validate()
    expect(root.state.value.stale).toBe(false)
    showChild.value = false
    await nextTick()
    expect(root.state.value.stale).toBe(true)
    expect(root.stateFor('email').stale).toBe(true)
  })

  it('publishes matching exact activity with aggregate activity at full validation start', async () => {
    let resolveValidation!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    const observations: Array<{
      aggregateValidating: boolean
      exactValidating: boolean
      legacyValidating: boolean
    }> = []
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolveValidation = resolve
    }))
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email: '' })
      watch(
        () => validation.state.value.validating,
        (aggregateValidating) => {
          observations.push({
            aggregateValidating,
            exactValidating: validation.stateFor('email').validating,
            legacyValidating: validation.isValidating.value,
          })
        },
        { flush: 'sync' },
      )
      return validation
    }, false)

    const full = mounted.value.validate()

    expect(observations).toEqual([{
      aggregateValidating: true,
      exactValidating: true,
      legacyValidating: true,
    }])

    resolveValidation({ value: { email: '' } })
    await full
    expect(observations).toEqual([
      { aggregateValidating: true, exactValidating: true, legacyValidating: true },
      { aggregateValidating: false, exactValidating: false, legacyValidating: false },
    ])
  })

  it('keeps matching exact activity continuous across full validation supersession', async () => {
    const resolvers: Array<(result: StandardSchemaV1.Result<{ email: string }>) => void> = []
    const observations: Array<{
      aggregateValidating: boolean
      exactValidating: boolean
      legacyValidating: boolean
    }> = []
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email: '' })
      watch(
        () => validation.stateFor('email').validating,
        (exactValidating) => {
          observations.push({
            aggregateValidating: validation.state.value.validating,
            exactValidating,
            legacyValidating: validation.isValidating.value,
          })
        },
        { flush: 'sync' },
      )
      return validation
    }, false)

    const superseded = mounted.value.validate()
    expect(observations).toEqual([{
      aggregateValidating: true,
      exactValidating: true,
      legacyValidating: true,
    }])

    const authoritative = mounted.value.validate()
    expect(observations).toEqual([{
      aggregateValidating: true,
      exactValidating: true,
      legacyValidating: true,
    }])
    expect(mounted.value.state.value.validating).toBe(true)
    expect(mounted.value.stateFor('email').validating).toBe(true)
    expect(mounted.value.isValidating.value).toBe(true)

    resolvers[1]?.({ value: { email: '' } })
    await Promise.all([superseded, authoritative])
    expect(observations).toEqual([
      { aggregateValidating: true, exactValidating: true, legacyValidating: true },
      { aggregateValidating: false, exactValidating: false, legacyValidating: false },
    ])
  })

  it('reports exact targeted and full validation activity independently', async () => {
    const resolvers: Array<(result: StandardSchemaV1.Result<{ email: string, password: string }>) => void> = []
    const schema = createSchema<{ email: string, password: string }>('test', () => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    const mounted = mountValidation(() => useValidation(schema, { email: '', password: '' }), false)

    const email = mounted.value.validateAt('email')
    expect(mounted.value.state.value.validating).toBe(true)
    expect(mounted.value.stateFor('email').validating).toBe(true)
    expect(mounted.value.stateFor('password').validating).toBe(false)

    const password = mounted.value.validateAt('password')
    expect(mounted.value.stateFor('email').validating).toBe(true)
    expect(mounted.value.stateFor('password').validating).toBe(true)
    resolvers[0]?.({ value: { email: '', password: '' } })
    resolvers[1]?.({ value: { email: '', password: '' } })
    await Promise.all([email, password])

    const full = mounted.value.validate()
    expect(mounted.value.state.value.validating).toBe(true)
    expect(mounted.value.stateFor('email').validating).toBe(true)
    expect(mounted.value.stateFor('password').validating).toBe(true)
    resolvers[2]?.({ value: { email: '', password: '' } })
    await full
    expect(mounted.value.state.value.validating).toBe(false)
  })

  it('resets values, baselines, issues, results, touch and validation history atomically', async () => {
    const email = ref('')
    const schema = createSchema<{ email: string }>('test', value => value.email
      ? { value }
      : { issues: [{ message: 'Required', path: ['email'] }] })
    const mounted = mountValidation(() => useValidation(schema, { email }), false)
    await mounted.value.validate()
    mounted.value.touch('email')
    email.value = 'saved@example.com'

    mounted.value.resetState()

    expect(email.value).toBe('saved@example.com')
    expect(mounted.value.issues.value).toEqual([])
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    expect(mounted.value.state.value).toEqual({
      dirty: false,
      touched: false,
      validated: false,
      stale: false,
      validating: false,
    })
    email.value = 'next@example.com'
    expect(mounted.value.stateFor('email').dirty).toBe(true)
    email.value = 'saved@example.com'
    expect(mounted.value.stateFor('email').dirty).toBe(false)
  })

  it('publishes reset results and validation activity in one synchronous transition', async () => {
    let pending = false
    let resolvePending!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    const observations: Array<{
      result: 'idle'
      aggregateValidating: boolean
      exactValidating: boolean
      legacyValidating: boolean
    }> = []
    const schema = createSchema<{ email: string }>('test', value => pending
      ? new Promise((resolve) => { resolvePending = resolve })
      : { value })
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email: 'valid@example.com' })
      watch(
        () => validation.result.value,
        (result) => {
          if (result.status === 'idle') {
            observations.push({
              result: result.status,
              aggregateValidating: validation.state.value.validating,
              exactValidating: validation.stateFor('email').validating,
              legacyValidating: validation.isValidating.value,
            })
          }
        },
        { flush: 'sync' },
      )
      return validation
    }, false)

    await mounted.value.validate()
    pending = true
    const validation = mounted.value.validate()
    expect(mounted.value.state.value.validating).toBe(true)
    expect(mounted.value.stateFor('email').validating).toBe(true)
    expect(mounted.value.isValidating.value).toBe(true)

    mounted.value.resetState()

    expect(observations).toEqual([{
      result: 'idle',
      aggregateValidating: false,
      exactValidating: false,
      legacyValidating: false,
    }])
    await expect(validation).rejects.toMatchObject({ name: 'AbortError' })

    resolvePending({ issues: [{ message: 'Late', path: ['email'] }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    expect(observations).toHaveLength(1)
  })

  it('leaves all state and authority intact when reset capture fails', async () => {
    const captureFailure = new Error('Reset capture failed')
    let value = ''
    let throwOnRead = false
    let resolvePending!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    let pending = false
    const model = {
      get email() {
        if (throwOnRead) {
          throw captureFailure
        }
        return value
      },
    }
    const schema = createSchema<{ email: string }>('test', _input => pending
      ? new Promise((resolve) => { resolvePending = resolve })
      : { issues: [{ message: 'Original', path: ['email'] }] })
    const mounted = mountValidation(() => useValidation(schema, model), false)
    await mounted.value.validate()
    mounted.value.touch('email')
    value = 'changed'
    pending = true
    const validation = mounted.value.validate()
    throwOnRead = true

    expect(() => mounted.value.resetState()).toThrow(captureFailure)

    throwOnRead = false
    expect(mounted.value.state.value).toMatchObject({ dirty: true, touched: true, validated: true, validating: true })
    expect(mounted.value.errorsFor('email')).toEqual(['Original'])
    resolvePending({ value: { email: 'changed' } })
    await validation
    expect(mounted.value.result.value).toEqual({ status: 'valid', value: { email: 'changed' } })
  })

  it('blocks re-entrant touch and validation when reset capture fails', async () => {
    const captureFailure = new Error('Later reset capture failed')
    let resetCapture = false
    let validation!: ReturnType<typeof useValidation<typeof schema>>
    let reentrantValidation!: Promise<TargetValidationResult>
    let resolvePending!: (result: StandardSchemaV1.Result<{ email: string, code: string }>) => void
    const model = {
      get email() {
        if (resetCapture) {
          validation.touch('email')
          reentrantValidation = validation.validateAt('email')
        }
        return 'safe@example.com'
      },
      get code() {
        if (resetCapture) {
          throw captureFailure
        }
        return 'ready'
      },
    }
    const schema = createSchema<{ email: string, code: string }>('test', () => new Promise((resolve) => {
      resolvePending = resolve
    }))
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      return validation
    }, false)
    const pending = mounted.value.validate()

    expect(mounted.value.state.value).toMatchObject({ touched: false, validating: true })
    resetCapture = true
    expect(() => mounted.value.resetState()).toThrow(captureFailure)
    resetCapture = false

    expect(mounted.value.state.value).toMatchObject({ touched: false, validating: true })
    expect(mounted.value.stateFor('email')).toMatchObject({ touched: false, validating: true })
    await expect(reentrantValidation).rejects.toBe(captureFailure)

    resolvePending({ value: { email: 'safe@example.com', code: 'ready' } })
    await expect(pending).resolves.toEqual({ success: true, issues: [] })
    expect(mounted.value.state.value).toMatchObject({ touched: false, validated: true, validating: false })
  })

  it('rejects validation started synchronously during reset publication', async () => {
    const schema = createSchema<{ email: string }>('test', value => ({ value }))
    let blockedValidation!: Promise<TargetValidationResult>
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email: 'safe@example.com' })
      let validateOnReset = false
      watch(
        () => validation.result.value,
        (result) => {
          if (validateOnReset && result.status === 'idle') {
            validateOnReset = false
            blockedValidation = validation.validateAt('email')
          }
        },
        { flush: 'sync' },
      )
      return {
        ...validation,
        armResetValidation: () => { validateOnReset = true },
      }
    }, false)

    await mounted.value.validate()
    mounted.value.armResetValidation()
    mounted.value.resetState()

    await expect(blockedValidation).rejects.toMatchObject({ name: 'AbortError' })
    expect(mounted.value.state.value).toMatchObject({ validated: false, validating: false })
    expect(mounted.value.stateFor('email')).toMatchObject({ validated: false, validating: false })
  })

  it('keeps a newer re-entrant full authority when an older start observer throws', async () => {
    const observationFailure = new Error('Older start observation failed')
    let validation!: ReturnType<typeof useValidation<typeof schema>>
    let newer!: Promise<ValidationResult>
    let startNewer = false
    let resolveNewer!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    const model = {
      get email() {
        if (startNewer) {
          startNewer = false
          newer = validation.validate()
          throw observationFailure
        }
        return 'safe@example.com'
      },
    }
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolveNewer = resolve
    }))
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      watch(() => validation.state.value.validating, () => {}, { flush: 'sync' })
      return validation
    }, false)

    startNewer = true
    let older!: Promise<ValidationResult>
    expect(() => {
      older = mounted.value.validate()
    }).not.toThrow()
    expect(mounted.value.state.value.validating).toBe(true)

    resolveNewer({ value: { email: 'safe@example.com' } })
    await expect(newer).resolves.toEqual({ success: true, issues: [] })
    await expect(older).resolves.toEqual({ success: true, issues: [] })
    expect(mounted.value.state.value.validating).toBe(false)
  })

  it('also supersedes the full authority that preceded a failed re-entrant start', async () => {
    const observationFailure = new Error('Middle full start observation failed')
    const resolvers = new Map<string, (result: StandardSchemaV1.Result<{ email: string }>) => void>()
    let email = 'oldest'
    let validation!: ValidationGroup<'email'>
    let newest!: Promise<ValidationResult>
    let startNewest = false
    const model = {
      get email() {
        if (startNewest) {
          startNewest = false
          newest = validation.validate()
          throw observationFailure
        }
        return email
      },
    }
    const schema = createSchema<{ email: string }>('test', value => new Promise((resolve) => {
      resolvers.set(value.email, resolve)
    }))
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      watch(() => validation.state.value.validating, () => {}, { flush: 'sync' })
      return validation
    }, false)

    const oldest = mounted.value.validate()
    email = 'newest'
    startNewest = true
    let adopting!: Promise<ValidationResult>
    expect(() => {
      adopting = mounted.value.validate()
    }).not.toThrow()

    resolvers.get('newest')?.({ value: { email: 'newest' } })
    await expect(Promise.all([oldest, adopting, newest])).resolves.toEqual([
      { success: true, issues: [] },
      { success: true, issues: [] },
      { success: true, issues: [] },
    ])
    expect(mounted.value.state.value.validating).toBe(false)

    resolvers.get('oldest')?.({ issues: [{ message: 'Late oldest', path: ['email'] }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(mounted.value.issues.value).toEqual([])
  })

  it('also supersedes the same-path target that preceded a failed re-entrant start', async () => {
    const observationFailure = new Error('Middle target start observation failed')
    const resolvers: Array<(result: StandardSchemaV1.Result<{ email: string }>) => void> = []
    let validation!: ValidationGroup<'email'>
    let newest!: Promise<TargetValidationResult>
    let startNewest = false
    const model = {
      get email() {
        if (startNewest) {
          startNewest = false
          newest = validation.validateAt('email')
          throw observationFailure
        }
        return 'safe@example.com'
      },
    }
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      watch(() => validation.stateFor('email').validating, () => {}, { flush: 'sync' })
      return validation
    }, false)

    const oldest = mounted.value.validateAt('email')
    startNewest = true
    let adopting!: Promise<TargetValidationResult>
    expect(() => {
      adopting = mounted.value.validateAt('email')
    }).not.toThrow()

    resolvers[1]?.({ value: { email: 'safe@example.com' } })
    await expect(Promise.all([oldest, adopting, newest])).resolves.toEqual([
      { issues: [] },
      { issues: [] },
      { issues: [] },
    ])
    expect(mounted.value.stateFor('email').validating).toBe(false)

    resolvers[0]?.({ issues: [{ message: 'Late oldest', path: ['email'] }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(mounted.value.issues.value).toEqual([])
  })

  it('waits for a restored full predecessor before a re-entrant target commits', async () => {
    const observationFailure = new Error('Middle full start observation failed')
    const calls: string[] = []
    const resolvers = new Map<string, (result: StandardSchemaV1.Result<{ email: string }>) => void>()
    let email = 'oldest'
    let startTarget = false
    let target!: Promise<TargetValidationResult>
    let validation!: ValidationGroup<'email'>
    const model = {
      get email() {
        if (startTarget) {
          startTarget = false
          target = validation.validateAt('email')
          throw observationFailure
        }
        return email
      },
    }
    const schema = createSchema<{ email: string }>('test', value => new Promise((resolve) => {
      calls.push(value.email)
      resolvers.set(value.email, resolve)
    }))
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      watch(() => validation.state.value.validating, () => {}, { flush: 'sync' })
      return validation
    }, false)

    const oldest = mounted.value.validate()
    email = 'newest'
    startTarget = true
    const middle = mounted.value.validate()

    await expect(middle).rejects.toBe(observationFailure)
    expect(calls).toEqual(['oldest'])

    resolvers.get('oldest')?.({ issues: [{ message: 'Old full', path: ['email'] }] })
    await expect(oldest).resolves.toEqual({
      success: false,
      issues: [expect.objectContaining({ message: 'Old full' })],
    })
    await Promise.resolve()
    expect(calls).toEqual(['oldest', 'newest'])

    resolvers.get('newest')?.({ issues: [{ message: 'New target', path: ['email'] }] })
    await expect(target).resolves.toEqual({
      issues: [expect.objectContaining({ message: 'New target' })],
    })
    expect(mounted.value.errorsFor('email')).toEqual(['New target'])
  })

  it('lets a same-path predecessor adopt a target started while its replacement finishes', async () => {
    const captureFailure = new Error('Middle target capture failed')
    let throwOnRead = false
    let startNewest = false
    let newest!: Promise<TargetValidationResult>
    let resolveOldest!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    let validation!: ValidationGroup<'email'>
    const model = {
      get email() {
        if (throwOnRead) {
          throwOnRead = false
          throw captureFailure
        }
        return 'safe@example.com'
      },
    }
    let validationCalls = 0
    const schema = createSchema<{ email: string }>('test', value => validationCalls++ === 0
      ? new Promise((resolve) => { resolveOldest = resolve })
      : { value })
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      watch(
        () => validation.isValidating.value,
        (validating) => {
          if (!validating && startNewest) {
            startNewest = false
            newest = validation.validateAt('email')
          }
        },
        { flush: 'sync' },
      )
      return validation
    }, false)

    const oldest = mounted.value.validateAt('email')
    throwOnRead = true
    startNewest = true
    const middle = mounted.value.validateAt('email')

    await expect(middle).rejects.toBe(captureFailure)
    await expect(Promise.all([oldest, newest])).resolves.toEqual([
      { issues: [] },
      { issues: [] },
    ])
    expect(mounted.value.stateFor('email').validating).toBe(false)

    resolveOldest({ issues: [{ message: 'Late oldest', path: ['email'] }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(mounted.value.issues.value).toEqual([])
  })

  it('restores an unsettled latest target when a newer start fails after full supersession', async () => {
    const observationFailure = new Error('Target start observation failed')
    const resolvers: Array<(result: StandardSchemaV1.Result<{ email: string }>) => void> = []
    let throwOnRead = false
    let validation!: ValidationGroup<'email'>
    const model = {
      get email() {
        if (throwOnRead) {
          throwOnRead = false
          throw observationFailure
        }
        return 'safe@example.com'
      },
    }
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      watch(() => validation.stateFor('email').validating, () => {}, { flush: 'sync' })
      return validation
    }, false)

    const targeted = mounted.value.validateAt('email')
    const full = mounted.value.validate()
    expect(resolvers).toHaveLength(2)

    throwOnRead = true
    await expect(mounted.value.validateAt('email')).rejects.toBe(observationFailure)

    resolvers[1]?.({ value: { email: 'safe@example.com' } })
    await expect(Promise.all([targeted, full])).resolves.toEqual([
      { issues: [] },
      { success: true, issues: [] },
    ])

    resolvers[0]?.({ issues: [{ message: 'Late target', path: ['email'] }] })
    await Promise.resolve()
    expect(mounted.value.issues.value).toEqual([])
  })

  it('restores a settled latest target while an older caller is still adopting it', async () => {
    const observationFailure = new Error('Later target start observation failed')
    let startAdopter = false
    let failLaterStart = false
    let validation!: ValidationGroup<'email'>
    let adopter!: Promise<TargetValidationResult>
    let afterAdopter!: Promise<TargetValidationResult>
    let failed!: Promise<TargetValidationResult>
    let resolveAdopter!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    const model = {
      get email() {
        if (startAdopter) {
          startAdopter = false
          adopter = validation.validateAt('email')
          afterAdopter = adopter.then((result) => {
            failLaterStart = true
            failed = validation.validateAt('email')
            void failed.catch(() => {})
            return result
          })
        }
        if (failLaterStart) {
          failLaterStart = false
          throw observationFailure
        }
        return 'safe@example.com'
      },
    }
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolveAdopter = resolve
    }))
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      watch(() => validation.stateFor('email').validating, () => {}, { flush: 'sync' })
      return validation
    }, false)

    startAdopter = true
    const predecessor = mounted.value.validateAt('email')
    resolveAdopter({ value: { email: 'safe@example.com' } })

    await expect(adopter).resolves.toEqual({ issues: [] })
    await expect(afterAdopter).resolves.toEqual({ issues: [] })
    await expect(failed).rejects.toBe(observationFailure)
    await expect(predecessor).resolves.toEqual({ issues: [] })
    expect(mounted.value.stateFor('email').validating).toBe(false)
  })

  it('makes an older full caller adopt a full validation started while its replacement finishes', async () => {
    const email = ref('oldest')
    const resolvers = new Map<string, (result: StandardSchemaV1.Result<{ email: string }>) => void>()
    const schema = createSchema<{ email: string }>('test', value => new Promise((resolve) => {
      resolvers.set(value.email, resolve)
    }))
    let newest: Promise<ValidationResult> | undefined
    let startNewest = false
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email })
      watch(
        validation.isValidating,
        (validating) => {
          if (!validating && startNewest) {
            startNewest = false
            email.value = 'newest'
            newest = validation.validate()
          }
        },
        { flush: 'sync' },
      )
      return validation
    }, false)

    const oldest = mounted.value.validate()
    email.value = 'middle'
    const middle = mounted.value.validate()
    startNewest = true

    resolvers.get('middle')?.({ issues: [{ message: 'Middle', path: ['email'] }] })
    await vi.waitFor(() => expect(newest).toBeDefined())
    resolvers.get('newest')?.({ value: { email: 'newest' } })

    await expect(middle).resolves.toEqual({
      success: false,
      issues: [expect.objectContaining({ message: 'Middle' })],
    })
    await expect(newest).resolves.toEqual({ success: true, issues: [] })
    await expect(oldest).resolves.toEqual({ success: true, issues: [] })

    resolvers.get('oldest')?.({ issues: [{ message: 'Late oldest', path: ['email'] }] })
    await Promise.resolve()
    expect(mounted.value.issues.value).toEqual([])
  })

  it('projects a full validation started while an older target replacement finishes', async () => {
    const email = ref('target')
    const resolvers = new Map<string, (result: StandardSchemaV1.Result<{ email: string }>) => void>()
    const schema = createSchema<{ email: string }>('test', value => new Promise((resolve) => {
      resolvers.set(value.email, resolve)
    }))
    let newest: Promise<ValidationResult> | undefined
    let startNewest = false
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email })
      watch(
        validation.isValidating,
        (validating) => {
          if (!validating && startNewest) {
            startNewest = false
            email.value = 'newest'
            newest = validation.validate()
          }
        },
        { flush: 'sync' },
      )
      return validation
    }, false)

    const targeted = mounted.value.validateAt('email')
    email.value = 'middle'
    const middle = mounted.value.validate()
    startNewest = true

    resolvers.get('middle')?.({ issues: [{ message: 'Middle', path: ['email'] }] })
    await vi.waitFor(() => expect(newest).toBeDefined())
    resolvers.get('newest')?.({ value: { email: 'newest' } })

    await expect(middle).resolves.toEqual({
      success: false,
      issues: [expect.objectContaining({ message: 'Middle' })],
    })
    await expect(newest).resolves.toEqual({ success: true, issues: [] })
    await expect(targeted).resolves.toEqual({ issues: [] })

    resolvers.get('target')?.({ issues: [{ message: 'Late target', path: ['email'] }] })
    await Promise.resolve()
    expect(mounted.value.issues.value).toEqual([])
  })

  it('retains model dependencies until reset failure recovery can capture them again', async () => {
    const captureFailure = new Error('Reset capture failed')
    const pulse = ref(0)
    const email = ref('initial@example.com')
    let mutatePulse = false
    let throwBeforeEmailRead = false
    const model = {
      get pulse() {
        const value = pulse.value
        if (mutatePulse) {
          mutatePulse = false
          pulse.value++
        }
        return value
      },
      get email() {
        if (throwBeforeEmailRead) {
          throw captureFailure
        }
        return email.value
      },
    }
    const schema = createSchema<{ pulse: number, email: string }>('test', value => ({ value }))
    let evaluations = 0
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, model)
      watch(
        () => {
          evaluations++
          return validation.state.value.dirty
        },
        () => {},
        { flush: 'sync' },
      )
      return validation
    }, false)

    expect(mounted.value.state.value.dirty).toBe(false)
    mutatePulse = true
    throwBeforeEmailRead = true
    expect(() => mounted.value.resetState()).toThrow(captureFailure)

    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    const evaluationsWhileThrowing = evaluations

    throwBeforeEmailRead = false
    email.value = 'later@example.com'
    expect(evaluations).toBeGreaterThan(evaluationsWhileThrowing)
    expect(mounted.value.state.value.dirty).toBe(true)
  })

  it('does not evaluate computed or custom ref models while registering', () => {
    const failure = new Error('Lazy model read')
    const factories = [
      (read: () => never) => computed<{ email: string }>(read),
      (read: () => never) => customRef<{ email: string }>((track, trigger) => ({
        get() {
          track()
          return read()
        },
        set() {
          trigger()
        },
      })),
    ]

    for (const createModel of factories) {
      const read = vi.fn(() => {
        throw failure
      })
      const model = createModel(read)
      const schema = createSchema<{ email: string }>('test', value => ({ value }))
      let mounted!: ReturnType<typeof mountValidation<ValidationController<typeof schema>>>

      expect(() => {
        mounted = mountValidation(() => useValidation(schema, model), false)
      }).not.toThrow()
      expect(read).not.toHaveBeenCalled()
      expect(() => mounted.value.state.value).toThrow(failure)
      expect(read).toHaveBeenCalledOnce()
    }
  })

  it('captures a lazy registration after an observed root without reading it synchronously', async () => {
    const source = ref({ email: 'initial@example.com' })
    const read = vi.fn(() => source.value)
    const model = computed(read)
    const schema = createSchema<{ email: string }>('test', value => ({ value }))
    let evaluations = 0
    const mounted = mountValidation(() => {
      const root = useValidation()
      watch(
        () => {
          evaluations++
          return root.state.value.dirty
        },
        () => {},
        { flush: 'sync' },
      )
      useValidation(schema, model)
      return root
    }, false)

    expect(read).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(read).toHaveBeenCalledOnce()
    expect(mounted.value.state.value.dirty).toBe(false)

    const evaluationsBeforeMutation = evaluations
    source.value = { email: 'changed@example.com' }
    expect(evaluations).toBeGreaterThan(evaluationsBeforeMutation)
    expect(mounted.value.state.value.dirty).toBe(true)
  })

  it('preserves exact reset state and reactive dependencies when capture fails', async () => {
    const captureFailure = new Error('Later reset capture failed')
    const email = ref('initial@example.com')
    let mutateDuringReset = false
    let throwDuringReset = false
    const model = {
      get email() {
        const value = email.value
        if (mutateDuringReset) {
          mutateDuringReset = false
          email.value = 'during@example.com'
        }
        return value
      },
      get code() {
        if (throwDuringReset) {
          throwDuringReset = false
          throw captureFailure
        }
        return 'ready'
      },
    }
    let pendingTarget = false
    let resolvePending!: (result: StandardSchemaV1.Result<{ email: string, code: string }>) => void
    const schema = createSchema<{ email: string, code: string }>('test', (value) => {
      if (!pendingTarget) {
        return { value }
      }
      return new Promise((resolve) => {
        resolvePending = resolve
      })
    })
    let validation!: ReturnType<typeof useValidation<typeof schema>>
    const duringCapture: ValidationState[] = []
    let evaluations = 0
    const mounted = mountValidation(() => {
      validation = useValidation(schema, model)
      watch(
        () => {
          evaluations++
          const state = validation.stateFor('email')
          if (email.value === 'during@example.com') {
            duringCapture.push(state)
          }
          return state.dirty || state.stale
        },
        () => {},
        { flush: 'sync' },
      )
      return validation
    }, false)

    await mounted.value.validateAt('email')
    mounted.value.touch('email')
    email.value = 'changed@example.com'
    expect(mounted.value.stateFor('email')).toMatchObject({ dirty: true, validated: true, stale: true })

    pendingTarget = true
    const target = mounted.value.validateAt('email')

    mutateDuringReset = true
    throwDuringReset = true
    expect(() => mounted.value.resetState()).toThrow(captureFailure)
    expect(duringCapture).toContainEqual(expect.objectContaining({
      dirty: true,
      touched: true,
      validated: true,
      stale: true,
      validating: true,
    }))
    expect(mounted.value.stateFor('email')).toMatchObject({
      dirty: true,
      touched: true,
      validated: true,
      stale: true,
      validating: true,
    })

    resolvePending({ value: { email: 'changed@example.com', code: 'ready' } })
    await target

    const evaluationsAfterFailure = evaluations
    email.value = 'after@example.com'
    expect(evaluations).toBeGreaterThan(evaluationsAfterFailure)
    expect(mounted.value.stateFor('email')).toMatchObject({ dirty: true, validated: true, stale: true })
  })

  it('does not let a finish-time state observer failure retain validation activity', async () => {
    const observationFailure = new Error('Finish state observation failed')
    let throwOnRead = false
    let resolvePending!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    const model = {
      get email() {
        if (throwOnRead) {
          throw observationFailure
        }
        return 'safe@example.com'
      },
    }
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolvePending = resolve
    }))
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, model)
      watch(() => validation.state.value.validating, () => {}, { flush: 'sync' })
      return validation
    }, false)
    const pending = mounted.value.validate()

    throwOnRead = true
    resolvePending({ value: { email: 'safe@example.com' } })
    await expect(pending).resolves.toEqual({ success: true, issues: [] })

    throwOnRead = false
    expect(mounted.value.isValidating.value).toBe(false)
    expect(mounted.value.state.value.validating).toBe(false)
    expect(mounted.value.stateFor('email').validating).toBe(false)
  })

  it('aborts pending full and targeted callers promptly and ignores late settlement after reset', async () => {
    let resolveFull!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolveFull = resolve
    }))
    const mounted = mountValidation(() => useValidation(schema, { email: '' }), false)

    const full = mounted.value.validate()
    const targeted = mounted.value.validateAt('email')
    mounted.value.touch('email')
    mounted.value.resetState()

    const [fullResult, targetedResult] = await Promise.allSettled([full, targeted])
    expect(fullResult.status).toBe('rejected')
    expect(targetedResult.status).toBe('rejected')
    if (fullResult.status === 'rejected' && targetedResult.status === 'rejected') {
      expect(fullResult.reason).toBe(targetedResult.reason)
      expect(fullResult.reason).toMatchObject({ name: 'AbortError' })
    }

    resolveFull({ issues: [{ message: 'Late', path: ['email'] }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(mounted.value.issues.value).toEqual([])
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    expect(mounted.value.state.value).toEqual({
      dirty: false,
      touched: false,
      validated: false,
      stale: false,
      validating: false,
    })
  })

  it('observes an abandoned full projection when reset follows target supersession', async () => {
    const resolvers: Array<(result: StandardSchemaV1.Result<{ email: string }>) => void> = []
    const schema = createSchema<{ email: string }>('test', () => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    const mounted = mountValidation(() => useValidation(schema, { email: '' }), false)
    const unhandledReasons: unknown[] = []
    const recordUnhandled = (reason: unknown) => unhandledReasons.push(reason)
    process.on('unhandledRejection', recordUnhandled)

    try {
      const targeted = mounted.value.validateAt('email')
      const full = mounted.value.validate()
      mounted.value.resetState()

      const [targetedResult, fullResult] = await Promise.allSettled([targeted, full])
      expect(targetedResult.status).toBe('rejected')
      expect(fullResult.status).toBe('rejected')
      if (targetedResult.status === 'rejected' && fullResult.status === 'rejected') {
        expect(targetedResult.reason).toBe(fullResult.reason)
        expect(targetedResult.reason).toMatchObject({ name: 'AbortError' })
      }

      await Promise.resolve()
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(unhandledReasons).toEqual([])
      expect(mounted.value.state.value).toEqual({
        dirty: false,
        touched: false,
        validated: false,
        stale: false,
        validating: false,
      })

      expect(resolvers).toHaveLength(2)
      for (const resolve of resolvers) {
        resolve({ issues: [{ message: 'Late', path: ['email'] }] })
      }
      await Promise.resolve()
      await Promise.resolve()
      expect(mounted.value.issues.value).toEqual([])
      expect(mounted.value.result.value).toEqual({ status: 'idle' })
      expect(mounted.value.state.value).toEqual({
        dirty: false,
        touched: false,
        validated: false,
        stale: false,
        validating: false,
      })
    }
    finally {
      process.off('unhandledRejection', recordUnhandled)
    }
  })

  it('aborts a full caller when reset runs synchronously from its result commit', async () => {
    const schema = createSchema<{ email: string }>('test', value => ({ value }))
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email: 'valid@example.com' })
      let resetOnCommit = true
      watch(
        () => validation.result.value,
        (result) => {
          if (resetOnCommit && result.status !== 'idle') {
            resetOnCommit = false
            validation.resetState()
          }
        },
        { flush: 'sync' },
      )
      return validation
    }, false)

    const full = mounted.value.validate()
    const targeted = mounted.value.validateAt('email')
    const [fullResult, targetedResult] = await Promise.allSettled([full, targeted])

    expect(fullResult.status).toBe('rejected')
    expect(targetedResult.status).toBe('rejected')
    if (fullResult.status === 'rejected' && targetedResult.status === 'rejected') {
      expect(fullResult.reason).toBe(targetedResult.reason)
      expect(fullResult.reason).toMatchObject({ name: 'AbortError' })
    }
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    expect(mounted.value.issues.value).toEqual([])
    expect(mounted.value.state.value).toMatchObject({ validated: false, validating: false })
  })

  it('aborts a targeted caller when reset runs synchronously from its issue commit', async () => {
    const schema = createSchema<{ email: string }>('test', () => ({
      issues: [{ message: 'Invalid', path: ['email'] }],
    }))
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email: '' })
      let resetOnCommit = true
      watch(
        () => validation.issues.value,
        (issues) => {
          if (resetOnCommit && issues.length > 0) {
            resetOnCommit = false
            validation.resetState()
          }
        },
        { flush: 'sync' },
      )
      return validation
    }, false)

    await expect(mounted.value.validateAt('email')).rejects.toMatchObject({ name: 'AbortError' })
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    expect(mounted.value.issues.value).toEqual([])
    expect(mounted.value.stateFor('email')).toMatchObject({ validated: false, validating: false })
  })

  it('keeps every pre-reset caller aborted when new validation starts immediately', async () => {
    const resolvers = new Map<string, (result: StandardSchemaV1.Result<{ email: string }>) => void>()
    const email = ref('older')
    const schema = createSchema<{ email: string }>('test', value => new Promise((resolve) => {
      resolvers.set(value.email, resolve)
    }))
    const mounted = mountValidation(() => useValidation(schema, { email }), false)

    const older = mounted.value.validate()
    email.value = 'current'
    const current = mounted.value.validate()
    mounted.value.resetState()

    email.value = 'post-reset'
    const postReset = mounted.value.validate()
    const [olderResult, currentResult] = await Promise.allSettled([older, current])

    expect(olderResult.status).toBe('rejected')
    expect(currentResult.status).toBe('rejected')
    if (olderResult.status === 'rejected' && currentResult.status === 'rejected') {
      expect(olderResult.reason).toBe(currentResult.reason)
      expect(olderResult.reason).toMatchObject({ name: 'AbortError' })
    }

    resolvers.get('post-reset')?.({ value: { email: 'post-reset' } })
    await expect(postReset).resolves.toEqual({ success: true, issues: [] })
    resolvers.get('older')?.({ issues: [{ message: 'Late older', path: ['email'] }] })
    resolvers.get('current')?.({ issues: [{ message: 'Late current', path: ['email'] }] })
    await Promise.resolve()
    expect(mounted.value.issues.value).toEqual([])
  })
})

describe('targeted validation interface', () => {
  it('accepts branch-only top-level union keys and rejects unknown keys', () => {
    type Account
      = | { kind: 'person', dateOfBirth: string }
        | { kind: 'company', companyNumber: string }
    const schema = createSchema<Account>('test', value => ({ value }))
    const model = ref<Account>({ kind: 'person', dateOfBirth: '' })
    const mounted = mountValidation(() => useValidation(schema, model), false)

    expectTypeOf(mounted.value.validateAt).parameter(0).toEqualTypeOf<
      'kind' | 'dateOfBirth' | 'companyNumber' | readonly PropertyKey[]
    >()
    mounted.value.touch('dateOfBirth')
    void mounted.value.stateFor('companyNumber')
    void mounted.value.issuesFor('companyNumber')
    if (false) {
      // @ts-expect-error Union controllers reject unknown top-level keys.
      void mounted.value.validateAt('missing')
      // @ts-expect-error Union controllers reject unknown top-level keys.
      mounted.value.touch('missing')
      // @ts-expect-error Union controllers reject unknown top-level keys.
      void mounted.value.stateFor('missing')
    }
  })

  it('keeps optional and nullable object paths narrow', () => {
    type OptionalAccount = { email: string } | undefined
    type NullableAccount = { email: string } | null
    const optionalSchema = createSchema<OptionalAccount>('test', value => ({ value }))
    const nullableSchema = createSchema<NullableAccount>('test', value => ({ value }))
    const optionalModel = ref<OptionalAccount>({ email: '' })
    const nullableModel = ref<NullableAccount>({ email: '' })
    const mounted = mountValidation(() => ({
      optional: useValidation(optionalSchema, optionalModel),
      nullable: useValidation(nullableSchema, nullableModel),
    }), false)

    expectTypeOf(mounted.value.optional.validateAt).parameter(0).toEqualTypeOf<
      'email' | readonly PropertyKey[]
    >()
    expectTypeOf(mounted.value.nullable.validateAt).parameter(0).toEqualTypeOf<
      'email' | readonly PropertyKey[]
    >()
    mounted.value.optional.touch('email')
    void mounted.value.nullable.stateFor('email')
    if (false) {
      // @ts-expect-error Optional object controllers reject unknown top-level keys.
      void mounted.value.optional.validateAt('missing')
      // @ts-expect-error Optional object controllers reject unknown top-level keys.
      mounted.value.optional.touch('missing')
      // @ts-expect-error Nullable object controllers reject unknown top-level keys.
      void mounted.value.nullable.stateFor('missing')
      // @ts-expect-error Nullable object controllers reject unknown top-level keys.
      void mounted.value.nullable.issuesFor('missing')
    }
  })

  it('keeps the property-key fallback for scalar schemas', () => {
    const schema = createSchema<string>('test', value => ({ value }))
    const model = ref('')
    const mounted = mountValidation(() => useValidation(schema, model), false)

    expectTypeOf(mounted.value.validateAt).parameter(0).toEqualTypeOf<
      PropertyKey | readonly PropertyKey[]
    >()
  })
})

describe('semantic issues and messages', () => {
  it('normalises guaranteed Zod 4.5.4 semantics from real issues', async () => {
    expect(zodVersion).toBe('4.5.4')
    const z = await loadZod()
    const schema = z.object({
      required: z.string(),
      undefinedValue: z.string(),
      wrongType: z.string(),
      email: z.email(),
      url: z.url(),
      minLength: z.string().min(3),
      maxLength: z.string().max(2),
      minimum: z.number().min(3),
      maximum: z.number().max(2),
      pattern: z.string().regex(/^x/),
      date: z.date(),
    })
    const mounted = mountValidation(() => useValidation(schema, {
      undefinedValue: undefined,
      wrongType: null,
      email: 'invalid',
      url: 'invalid',
      minLength: 'x',
      maxLength: 'xxx',
      minimum: 2,
      maximum: 3,
      pattern: 'invalid',
      date: new Date('invalid'),
    }), false)

    await mounted.value.validate()

    expect(semanticsByPath(mounted.value.issues.value)).toEqual({
      required: { identifier: 'required', values: {} },
      undefinedValue: { identifier: 'required', values: {} },
      wrongType: { identifier: 'invalidType', values: { expected: 'string' } },
      email: { identifier: 'invalidEmail', values: {} },
      url: { identifier: 'invalidUrl', values: {} },
      minLength: { identifier: 'minLength', values: { minimum: 3 }, count: 3 },
      maxLength: { identifier: 'maxLength', values: { maximum: 2 }, count: 2 },
      minimum: { identifier: 'minimum', values: { minimum: 3, inclusive: true } },
      maximum: { identifier: 'maximum', values: { maximum: 2, inclusive: true } },
      pattern: { identifier: 'pattern', values: {} },
      date: { identifier: 'invalidDate', values: {} },
    })
  })

  it('normalises guaranteed Valibot 1.4.2 semantics from real issues', async () => {
    expect(valibotVersion).toBe('1.4.2')
    const v = await loadValibot()
    const schema = v.object({
      required: v.string(),
      undefinedValue: v.string(),
      wrongType: v.string(),
      email: v.pipe(v.string(), v.email()),
      url: v.pipe(v.string(), v.url()),
      minLength: v.pipe(v.string(), v.minLength(3)),
      maxLength: v.pipe(v.string(), v.maxLength(2)),
      minimum: v.pipe(v.number(), v.minValue(3)),
      maximum: v.pipe(v.number(), v.maxValue(2)),
      exclusiveMinimum: v.pipe(v.number(), v.gtValue(3)),
      exclusiveMaximum: v.pipe(v.number(), v.ltValue(2)),
      pattern: v.pipe(v.string(), v.regex(/^x/)),
      date: v.date(),
    })
    const mounted = mountValidation(() => useValidation(schema, {
      undefinedValue: undefined,
      wrongType: null,
      email: 'invalid',
      url: 'invalid',
      minLength: 'x',
      maxLength: 'xxx',
      minimum: 2,
      maximum: 3,
      exclusiveMinimum: 3,
      exclusiveMaximum: 2,
      pattern: 'invalid',
      date: new Date('invalid'),
    }), false)

    await mounted.value.validate()

    expect(semanticsByPath(mounted.value.issues.value)).toEqual({
      required: { identifier: 'required', values: {} },
      undefinedValue: { identifier: 'required', values: {} },
      wrongType: { identifier: 'invalidType', values: { expected: 'string' } },
      email: { identifier: 'invalidEmail', values: {} },
      url: { identifier: 'invalidUrl', values: {} },
      minLength: { identifier: 'minLength', values: { minimum: 3 }, count: 3 },
      maxLength: { identifier: 'maxLength', values: { maximum: 2 }, count: 2 },
      minimum: { identifier: 'minimum', values: { minimum: 3, inclusive: true } },
      maximum: { identifier: 'maximum', values: { maximum: 2, inclusive: true } },
      exclusiveMinimum: { identifier: 'minimum', values: { minimum: 3, inclusive: false } },
      exclusiveMaximum: { identifier: 'maximum', values: { maximum: 2, inclusive: false } },
      pattern: { identifier: 'pattern', values: {} },
      date: { identifier: 'invalidDate', values: {} },
    })
  })

  it('runs registration, inherited root, application and built-in normalisers in order', async () => {
    const calls: string[] = []
    const registration = vi.fn(() => {
      calls.push('registration')
      return undefined
    })
    const root = vi.fn(() => {
      calls.push('root')
      return undefined
    })
    const application = vi.fn(() => {
      calls.push('application')
      return undefined
    })
    const z = await loadZod()
    const schema = z.object({ email: z.email() })
    let child!: ReturnType<typeof useValidation<typeof schema>>
    const Child = defineComponent({
      setup() {
        child = useValidation(schema, { email: 'invalid' }, { describeIssue: registration })
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        useValidation({ describeIssue: root })
        return () => h(Child)
      },
    })
    mountComponent(Parent, createVerific({ describeIssue: application }))

    await child.validate()

    expect(child.ownIssues.value[0]?.semantic?.identifier).toBe('invalidEmail')
    expect(calls).toEqual(['registration', 'root', 'application'])
    expect(registration).toHaveBeenCalledOnce()
    expect(root).toHaveBeenCalledOnce()
    expect(application).toHaveBeenCalledOnce()
  })

  it('keeps a joining registration normaliser local to that registration', async () => {
    const registration = vi.fn(() => ({ identifier: 'registration', values: {} }))
    const root = vi.fn(() => ({ identifier: 'root', values: {} }))
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    let child!: ReturnType<typeof useValidation<typeof schema>>
    const Grandchild = defineComponent({
      setup() {
        useValidation(schema, {})
        return () => null
      },
    })
    const Child = defineComponent({
      setup() {
        child = useValidation(schema, {}, { describeIssue: registration })
        return () => h(Grandchild)
      },
    })
    const Parent = defineComponent({
      setup() {
        useValidation({ describeIssue: root })
        return () => h(Child)
      },
    })
    mountComponent(Parent, false)

    await child.validate()

    expect(child.issues.value.map(issue => issue.semantic?.identifier)).toEqual(['registration', 'root'])
    expect(registration).toHaveBeenCalledOnce()
    expect(root).toHaveBeenCalledOnce()
  })

  it('invokes a repeated normaliser function identity once per issue', async () => {
    const shared: IssueNormaliser = vi.fn(() => undefined)
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    let child!: ReturnType<typeof useValidation<typeof schema>>
    const Child = defineComponent({
      setup() {
        child = useValidation(schema, {}, { describeIssue: shared })
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        useValidation({ describeIssue: shared })
        return () => h(Child)
      },
    })
    mountComponent(Parent, createVerific({ describeIssue: shared }))

    await child.validate()

    expect(shared).toHaveBeenCalledOnce()
    expect(child.ownIssues.value[0]?.semantic).toBeUndefined()
  })

  it('resets inherited normaliser and message policy for a new scope', async () => {
    const outerNormaliser = vi.fn(() => ({ identifier: 'outer', values: {} }))
    const outerMessages = vi.fn(() => 'Outer')
    const applicationNormaliser = vi.fn(() => ({ identifier: 'application', values: {} }))
    const applicationMessages = vi.fn((context: MessageContext) => context.messagePrefix === undefined ? 'Application' : undefined)
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    let inner!: ReturnType<typeof useValidation<typeof schema>>
    const Inner = defineComponent({
      setup() {
        inner = useValidation(schema, {}, { scope: 'new' })
        return () => null
      },
    })
    const Outer = defineComponent({
      setup() {
        useValidation({
          describeIssue: outerNormaliser,
          messages: outerMessages,
          messagePrefix: 'outer',
        })
        return () => h(Inner)
      },
    })
    mountComponent(Outer, createVerific({
      describeIssue: applicationNormaliser,
      messages: applicationMessages,
    }))

    await inner.validate()

    expect(inner.ownIssues.value[0]?.semantic?.identifier).toBe('application')
    expect(inner.errors.value).toEqual(['Application'])
    expect(outerNormaliser).not.toHaveBeenCalled()
    expect(outerMessages).not.toHaveBeenCalled()
    expect(applicationNormaliser).toHaveBeenCalledOnce()
    expect(applicationMessages).toHaveBeenCalledOnce()
  })

  it('uses registration, root and application resolvers once in precedence order', async () => {
    const calls: string[] = []
    const application = vi.fn(() => {
      calls.push('application')
      return 'Application'
    })
    const root = vi.fn(() => {
      calls.push('root')
      return undefined
    })
    const local = vi.fn(() => {
      calls.push('local')
      return undefined
    })
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    let child!: ReturnType<typeof useValidation<typeof schema>>
    const Child = defineComponent({
      setup() {
        child = useValidation(schema, {}, { messages: local })
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        useValidation({ messages: root })
        return () => h(Child)
      },
    })
    mountComponent(Parent, createVerific({ messages: application }))

    await child.validate()

    expect(child.errors.value).toEqual(['Application'])
    expect(calls).toEqual(['local', 'root', 'application'])
  })

  it('does not invoke a scope creator resolver twice for its own issue', async () => {
    const resolver = vi.fn(() => undefined)
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    const mounted = mountValidation(() => useValidation(schema, {}, { messages: resolver }), false)
    await mounted.value.validate()

    expect(mounted.value.errors.value).toEqual(['Raw'])
    expect(resolver).toHaveBeenCalledOnce()
  })

  it('supports a namespace-oriented catalogue resolver', async () => {
    const catalogue = new Map([
      ['validation', new Map([
        ['invalidEmail', 'Enter a valid email address'],
      ])],
    ])
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    const mounted = mountValidation(() => useValidation(schema, {}, {
      describeIssue: () => ({ identifier: 'invalidEmail', values: {} }),
      messages: ({ identifier }) => catalogue.get('validation')?.get(identifier),
    }), false)

    await mounted.value.validate()

    expect(mounted.value.errors.value).toEqual(['Enter a valid email address'])
  })

  it('supports an explicit generated-function-map resolver', async () => {
    const generatedMessages = new Map<string, (values: MessageContext['values']) => string>([
      ['minLength', values => `Use at least ${values.minimum} characters`],
    ])
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    const mounted = mountValidation(() => useValidation(schema, {}, {
      describeIssue: () => ({ identifier: 'minLength', values: { minimum: 4 }, count: 4 }),
      messages: ({ identifier, values }) => generatedMessages.get(identifier)?.(values),
    }), false)

    await mounted.value.validate()

    expect(mounted.value.errors.value).toEqual(['Use at least 4 characters'])
  })

  it('resolves messages lazily on the same stack from reactive locale state', async () => {
    const locale = ref<'en' | 'es'>('en')
    const validator = vi.fn(() => ({ issues: [{ message: 'Raw', path: ['email'] }] }))
    const schema = createSchema<{ email: string }>('test', validator)
    const mounted = mountValidation(() => {
      const validation = useValidation(schema, { email: ref('') }, {
        messages: () => locale.value === 'en' ? 'Invalid email' : 'Correo no válido',
      })
      return {
        validation,
        retained: computed(() => validation.errorFor('email')),
      }
    }, false)
    await mounted.value.validation.validate()
    const snapshot = mounted.value.validation.errorFor('email')

    locale.value = 'es'

    expect(snapshot).toBe('Invalid email')
    expect(mounted.value.retained.value).toBe('Correo no válido')
    expect(validator).toHaveBeenCalledOnce()
  })

  it('reports only the highest-precedence diagnostic adapter after complete fallback', async () => {
    const localMissing = vi.fn()
    const applicationMissing = vi.fn()
    const local: DiagnosticMessageAdapter = {
      resolve: () => ({ resolved: false, attempt: { locale: 'en', keys: ['local.invalid'] } }),
      onMissing: localMissing,
    }
    const application: DiagnosticMessageAdapter = {
      resolve: () => ({ resolved: false, attempt: { locale: 'fr', keys: ['global.invalid'] } }),
      onMissing: applicationMissing,
    }
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    const mounted = mountValidation(
      () => useValidation(schema, {}, { messages: local, messagePrefix: 'form' }),
      createVerific({ messages: application }),
    )
    await mounted.value.validate()

    expect(mounted.value.errors.value).toEqual(['Raw'])
    expect(localMissing).toHaveBeenCalledWith(expect.objectContaining({
      messagePrefix: 'form',
      identifier: 'invalid',
      attempts: [
        { locale: 'en', keys: ['local.invalid'] },
        { locale: 'fr', keys: ['global.invalid'] },
      ],
    }))
    expect(applicationMissing).not.toHaveBeenCalled()
  })

  it('surfaces custom normaliser and resolver errors', async () => {
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Raw' }] }))
    const normaliserFailure = mountValidation(() => useValidation(schema, {}, {
      describeIssue: () => { throw new Error('Bad normaliser') },
    }), false)
    await expect(normaliserFailure.value.validate()).rejects.toThrow('Bad normaliser')

    const resolverFailure = mountValidation(() => useValidation(schema, {}, {
      messages: () => { throw new Error('Bad resolver') },
    }), false)
    await resolverFailure.value.validate()
    expect(() => resolverFailure.value.errors.value).toThrow('Bad resolver')
  })
})

function createSchema<Input, Output = Input>(
  vendor: string,
  validate: (value: Input) => StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate: value => validate(value as Input),
    },
  }
}

function semanticsByPath(issues: readonly ValidationIssue[]): Record<string, ValidationIssue['semantic']> {
  return Object.fromEntries(issues.map(issue => [String(issue.path[0]), issue.semantic]))
}

function mountValidation<Value>(setup: () => Value, plugin: false | ReturnType<typeof createVerific>): { app: App, value: Value } {
  let value!: Value
  const component = defineComponent({
    setup() {
      value = setup()
      return () => null
    },
  })
  const app = mountComponent(component, plugin)
  return { app, value }
}

function mountComponent(component: Component, plugin: false | ReturnType<typeof createVerific>): App {
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp(component)
  if (plugin) {
    app.use(plugin)
  }
  app.mount(container)
  mountedApps.push(app)
  return app
}
