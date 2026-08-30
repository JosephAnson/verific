import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import AdvancedSchemasExample from './AdvancedSchemasExample.vue'
import FormStateExample from './FormStateExample.vue'

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

function controlForLabel(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
  const matchingLabel = wrapper.findAll('label').find(candidate => candidate.text().trim() === label)
  expect(matchingLabel, `Expected a control labelled "${label}"`).toBeDefined()
  const control = wrapper.find(`#${matchingLabel!.attributes('for')}`)
  expect(control.exists(), `Expected a control labelled "${label}"`).toBe(true)
  return control
}

function buttonNamed(wrapper: VueWrapper, name: string): DOMWrapper<Element> {
  const button = wrapper.findAll('button').find(candidate => candidate.text().trim() === name)
  expect(button, `Expected a button named "${name}"`).toBeDefined()
  return button as DOMWrapper<Element>
}

function expectEveryVisibleControlToBeRequired(wrapper: VueWrapper) {
  const controls = wrapper.findAll('input, select, textarea')
  expect(controls.length).toBeGreaterThan(0)
  for (const control of controls)
    expect(control.attributes('required'), `${control.element.tagName} should be required`).toBeDefined()
}

async function settleAsyncValidation() {
  await vi.runAllTimersAsync()
  await flushPromises()
}

describe('form state example', () => {
  it('explains that every field is required and keeps native validation bypassed', () => {
    const wrapper = mount(FormStateExample, { attachTo: document.body })

    expect(wrapper.get('form').attributes('novalidate')).toBeDefined()
    expect(wrapper.get('#state-required-instructions').text()).toBe('All fields are required.')
    expectEveryVisibleControlToBeRequired(wrapper)
  })

  it('derives dirty state, reverts to clean and records touch explicitly', async () => {
    const wrapper = mount(FormStateExample, { attachTo: document.body })
    const name = controlForLabel(wrapper, 'Profile name')

    expect(wrapper.get('#state-form-dirty').text()).toBe('Clean')
    expect(wrapper.get('#state-name-touched').text()).toBe('Untouched')

    await name.setValue('Grace')
    expect(wrapper.get('#state-form-dirty').text()).toBe('Changed')

    await name.setValue('Ada')
    expect(wrapper.get('#state-form-dirty').text()).toBe('Clean')

    await name.setValue('')
    await name.trigger('blur')
    await settleAsyncValidation()

    expect(wrapper.get('#state-name-errors').text()).toBe('Enter a name')
    expect(wrapper.get('#state-name-touched').text()).toBe('Touched')
    expect(wrapper.get('#state-name-validated').text()).toBe('Current')
    expect(wrapper.get('[role="status"]').text()).toBe('The complete form has not been validated.')
  })

  it('marks targeted validation stale on sibling edits and fresh on reversion', async () => {
    const wrapper = mount(FormStateExample, { attachTo: document.body })
    const name = controlForLabel(wrapper, 'Profile name')
    const email = controlForLabel(wrapper, 'Email address')

    await name.trigger('blur')
    await settleAsyncValidation()
    expect(wrapper.get('#state-name-validated').text()).toBe('Current')

    await email.setValue('changed@example.com')
    expect(wrapper.get('#state-name-validated').text()).toBe('Out of date')

    await email.setValue('ada@example.com')
    expect(wrapper.get('#state-name-validated').text()).toBe('Current')
  })

  it('rebases without changing values and clears interaction and validation history', async () => {
    const wrapper = mount(FormStateExample, { attachTo: document.body })
    const name = controlForLabel(wrapper, 'Profile name')
    const email = controlForLabel(wrapper, 'Email address')

    await name.setValue('Loaded name')
    await email.setValue('loaded@example.com')
    await name.trigger('blur')
    await settleAsyncValidation()
    expect(wrapper.get('#state-form-dirty').text()).toBe('Changed')

    await buttonNamed(wrapper, 'Use current values as baseline').trigger('click')
    await nextTick()

    expect((name.element as HTMLInputElement).value).toBe('Loaded name')
    expect((email.element as HTMLInputElement).value).toBe('loaded@example.com')
    expect(wrapper.get('#state-form-dirty').text()).toBe('Clean')
    expect(wrapper.get('#state-name-touched').text()).toBe('Untouched')
    expect(wrapper.get('#state-name-validated').text()).toBe('Not checked')
    expect(wrapper.get('#state-name-errors').text()).toBe('')
  })

  it('focuses the first invalid nested control after full validation', async () => {
    const wrapper = mount(FormStateExample, { attachTo: document.body })
    const name = controlForLabel(wrapper, 'Profile name')

    await name.setValue('')
    await buttonNamed(wrapper, 'Validate and transform').trigger('click')
    await settleAsyncValidation()

    expect(wrapper.get('#state-name-errors').text()).toBe('Enter a name')
    expect(document.activeElement).toBe(name.element)
  })

  it('shows pending state, keeps newest targeted authority and gates typed output on freshness', async () => {
    const wrapper = mount(FormStateExample, { attachTo: document.body })
    const name = controlForLabel(wrapper, 'Profile name')
    const email = controlForLabel(wrapper, 'Email address')

    await name.setValue('  Ada Lovelace  ')
    await email.setValue('ADA@EXAMPLE.COM')
    await buttonNamed(wrapper, 'Validate and transform').trigger('click')
    await settleAsyncValidation()

    expect(wrapper.get('#state-output').text()).toContain('"name": "Ada Lovelace"')
    expect(wrapper.get('#state-output').text()).toContain('"email": "ada@example.com"')
    expect(wrapper.get('#state-output-title').text()).toBe('Current validated output')
    expect((name.element as HTMLInputElement).value).toBe('  Ada Lovelace  ')

    await email.setValue('slow-taken@example.com')
    expect(wrapper.find('#state-output').exists()).toBe(false)
    expect(wrapper.get('#state-name-validated').text()).toBe('Out of date')

    await buttonNamed(wrapper, 'Check email').trigger('click')
    await nextTick()
    expect(email.attributes('aria-busy')).toBe('true')
    expect(wrapper.get('#state-email-pending').text()).toBe('Checking')

    await email.setValue('quick@example.com')
    await buttonNamed(wrapper, 'Check email').trigger('click')
    await settleAsyncValidation()

    expect(email.attributes('aria-busy')).toBe('false')
    expect(wrapper.get('#state-email-pending').text()).toBe('Idle')
    expect(wrapper.get('#state-email-stale').text()).toBe('Current')
    expect(wrapper.get('#state-email-errors').text()).toBe('')
    expect(wrapper.find('#state-output').exists()).toBe(false)

    await buttonNamed(wrapper, 'Validate and transform').trigger('click')
    await settleAsyncValidation()

    expect(wrapper.get('#state-output').text()).toContain('"email": "quick@example.com"')
  })

  it('rebases during pending validation without an unhandled AbortError', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mount(FormStateExample, { attachTo: document.body })
    const email = controlForLabel(wrapper, 'Email address')

    await email.setValue('slow-taken@example.com')
    await buttonNamed(wrapper, 'Check email').trigger('click')
    await nextTick()
    expect(wrapper.get('#state-email-pending').text()).toBe('Checking')

    await buttonNamed(wrapper, 'Use current values as baseline').trigger('click')
    await nextTick()

    expect((email.element as HTMLInputElement).value).toBe('slow-taken@example.com')
    expect(wrapper.get('#state-email-pending').text()).toBe('Idle')
    expect(wrapper.get('#state-email-stale').text()).toBe('Not checked')
    expect(wrapper.get('#state-form-dirty').text()).toBe('Clean')

    await settleAsyncValidation()
    expect(wrapper.get('#state-email-errors').text()).toBe('')
    expect(consoleError).not.toHaveBeenCalled()
  })
})

