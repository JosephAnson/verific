import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import BasicValidationExample from './BasicValidationExample.vue'
import I18nextValidationExample from './I18nextValidationExample.vue'
import LocalisedValidationExample from './LocalisedValidationExample.vue'
import NestedValidationExample from './NestedValidationExample.vue'
import ParaglideValidationExample from './ParaglideValidationExample.vue'

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function controlForLabel(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
  const matchingLabel = wrapper.findAll('label').find(candidate => candidate.text().trim() === label)
  expect(matchingLabel, `Expected a control labelled "${label}"`).toBeDefined()

  const controlId = matchingLabel?.attributes('for')
  if (controlId) {
    return wrapper.get(`#${controlId}`)
  }

  const nestedControl = matchingLabel?.find('input, select, textarea')
  expect(nestedControl?.exists(), `Expected label "${label}" to contain a control`).toBe(true)
  return nestedControl as DOMWrapper<Element>
}

function buttonNamed(wrapper: VueWrapper, name: string): DOMWrapper<Element> {
  const button = wrapper.findAll('button').find(candidate => candidate.text().trim() === name)
  expect(button, `Expected a button named "${name}"`).toBeDefined()
  return button as DOMWrapper<Element>
}

describe('documentation examples', () => {
  it('publishes only blurred account fields while preserving earlier field errors', async () => {
    const wrapper = mount(BasicValidationExample, { attachTo: document.body })
    const email = controlForLabel(wrapper, 'Email address')
    const password = controlForLabel(wrapper, 'Password')

    await email.trigger('blur')
    await flushPromises()

    expect(email.attributes('aria-invalid')).toBe('true')
    expect(password.attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#basic-email-errors').text()).toBe('Enter your email address')
    expect(wrapper.get('#basic-password-errors').text()).toBe('')

    await password.trigger('blur')
    await flushPromises()

    expect(email.attributes('aria-invalid')).toBe('true')
    expect(password.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#basic-email-errors').text()).toBe('Enter your email address')
    expect(wrapper.get('#basic-password-errors').text()).toBe('Use at least 8 characters')
  })

  it('keeps submit feedback in sync while fields are corrected on blur', async () => {
    const wrapper = mount(BasicValidationExample, { attachTo: document.body })
    const email = controlForLabel(wrapper, 'Email address')
    const password = controlForLabel(wrapper, 'Password')

    await buttonNamed(wrapper, 'Validate account').trigger('click')
    await flushPromises()

    expect(email.attributes('aria-invalid')).toBe('true')
    expect(password.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#basic-email-errors').text()).toBe('Enter your email address')
    expect(wrapper.get('#basic-password-errors').text()).toBe('Use at least 8 characters')
    expect(wrapper.get('[role="status"]').text()).toBe('Please resolve 2 validation errors.')
    expect(document.activeElement).toBe(email.element)

    await email.setValue('reader@example.com')
    await email.trigger('blur')
    await flushPromises()

    expect(email.attributes('aria-invalid')).toBe('false')
    expect(password.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#basic-email-errors').text()).toBe('')
    expect(wrapper.get('#basic-password-errors').text()).toBe('Use at least 8 characters')
    expect(wrapper.get('[role="status"]').text()).toBe('Please resolve 1 validation error.')

    await password.setValue('correct-horse')
    await password.trigger('blur')
    await flushPromises()

    expect(email.attributes('aria-invalid')).toBe('false')
    expect(password.attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#basic-email-errors').text()).toBe('')
    expect(wrapper.get('#basic-password-errors').text()).toBe('')
    expect(wrapper.get('[role="status"]').text()).toBe('No field errors are shown. Submit the form to confirm.')

    await buttonNamed(wrapper, 'Validate account').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe('The account details are valid.')
  })

  it('aggregates mounted descendants and removes a disposed child issue immediately', async () => {
    const wrapper = mount(NestedValidationExample, { attachTo: document.body })

    await buttonNamed(wrapper, 'Validate parent form').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe('2 committed errors are in the parent scope.')
    expect(wrapper.get('#nested-name-errors').text()).toBe('Enter a name')
    expect(wrapper.get('#nested-phone-errors').text()).toBe('Enter a phone number')
    expect(document.activeElement).toBe(controlForLabel(wrapper, 'Name').element)

    await controlForLabel(wrapper, 'Include the optional phone component').setValue(false)
    await nextTick()

    expect(wrapper.find('#nested-phone').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('1 committed error is in the parent scope.')

    await controlForLabel(wrapper, 'Name').setValue('Ada Lovelace')
    await buttonNamed(wrapper, 'Validate parent form').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe('No committed errors remain in the parent scope.')
  })

  it('translates a committed issue without running the schema again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(LocalisedValidationExample, { attachTo: document.body })
    const missingDiagnostic = wrapper.get('#localised-missing-diagnostic')
    const missingToggle = buttonNamed(wrapper, 'Demonstrate missing-key fallback')

    expect(missingDiagnostic.isVisible()).toBe(false)
    expect(missingDiagnostic.text()).toBe('')
    expect(missingToggle.attributes('aria-controls')).toBe('localised-missing-diagnostic')
    expect(missingToggle.attributes('aria-pressed')).toBe('false')

    await buttonNamed(wrapper, 'Validate email').trigger('click')
    await flushPromises()

    expect(wrapper.get('#localised-email-errors').text()).toBe('Enter a valid email address')
    expect(wrapper.text()).toContain('Validation runs: 1')

    await controlForLabel(wrapper, 'Message language').setValue('es')
    await nextTick()

    expect(wrapper.get('#localised-email-errors').text()).toBe('Introduce una dirección de correo electrónico válida')
    expect(wrapper.get('#localised-email-errors').attributes('lang')).toBe('es')
    expect(wrapper.text()).toContain('Validation runs: 1')

    await missingToggle.trigger('click')
    await nextTick()

    expect(wrapper.get('#localised-email-errors').text()).toBe('Schema fallback: enter a valid email address')
    expect(missingDiagnostic.isVisible()).toBe(true)
    expect(missingToggle.attributes('aria-pressed')).toBe('true')
    expect(missingDiagnostic.text()).toBe(
      'Missing catalogue message. Add "demo.missing.1" for locale "es".',
    )
    expect(wrapper.text()).toContain('Validation runs: 1')

    await missingToggle.trigger('click')
    await nextTick()

    expect(wrapper.get('#localised-email-errors').text()).toBe('Introduce una dirección de correo electrónico válida')
    expect(missingDiagnostic.isVisible()).toBe(false)
    expect(missingDiagnostic.text()).toBe('')
    expect(missingToggle.attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain('Validation runs: 1')
    expect(warn).not.toHaveBeenCalled()
  })

  it('updates an i18next message without running the schema again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(I18nextValidationExample, { attachTo: document.body })
    const missingDiagnostic = wrapper.get('#i18next-missing-diagnostic')
    const missingToggle = buttonNamed(wrapper, 'Demonstrate missing-key fallback')

    expect(missingDiagnostic.isVisible()).toBe(false)
    expect(missingDiagnostic.text()).toBe('')
    expect(missingToggle.attributes('aria-controls')).toBe('i18next-missing-diagnostic')
    expect(missingToggle.attributes('aria-pressed')).toBe('false')

    await buttonNamed(wrapper, 'Validate with i18next').trigger('click')
    await flushPromises()

    expect(wrapper.get('#i18next-email-errors').text()).toBe('Enter a valid email address')
    expect(wrapper.text()).toContain('Validation runs: 1')

    await controlForLabel(wrapper, 'Message language').setValue('es')
    await flushPromises()

    expect(wrapper.get('#i18next-email-errors').text()).toBe('Introduce una dirección de correo válida')
    expect(wrapper.get('#i18next-email-errors').attributes('lang')).toBe('es')
    expect(wrapper.text()).toContain('Validation runs: 1')

    await missingToggle.trigger('click')
    await nextTick()

    expect(wrapper.get('#i18next-email-errors').text()).toBe('Schema fallback: enter a valid email address')
    expect(missingDiagnostic.isVisible()).toBe(true)
    expect(missingToggle.attributes('aria-pressed')).toBe('true')
    expect(missingDiagnostic.text()).toBe(
      'Missing catalogue message. Add "demo.missing.1" for locale "es".',
    )
    expect(wrapper.text()).toContain('Validation runs: 1')

    await missingToggle.trigger('click')
    await nextTick()

    expect(wrapper.get('#i18next-email-errors').text()).toBe('Introduce una dirección de correo válida')
    expect(missingDiagnostic.isVisible()).toBe(false)
    expect(missingDiagnostic.text()).toBe('')
    expect(missingToggle.attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain('Validation runs: 1')
    expect(warn).not.toHaveBeenCalled()
  })

  it('updates a Paraglide message without running the schema again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(ParaglideValidationExample, { attachTo: document.body })
    const missingDiagnostic = wrapper.get('#paraglide-missing-diagnostic')
    const missingToggle = buttonNamed(wrapper, 'Demonstrate missing-key fallback')

    expect(missingDiagnostic.isVisible()).toBe(false)
    expect(missingDiagnostic.text()).toBe('')
    expect(missingToggle.attributes('aria-controls')).toBe('paraglide-missing-diagnostic')
    expect(missingToggle.attributes('aria-pressed')).toBe('false')

    await buttonNamed(wrapper, 'Validate with Paraglide').trigger('click')
    await flushPromises()

    expect(wrapper.get('#paraglide-email-errors').text()).toBe('Enter a valid email address')
    expect(wrapper.text()).toContain('Validation runs: 1')

    await controlForLabel(wrapper, 'Message language').setValue('es')
    await nextTick()

    expect(wrapper.get('#paraglide-email-errors').text()).toBe('Introduce una dirección de correo válida')
    expect(wrapper.get('#paraglide-email-errors').attributes('lang')).toBe('es')
    expect(wrapper.text()).toContain('Validation runs: 1')

    await missingToggle.trigger('click')
    await nextTick()

    expect(wrapper.get('#paraglide-email-errors').text()).toBe('Schema fallback: enter a valid email address')
    expect(missingDiagnostic.isVisible()).toBe(true)
    expect(missingToggle.attributes('aria-pressed')).toBe('true')
    expect(missingDiagnostic.text()).toBe(
      'Missing catalogue message. Add "demo.missing.1" for locale "es".',
    )
    expect(wrapper.text()).toContain('Validation runs: 1')

    await missingToggle.trigger('click')
    await nextTick()

    expect(wrapper.get('#paraglide-email-errors').text()).toBe('Introduce una dirección de correo válida')
    expect(missingDiagnostic.isVisible()).toBe(false)
    expect(missingDiagnostic.text()).toBe('')
    expect(missingToggle.attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain('Validation runs: 1')
    expect(warn).not.toHaveBeenCalled()
  })
})
