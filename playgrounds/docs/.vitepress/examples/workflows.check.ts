import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContactForm from '../../guide/examples/workflows/ContactForm.vue'
import RegistrationForm from '../../guide/examples/workflows/RegistrationForm.vue'

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function controlForLabel(wrapper: VueWrapper, name: string) {
  const label = wrapper.findAll('label').find(candidate => candidate.text().trim() === name)
  expect(label, `Expected a control labelled "${name}"`).toBeDefined()
  return wrapper.get<HTMLInputElement>(`#${label!.attributes('for')}`)
}

function buttonNamed(wrapper: VueWrapper, name: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll<HTMLButtonElement>('button').find(candidate => candidate.text().trim() === name)
  expect(button, `Expected a button named "${name}"`).toBeDefined()
  return button!
}

function deferredRequest() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = () => resolvePromise()
  })
  return { promise, resolve }
}

async function enterUser(wrapper: VueWrapper) {
  await controlForLabel(wrapper, 'Email address').setValue('ADA@EXAMPLE.COM')
  await controlForLabel(wrapper, 'Display name').setValue('  Ada  ')
}

describe('application-owned save workflow', () => {
  it('keeps invalid input out of the service and associates errors with required controls', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(RegistrationForm, { props: { save }, attachTo: document.body })

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(save).not.toHaveBeenCalled()
    expect(wrapper.get('form').attributes('novalidate')).toBeDefined()
    for (const name of ['Email address', 'Display name']) {
      const control = controlForLabel(wrapper, name)
      expect(control.attributes('required')).toBeDefined()
      expect(control.attributes('aria-invalid')).toBe('true')
      expect(wrapper.get(`#${control.attributes('aria-describedby')}`).text()).not.toBe('')
      expect(control.element.value).toBe('')
    }
    expect(wrapper.get('[role="status"]').text()).toContain('Check')
    expect(buttonNamed(wrapper, 'Register').element.disabled).toBe(false)
  })

  it('sends transformed output, keeps raw input and rebases only after the request succeeds', async () => {
    const request = deferredRequest()
    const save = vi.fn(() => request.promise)
    const wrapper = mount(RegistrationForm, { props: { save }, attachTo: document.body })
    await enterUser(wrapper)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(save).toHaveBeenCalledWith({ email: 'ada@example.com', displayName: 'Ada' })
    expect(wrapper.get('form').attributes('aria-busy')).toBe('true')
    expect(buttonNamed(wrapper, 'Saving…').element.disabled).toBe(true)
    expect(wrapper.text()).toContain('Changed from baseline.')
    expect(controlForLabel(wrapper, 'Display name').element.value).toBe('  Ada  ')

    request.resolve()
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe('Saved.')
    expect(wrapper.text()).toContain('Unchanged from baseline.')
    expect(controlForLabel(wrapper, 'Email address').element.value).toBe('ADA@EXAMPLE.COM')
    expect(controlForLabel(wrapper, 'Display name').element.value).toBe('  Ada  ')
    expect(buttonNamed(wrapper, 'Register').element.disabled).toBe(false)
    expect(wrapper.get('form').attributes('aria-busy')).toBe('false')
  })

  it('guards duplicate submits before validation settles and throughout the request', async () => {
    const request = deferredRequest()
    const save = vi.fn(() => request.promise)
    const wrapper = mount(RegistrationForm, { props: { save }, attachTo: document.body })
    await enterUser(wrapper)

    // Two submit events can arrive before Vue has patched the disabled button.
    const first = wrapper.get('form').trigger('submit')
    const second = wrapper.get('form').trigger('submit')
    await Promise.all([first, second])
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(buttonNamed(wrapper, 'Saving…').element.disabled).toBe(true)

    request.resolve()
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('Saved.')
  })

  it.each(['Error', 'AbortError'])('preserves input and allows retry after a service %s', async (name) => {
    const failure = new Error('The request failed')
    failure.name = name
    const save = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined)
    const wrapper = mount(RegistrationForm, { props: { save }, attachTo: document.body })
    await enterUser(wrapper)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('please try again')
    expect(controlForLabel(wrapper, 'Email address').element.value).toBe('ADA@EXAMPLE.COM')
    expect(controlForLabel(wrapper, 'Display name').element.value).toBe('  Ada  ')
    expect(wrapper.text()).toContain('Changed from baseline.')
    expect(buttonNamed(wrapper, 'Register').element.disabled).toBe(false)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(save).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Saved.')
    expect(wrapper.text()).toContain('Unchanged from baseline.')
  })

  it('keeps a request snapshot stable and leaves edits made while saving outside the new baseline', async () => {
    const request = deferredRequest()
    const save = vi.fn().mockImplementationOnce(() => request.promise).mockResolvedValueOnce(undefined)
    const wrapper = mount(RegistrationForm, { props: { save }, attachTo: document.body })
    await enterUser(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const name = controlForLabel(wrapper, 'Display name')
    expect(name.element.disabled).toBe(false)
    await name.setValue('Grace')
    expect(save.mock.calls[0]?.[0]).toEqual({ email: 'ada@example.com', displayName: 'Ada' })

    request.resolve()
    await flushPromises()

    expect(name.element.value).toBe('Grace')
    expect(wrapper.get('[role="status"]').text()).toContain('newer edits have been kept')
    expect(wrapper.text()).toContain('Changed from baseline.')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(save).toHaveBeenLastCalledWith({ email: 'ada@example.com', displayName: 'Grace' })
    expect(wrapper.get('[role="status"]').text()).toBe('Saved.')
    expect(wrapper.text()).toContain('Unchanged from baseline.')
  })
})

describe('parent-owned split form', () => {
  it('collects both child registrations and saves the parent-owned fragments as one snapshot', async () => {
    const request = deferredRequest()
    const save = vi.fn(() => request.promise)
    const wrapper = mount(ContactForm, { props: { save }, attachTo: document.body })
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(save).not.toHaveBeenCalled()
    expect(controlForLabel(wrapper, 'Email address').attributes('aria-invalid')).toBe('true')
    expect(controlForLabel(wrapper, 'Postcode').attributes('aria-invalid')).toBe('true')

    await controlForLabel(wrapper, 'Email address').setValue('ada@example.com')
    await controlForLabel(wrapper, 'Postcode').setValue('SW1A 1AA')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(save).toHaveBeenCalledWith({ details: { email: 'ada@example.com' }, address: { postcode: 'SW1A 1AA' } })
    expect(buttonNamed(wrapper, 'Saving…').element.disabled).toBe(true)
    await controlForLabel(wrapper, 'Postcode').setValue('EH1 1YZ')
    expect(save).toHaveBeenCalledWith({ details: { email: 'ada@example.com' }, address: { postcode: 'SW1A 1AA' } })

    request.resolve()
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('newer edits have been kept')
    expect(controlForLabel(wrapper, 'Postcode').element.value).toBe('EH1 1YZ')
    expect(buttonNamed(wrapper, 'Save contact').element.disabled).toBe(false)
  })
})