describe('advanced schema example', () => {
  it('marks every visible control required across active branches', async () => {
    const wrapper = mount(AdvancedSchemasExample, { attachTo: document.body })

    expect(wrapper.get('form').attributes('novalidate')).toBeDefined()
    expect(wrapper.get('#advanced-required-instructions').text()).toBe('All visible fields are required.')
    expect(controlForLabel(wrapper, 'Date of birth').attributes('required')).toBeDefined()
    expectEveryVisibleControlToBeRequired(wrapper)

    await controlForLabel(wrapper, 'Account kind').setValue('company')
    await flushPromises()

    expect(wrapper.find('#advanced-date-of-birth').exists()).toBe(false)
    expect(controlForLabel(wrapper, 'Company number').attributes('required')).toBeDefined()
    expectEveryVisibleControlToBeRequired(wrapper)
  })

  it('publishes nested and cross-field paths and focuses the first invalid control', async () => {
    const wrapper = mount(AdvancedSchemasExample, { attachTo: document.body })
    const displayName = controlForLabel(wrapper, 'Display name')

    await displayName.setValue('')
    await controlForLabel(wrapper, 'Confirm password').setValue('different-password')
    await buttonNamed(wrapper, 'Validate advanced form').trigger('click')
    await flushPromises()

    expect(wrapper.get('#advanced-display-name-errors').text()).toBe('Enter a display name')
    expect(wrapper.get('#advanced-confirmation-errors').text()).toBe('Passwords must match')
    expect(document.activeElement).toBe(displayName.element)
  })

  it('fully validates only the active discriminated-union branch', async () => {
    const wrapper = mount(AdvancedSchemasExample, { attachTo: document.body })
    const kind = controlForLabel(wrapper, 'Account kind')
    const dateOfBirth = controlForLabel(wrapper, 'Date of birth')

    expect(wrapper.get('#advanced-kind-state').text()).toBe('Untouched')
    await dateOfBirth.setValue('')
    await buttonNamed(wrapper, 'Validate advanced form').trigger('click')
    await flushPromises()

    expect(wrapper.get('#advanced-date-of-birth-errors').text()).toBe('Enter a date of birth')

    await kind.setValue('company')
    await flushPromises()

    expect(wrapper.find('#advanced-date-of-birth').exists()).toBe(false)
    expect(controlForLabel(wrapper, 'Company number').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#advanced-company-number-errors').text()).toBe('Enter a company number')
    expect(wrapper.text()).not.toContain('Enter a date of birth')
    expect(wrapper.get('#advanced-kind-state').text()).toBe('Touched')
    expect(wrapper.get('[role="status"]').text()).toBe('Validated the active company branch.')
  })

  it('focuses the password when it is the only invalid field', async () => {
    const wrapper = mount(AdvancedSchemasExample, { attachTo: document.body })
    const password = controlForLabel(wrapper, 'Password')

    await password.setValue('short')
    await controlForLabel(wrapper, 'Confirm password').setValue('short')
    await buttonNamed(wrapper, 'Validate advanced form').trigger('click')
    await flushPromises()

    expect(wrapper.get('#advanced-password-errors').text()).toBe('Use at least 8 characters')
    expect(document.activeElement).toBe(password.element)
  })

  it('focuses the add-contact control for a collection-root issue', async () => {
    const wrapper = mount(AdvancedSchemasExample, { attachTo: document.body })
    const addContact = buttonNamed(wrapper, 'Add blank contact')

    await buttonNamed(wrapper, 'Remove contact 1').trigger('click')
    await flushPromises()
    expect(wrapper.get('#advanced-contacts-errors').text()).toBe('Keep at least one contact')

    await buttonNamed(wrapper, 'Validate advanced form').trigger('click')
    await flushPromises()

    expect(document.activeElement).toBe(addContact.element)
  })

  it('reruns full validation after positional array structure changes', async () => {
    const wrapper = mount(AdvancedSchemasExample, { attachTo: document.body })

    await buttonNamed(wrapper, 'Add blank contact').trigger('click')
    await flushPromises()

    expect(wrapper.get('#advanced-contact-1-errors').text()).toBe('Enter a valid contact email')
    expect(wrapper.get('#advanced-contacts-errors').text()).toBe('')
    expect(wrapper.text()).toContain('Full validations requested: 1')

    await buttonNamed(wrapper, 'Remove contact 1').trigger('click')
    await flushPromises()

    expect(wrapper.get('#advanced-contact-0-errors').text()).toBe('Enter a valid contact email')
    expect(wrapper.get('#advanced-contacts-errors').text()).toBe('')
    expect(wrapper.text()).toContain('Full validations requested: 2')
    expect(wrapper.get('[role="status"]').text()).toBe('Removed a positional row and ran full validation.')
  })

  it('restores focus beside a removed row and to add when the collection becomes empty', async () => {
    const wrapper = mount(AdvancedSchemasExample, { attachTo: document.body })
    const addContact = buttonNamed(wrapper, 'Add blank contact')

    await addContact.trigger('click')
    await addContact.trigger('click')
    await flushPromises()

    const removeSecond = buttonNamed(wrapper, 'Remove contact 2')
    const removeSecondElement = removeSecond.element as HTMLElement
    removeSecondElement.focus()
    await removeSecond.trigger('click')
    await nextTick()

    const remainingSecond = buttonNamed(wrapper, 'Remove contact 2')
    expect(remainingSecond.attributes('id')).toBe('advanced-remove-contact-1')
    expect(document.activeElement).toBe(remainingSecond.element)
    await flushPromises()

    await remainingSecond.trigger('click')
    await nextTick()

    const remainingRemove = buttonNamed(wrapper, 'Remove contact 1')
    expect(remainingRemove.attributes('id')).toBe('advanced-remove-contact-0')
    expect(document.activeElement).toBe(remainingRemove.element)
    await flushPromises()

    await remainingRemove.trigger('click')
    await nextTick()

    expect(wrapper.find('#advanced-remove-contact-0').exists()).toBe(false)
    expect(document.activeElement).toBe(addContact.element)
    await flushPromises()
  })

  it('touches and targets a numeric tuple path when an array row blurs', async () => {
    const wrapper = mount(AdvancedSchemasExample, { attachTo: document.body })
    const contact = controlForLabel(wrapper, 'Contact 1 email')

    expect(wrapper.get('#advanced-contact-0-state').text()).toBe('Untouched')
    expect(contact.attributes('aria-describedby')).toBe('advanced-contact-0-errors advanced-contact-0-state')
    await contact.setValue('invalid')
    await contact.trigger('blur')
    await flushPromises()

    expect(wrapper.get('#advanced-contact-0-errors').text()).toBe('Enter a valid contact email')
    expect(wrapper.get('#advanced-contacts-errors').text()).toBe('')
    expect(wrapper.get('#advanced-contact-0-state').text()).toBe('Touched')
  })
})
