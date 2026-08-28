import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { App, Component } from 'vue'
import type { DiagnosticMessageAdapter, IssueNormaliser, MessageContext, ValidationGroup, ValidationIssue, ValidationResult } from '../src/main'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, reactive, ref, watch } from 'vue'
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

    await expect(mounted.value.validateFor('confirmation')).resolves.toMatchObject({
      success: false,
      issues: [expect.objectContaining({ message: 'Does not match' })],
    })

    expect(validator).toHaveBeenCalledWith({ password: 'secret', confirmation: '', profile: { name: '' } })
    expect(mounted.value.errors.value).toEqual(['Does not match'])
    expect(mounted.value.ownIssues.value).toEqual(mounted.value.issues.value)
    expect(mounted.value.result.value).toEqual({ status: 'idle' })
    expectTypeOf(mounted.value.validateFor).parameter(0).toEqualTypeOf<'password' | 'confirmation' | 'profile' | readonly PropertyKey[]>()
    if (false) {
      // @ts-expect-error Schema controllers reject unknown top-level keys.
      void mounted.value.validateFor('missing')
    }
  })

  it('replaces one path in place, clears stale issues and preserves unrelated issue identity', async () => {
    const email = ref('')
    const password = ref('')
    const schema = createSchema<{ email: string, password: string }>('test', value => ({
      issues: [
        ...(value.email ? [] : [{ message: 'Email required', path: ['email'] }]),
        ...(value.password ? [] : [{ message: 'Password required', path: ['password'] }]),
      ],
    }))
    const mounted = mountValidation(() => useValidation(schema, { email, password }), false)
    await mounted.value.validate()
    const retainedPasswordIssue = mounted.value.issuesFor('password')[0]

    email.value = 'valid@example.com'
    await expect(mounted.value.validateFor('email')).resolves.toEqual({ success: true, issues: [] })

    expect(mounted.value.errors.value).toEqual(['Password required'])
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

    await mounted.value.validateFor('postcode')

    expect(shippingValidator).toHaveBeenCalledOnce()
    expect(billingValidator).not.toHaveBeenCalled()
    expect(mounted.value.issues.value[0]?.path).toEqual(['shipping', 'postcode'])
  })

  it('targets a pathless issue at the controller registration prefix', async () => {
    const schema = createSchema<unknown>('test', () => ({ issues: [{ message: 'Shipping invalid' }] }))
    const mounted = mountValidation(() => useValidation(schema, {}, { at: ['shipping'] }), false)

    await expect(mounted.value.validateFor([])).resolves.toMatchObject({ success: false })

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

    await expect(mounted.value.validateFor(field)).resolves.toMatchObject({ success: false })

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

    const emailRun = mounted.value.validateFor('email')
    model.email = 'other'
    const passwordRun = mounted.value.validateFor('password')
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

    const older = mounted.value.validateFor('email')
    email.value = 'newer'
    const newer = mounted.value.validateFor('email')
    resolvers.get('newer')?.({ issues: [{ message: 'Current', path: ['email'] }] })

    await expect(newer).resolves.toMatchObject({ success: false })
    await expect(older).resolves.toEqual(await newer)
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

    const target = mounted.value.validateFor('email')
    const full = mounted.value.validate()

    await expect(full).resolves.toMatchObject({ success: false })
    await expect(target).resolves.toEqual({ success: false, issues: mounted.value.issuesFor('email') })
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
    const target = mounted.value.validateFor('email')
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

    await expect(mounted.value.validateFor('email')).rejects.toThrow('Unavailable')
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

    const target = root.validateFor('email')
    showChild.value = false
    await nextTick()

    await expect(target).resolves.toEqual({ success: true, issues: [] })
    expect(root.isValidating.value).toBe(false)
  })

  it('resolves targeted messages lazily after the locale changes', async () => {
    const locale = ref<'en' | 'es'>('en')
    const validator = vi.fn(() => ({ issues: [{ message: 'Raw', path: ['email'] }] }))
    const schema = createSchema<{ email: string }>('test', validator)
    const mounted = mountValidation(() => useValidation(schema, { email: '' }, {
      messages: () => locale.value === 'en' ? 'Invalid email' : 'Correo no válido',
    }), false)

    await mounted.value.validateFor('email')
    locale.value = 'es'
    await nextTick()

    expect(mounted.value.errorsFor('email')).toEqual(['Correo no válido'])
    expect(validator).toHaveBeenCalledOnce()
  })

  it('lets the next full run replace the ledger and update transformed output atomically', async () => {
    const email = ref('invalid')
    const schema = createSchema<{ email: string }, { email: string, normalised: true }>('test', value => value.email === 'valid'
      ? { value: { email: value.email, normalised: true } }
      : { issues: [{ message: 'Invalid email', path: ['email'] }] })
    const mounted = mountValidation(() => useValidation(schema, { email }), false)
    await mounted.value.validateFor('email')

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
    const target = mounted.value.validateFor('email')
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

describe('semantic issues and messages', () => {
  it('normalises guaranteed Zod 4.5.1 semantics from real issues', async () => {
    expect(zodVersion).toBe('4.5.1')
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

  it('resolves messages lazily from reactive locale state', async () => {
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
    await nextTick()

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
