import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { App } from 'vue'
import type { StandaloneValidationScope, ValidationGroup } from '../src/main'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, effectScope, h, nextTick, readonly, ref, toRef, watch } from 'vue'
import { createValidationScope, useValidation } from '../src/main'

const scopes: StandaloneValidationScope[] = []
const apps: App[] = []

afterEach(() => {
  scopes.splice(0).forEach(scope => scope.dispose())
  apps.splice(0).forEach(app => app.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function scope(options: Parameters<typeof createValidationScope>[0] = {}) {
  const validation = createValidationScope(options)
  scopes.push(validation)
  return validation
}

function schema<Input>(
  validate: StandardSchemaV1<Input>['~standard']['validate'] = value => ({ value: value as Input }),
): StandardSchemaV1<Input> {
  return { '~standard': { version: 1, vendor: 'test', validate } }
}

describe('external issues', () => {
  it('keeps server issues separate from schema issues and preserves original data', async () => {
    const root = scope()
    const raw = { message: 'Already registered', path: ['vendor-path'], request: 42 }
    const field = root.register(schema<{ email: string }>(() => ({
      issues: [{ message: 'Invalid format', path: ['email'] }],
    })), { email: ref('') })
    field.setIssues('email', [raw])
    expect(field.issuesFor('email')[0]?.raw).toBe(raw)
    expect(field.issuesFor('email')[0]?.vendor).toBe('server')
    expect(field.ownIssues.value).toEqual([])
    await expect(field.validate()).resolves.toMatchObject({ success: false })
    expect(field.errorsFor('email')).toEqual(['Invalid format', 'Already registered'])
    await field.commit('email')
    expect(field.errorsFor('email')).toEqual(['Invalid format', 'Already registered'])
    field.clearIssues('email')
    expect(field.errorsFor('email')).toEqual(['Invalid format'])
  })

  it('uses relative paths and the registration message policy for server issues', () => {
    const root = scope({ messages: () => 'Root message' })
    const field = root.register(schema<{ email: string }>(), { email: '' }, {
      at: ['account'],
      messages: ({ identifier, values }) => `${identifier}:${values.minimum}`,
      describeIssue: ({ vendor }) => vendor === 'server'
        ? { identifier: 'minLength', values: { minimum: 3 } }
        : undefined,
    })
    const raw = { message: 'Too short' }
    field.setIssues('email', [raw])
    expect(field.errorFor('email')).toBe('minLength:3')
    expect(root.issuesFor(['account', 'email'])[0]).toMatchObject({
      localPath: ['email'],
      path: ['account', 'email'],
      raw,
    })
    root.setIssues([], [{ message: 'Request failed' }])
    expect(root.errorFor([])).toBe('Root message')
    field.setIssues('email', [{ message: 'Updated response' }])
    expect(root.issuesFor(['account', 'email'])).toHaveLength(1)
    expect(root.issuesFor(['account', 'email'])[0]?.message).toBe('Updated response')
    expect(root.errorFor([])).toBe('Root message')
    field.clearIssues('email')
    expect(root.issues.value).toHaveLength(1)
    root.clearIssues()
    expect(root.issues.value).toEqual([])
  })

  it('replaces only the selected external path and makes full validation fail', async () => {
    const root = scope()
    root.register(schema<{ name: string }>(), { name: 'Ada' })
    root.setIssues('name', [{ message: 'First' }])
    root.setIssues('other', [{ message: 'Other' }])
    root.setIssues('name', [{ message: 'Replacement' }])
    expect(root.errorsFor('name')).toEqual(['Replacement'])
    await expect(root.validate()).resolves.toMatchObject({ success: false })
    root.setIssues('name', [])
    expect(root.errors.value).toEqual(['Other'])
    root.resetState()
    await expect(root.validate()).resolves.toEqual({ success: true, issues: [] })
  })

  it('preserves external issues when reset cannot capture the model', () => {
    const root = scope()
    let fail = false
    root.register(schema<{ email: string }>(), {
      get email() {
        if (fail)
          throw new Error('Capture failed')
        return ''
      },
    })
    root.setIssues('email', [{ message: 'Server issue' }])
    fail = true
    expect(() => root.resetState()).toThrow('Capture failed')
    expect(root.errors.value).toEqual(['Server issue'])
  })
})

describe('standalone scopes', () => {
  it('validates owned refs outside components and exposes typed transformed output', async () => {
    const root = scope()
    const email = ref(' ada@example.com ')
    const transformed: StandardSchemaV1<{ email: string }, { address: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: input => ({ value: { address: (input as { email: string }).email.trim() } }),
      },
    }
    const field = root.register(transformed, { email })
    await expect(root.validate()).resolves.toEqual({ success: true, issues: [] })
    expect(field.result.value).toEqual({ status: 'valid', value: { address: 'ada@example.com' } })
    expect(email.value).toBe(' ada@example.com ')
    email.value = 'other@example.com'
    expect(field.state.value.stale).toBe(true)
  })

  it('disposes pending validation and queued commits, and refuses later work', async () => {
    vi.useFakeTimers()
    const root = scope()
    const field = root.register(schema<{ email: string }>(() => new Promise(() => {})), { email: ref('') })
    const validation = root.validate()
    const queued = field.commit('email', { debounce: 100 })
    const validationRejected = expect(validation).rejects.toMatchObject({ name: 'AbortError' })
    const queuedRejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    root.dispose()
    await validationRejected
    await queuedRejected
    await expect(root.validate()).rejects.toMatchObject({ name: 'AbortError' })
    await expect(root.validateAt('email')).rejects.toMatchObject({ name: 'AbortError' })
    await expect(field.commit('email')).rejects.toMatchObject({ name: 'AbortError' })
    expect(() => root.register(schema(), {})).toThrow('disposed')
    expect(() => root.setIssues([], [{ message: 'Late' }])).toThrow('disposed')
    expect(root.isValidating.value).toBe(false)
  })

  it('follows its owning Vue effect scope and remains isolated from other scopes', async () => {
    const owner = effectScope()
    const owned = owner.run(() => scope())!
    const independent = scope()
    owned.register(schema<{ email: string }>(), { email: '' })
    independent.register(schema<{ email: string }>(), { email: '' })
    owner.stop()
    await expect(owned.validate()).rejects.toMatchObject({ name: 'AbortError' })
    await expect(independent.validate()).resolves.toMatchObject({ success: true })
  })
})

describe('submission state', () => {
  it('tracks a whole submission and deduplicates concurrent attempts', async () => {
    const root = scope()
    root.register(schema<{ email: string }>(), { email: '' })
    let finish!: () => void
    const callback = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const submit = root.handleSubmit(callback)
    const pending = submit()
    expect(submit()).toBe(pending)
    expect(root.submitCount.value).toBe(1)
    expect(root.isSubmitting.value).toBe(true)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    expect(root.isValidating.value).toBe(false)
    expect(root.isSubmitting.value).toBe(true)
    finish()
    await expect(pending).resolves.toMatchObject({ success: true })
    expect(root.isSubmitting.value).toBe(false)
  })

  it('counts invalid attempts and does not submit while server issues remain', async () => {
    const root = scope()
    root.register(schema<{ email: string }>(), { email: '' })
    root.setIssues('email', [{ message: 'Already registered' }])
    const callback = vi.fn()
    const submit = root.handleSubmit(callback)
    await expect(submit()).resolves.toMatchObject({ success: false })
    expect(callback).not.toHaveBeenCalled()
    expect(root.submitCount.value).toBe(1)
    root.clearIssues()
    await submit()
    expect(callback).toHaveBeenCalledOnce()
    expect(root.submitCount.value).toBe(2)
  })

  it('rejects stale validation without invoking the submission callback', async () => {
    const root = scope()
    const email = ref('first@example.com')
    let finish!: (result: StandardSchemaV1.Result<{ email: string }>) => void
    root.register(schema<{ email: string }>(() => new Promise((resolve) => {
      finish = resolve
    })), { email })
    const callback = vi.fn()
    const pending = root.handleSubmit(callback)()
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    email.value = 'changed@example.com'
    finish({ value: { email: 'first@example.com' } })
    await rejection
    expect(callback).not.toHaveBeenCalled()
    expect(root.isSubmitting.value).toBe(false)
  })

  it.each(['reset', 'dispose'] as const)('aborts a hanging callback on %s and settles promptly', async (operation) => {
    const root = scope()
    root.register(schema(), {})
    let signal!: AbortSignal
    const callback = vi.fn((_result, abortSignal: AbortSignal) => {
      signal = abortSignal
      return new Promise(() => {})
    })
    const pending = root.handleSubmit(callback)()
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    if (operation === 'reset')
      root.resetState()
    else
      root.dispose()
    await rejection
    expect(signal.aborted).toBe(true)
    expect(root.isSubmitting.value).toBe(false)
    expect(root.submitCount.value).toBe(0)
  })

  it('clears busy state after callback rejection and permits retry', async () => {
    const root = scope()
    root.register(schema(), {})
    const callback = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined)
    const submit = root.handleSubmit(callback)
    await expect(submit()).rejects.toThrow('Offline')
    expect(root.isSubmitting.value).toBe(false)
    await submit()
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('reserves the active attempt before synchronous submit-count observers run', async () => {
    const root = scope()
    root.register(schema(), {})
    const callback = vi.fn()
    const submit = root.handleSubmit(callback)
    let duplicate: ReturnType<typeof submit> | undefined
    const stop = watch(root.submitCount, () => {
      duplicate = submit()
    }, { flush: 'sync' })
    const pending = submit()
    stop()
    expect(duplicate).toBe(pending)
    await pending
    expect(callback).toHaveBeenCalledOnce()
  })

  it('finishes cancellation even when a submit-count observer throws', async () => {
    const root = scope()
    root.register(schema(), {})
    const callback = vi.fn(() => new Promise(() => {}))
    const pending = root.handleSubmit(callback)()
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stop = watch(root.submitCount, () => {
      throw new Error('Observer failed')
    }, { flush: 'sync' })
    root.resetState()
    stop()
    await rejection
    expect(root.submitCount.value).toBe(0)
    expect(root.isSubmitting.value).toBe(false)
  })

  it('shares submission state across a component scope and aborts on unmount', async () => {
    let root!: ValidationGroup
    let child!: ValidationGroup
    const Child = defineComponent({
      setup() {
        child = useValidation(schema(), {})
        return () => null
      },
    })
    const app = createApp(defineComponent({
      setup() {
        root = useValidation()
        return () => h(Child)
      },
    }))
    apps.push(app)
    app.mount(document.body.appendChild(document.createElement('div')))
    const callback = vi.fn(() => new Promise(() => {}))
    const pending = root.handleSubmit(callback)()
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(child.isSubmitting.value).toBe(true)
    expect(child.submitCount.value).toBe(1)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    apps.splice(apps.indexOf(app), 1)
    app.unmount()
    await rejection
    expect(child.isSubmitting.value).toBe(false)
  })
})

describe('array operations', () => {
  it('moves touched and dirty state with rows through insert, move and remove', () => {
    const root = scope()
    const rows = ref([{ email: 'first' }, { email: 'second' }])
    const field = root.register(schema<{ rows: { email: string }[] }>(), { rows })
    const array = field.array('rows', rows)
    field.touch(['rows', 1, 'email'])
    rows.value[1]!.email = 'edited'
    array.insert(0, { email: 'new' })
    expect(field.stateFor(['rows', 2, 'email'])).toMatchObject({ touched: true, dirty: true })
    expect(field.stateFor(['rows', 1, 'email'])).toMatchObject({ touched: false, dirty: false })
    expect(field.stateFor(['rows', 0, 'email'])).toMatchObject({ touched: false, dirty: true })
    array.move(2, 0)
    expect(field.stateFor(['rows', 0, 'email'])).toMatchObject({ touched: true, dirty: true })
    rows.value[0]!.email = 'second'
    expect(field.stateFor(['rows', 0, 'email']).dirty).toBe(false)
    array.remove(0)
    expect(field.stateFor(['rows', 0, 'email']).touched).toBe(false)
    expect(field.state.value.dirty).toBe(true)
    field.resetState()
    expect(field.state.value).toMatchObject({ touched: false, dirty: false })
    array.move(1, 0)
    expect(field.stateFor(['rows', 0, 'email']).dirty).toBe(false)
  })

  it('keeps nested array baselines aligned when a containing row moves', () => {
    const root = scope()
    const rows = ref([{ names: ['Ada', 'Grace'] }, { names: ['Lin'] }])
    const field = root.register(schema<{ rows: { names: string[] }[] }>(), { rows })
    const names = toRef(rows.value[0]!, 'names')
    field.touch(['rows', 0, 'names', 1])
    field.array(['rows', 0, 'names'], names).insert(0, 'New')
    field.array('rows', rows).move(0, 1)
    expect(field.stateFor(['rows', 1, 'names', 2])).toMatchObject({ dirty: false, touched: true })
    expect(field.stateFor(['rows', 1, 'names', 0])).toMatchObject({ dirty: true, touched: false })
    field.array(['rows', 1, 'names'], names).remove(0)
    expect(field.stateFor(['rows', 1, 'names', 1])).toMatchObject({ dirty: false, touched: true })
  })

  it('invalidates positional issues and cancels queued or pending work after an edit', async () => {
    vi.useFakeTimers()
    const root = scope()
    const rows = ref(['first', 'second'])
    const field = root.register(schema<{ rows: string[] }>(() => new Promise(() => {})), { rows })
    field.setIssues(['rows', 1], [{ message: 'Server error' }])
    const pending = root.validate()
    const queued = field.commit(['rows', 1], { debounce: 100 })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const queuedRejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    field.array('rows', rows).remove(0)
    await rejected
    await queuedRejected
    await vi.advanceTimersByTimeAsync(200)
    expect(root.issues.value).toEqual([])
    expect(root.isValidating.value).toBe(false)
    expect(root.state.value.validated).toBe(false)
    expect(rows.value).toEqual(['second'])
  })

  it('cancels submission during array changes without resetting its attempt count', async () => {
    const root = scope()
    const rows = ref(['first'])
    const field = root.register(schema<{ rows: string[] }>(), { rows })
    const callback = vi.fn(() => new Promise(() => {}))
    const pending = root.handleSubmit(callback)()
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    field.array('rows', rows).insert(1, 'second')
    await rejection
    expect(root.submitCount.value).toBe(1)
    expect(root.isSubmitting.value).toBe(false)
  })

  it('rejects invalid indices, readonly refs and refs unrelated to the registered path', () => {
    const root = scope()
    const rows = ref(['first'])
    const field = root.register(schema<{ rows: string[] }>(), { rows })
    const array = field.array('rows', rows)
    expect(() => array.insert(-1, 'bad')).toThrow(RangeError)
    expect(() => array.remove(1)).toThrow(RangeError)
    expect(() => array.move(0, 2)).toThrow(RangeError)
    expect(() => field.array('rows', readonly(rows) as typeof rows).remove(0)).toThrow('writable ref')
    expect(() => field.array('rows', ref(['other'])).remove(0)).toThrow('registered model property')
    array.move(0, 0)
    expect(rows.value).toEqual(['first'])
    root.dispose()
    expect(() => array.remove(0)).toThrow('disposed')
  })

  it('blocks reentrant validation during positional model updates', async () => {
    const root = scope()
    const rows = ref(['first', 'second'])
    const validator = vi.fn((value: unknown) => ({ value: value as { rows: string[] } }))
    const field = root.register(schema<{ rows: string[] }>(validator), { rows })
    let reentrant: ReturnType<typeof field.validate> | undefined
    const stop = watch(rows, () => {
      reentrant = field.validate()
    }, { flush: 'sync' })
    field.array('rows', rows).remove(0)
    stop()
    await expect(reentrant).rejects.toMatchObject({ name: 'AbortError' })
    expect(validator).not.toHaveBeenCalled()
    await nextTick()
    await expect(field.validate()).resolves.toMatchObject({ success: true })
  })
})
