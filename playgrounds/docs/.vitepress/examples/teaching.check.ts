import type { VueWrapper } from '@vue/test-utils'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import FirstForm from '../../guide/examples/first-form/FirstForm.vue'
import { advancedSchema } from './advanced-schema'

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.replaceChildren()
})

function emailField(wrapper: VueWrapper) {
  const label = wrapper.findAll('label').find(candidate => candidate.text() === 'Email address')
  expect(label, 'The first form should name its email control').toBeDefined()
  return wrapper.get(`#${label!.attributes('for')}`)
}

describe('complete first-form source', () => {
  it('shows the associated error for an invalid submission and preserves the input', async () => {
    const wrapper = mount(FirstForm, { attachTo: document.body })
    const email = emailField(wrapper)
    await email.setValue('not-an-email')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(email.attributes('required')).toBeDefined()
    expect(wrapper.get('form').attributes('novalidate')).toBeDefined()
    expect(email.attributes('aria-invalid')).toBe('true')
    expect((email.element as HTMLInputElement).value).toBe('not-an-email')
    const errors = wrapper.get(`#${email.attributes('aria-describedby')}`)
    expect(errors.text()).toBe('Enter a valid email address')
    expect(errors.attributes('aria-live')).toBe('polite')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('validates directly on blur but reports success only after a current full validation', async () => {
    const wrapper = mount(FirstForm, { attachTo: document.body })
    const email = emailField(wrapper)
    const errors = wrapper.get(`#${email.attributes('aria-describedby')}`)
    expect(errors.text()).toBe('')

    await email.trigger('blur')
    await flushPromises()
    expect(errors.text()).toBe('Enter a valid email address')

    await email.setValue('ada@example.com')
    await email.trigger('blur')
    await flushPromises()
    expect(errors.text()).toBe('')
    expect(email.attributes('aria-invalid')).toBe('false')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    const submit = wrapper.findAll('button').find(button => button.text() === 'Validate email')
    expect(submit).toBeDefined()
    await submit!.trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('The email address is valid.')

    await email.setValue('grace@example.com')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})

const commonInput = {
  profile: { displayName: 'Ada' },
  contacts: [{ email: 'ada@example.com' }],
  password: 'correct-horse',
  confirmation: 'correct-horse',
}

describe('schema excerpts used by the advanced demo', () => {
  it('retains nested and indexed issue paths', () => {
    expect(advancedSchema.safeParse({
      ...commonInput,
      kind: 'person',
      dateOfBirth: '1815-12-10',
      profile: { displayName: '' },
      contacts: [{ email: 'invalid' }],
    })).toMatchObject({
      success: false,
      error: {
        issues: [
          { path: ['profile', 'displayName'] },
          { path: ['contacts', 0, 'email'] },
        ],
      },
    })
  })

  it('assigns the password mismatch to confirmation with its localisation identifier', () => {
    expect(advancedSchema.safeParse({
      ...commonInput,
      kind: 'person',
      dateOfBirth: '1815-12-10',
      confirmation: 'different-password',
    })).toMatchObject({
      success: false,
      error: {
        issues: [{
          code: 'custom',
          path: ['confirmation'],
          message: 'Passwords must match',
          params: { rule: 'passwordMismatch' },
        }],
      },
    })
  })

  it.each([
    { kind: 'person', dateOfBirth: '1815-12-10' },
    { kind: 'company', companyNumber: '12345678' },
  ])('accepts a valid $kind without the inactive branch field', (branch) => {
    expect(advancedSchema.safeParse({ ...commonInput, ...branch }).success).toBe(true)
  })

  it.each([
    { kind: 'person', dateOfBirth: '', path: 'dateOfBirth' },
    { kind: 'company', companyNumber: '', path: 'companyNumber' },
  ])('requires only the active $kind branch field', ({ path, ...branch }) => {
    expect(advancedSchema.safeParse({ ...commonInput, ...branch })).toMatchObject({
      success: false,
      error: { issues: [{ path: [path] }] },
    })
  })
})
