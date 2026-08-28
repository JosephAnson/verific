import type { MessageContext, ValidationIssue } from '@verific/core'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { paraglideMessages } from '../src/main'
import { errors_min_items } from './fixtures/generated/messages/errors_min_items.js'
import { errors_required } from './fixtures/generated/messages/errors_required.js'

function issue(
  path: readonly PropertyKey[] = ['items'],
  identifier = 'required',
  values: MessageContext['values'] = {},
  count?: number,
): ValidationIssue {
  const raw = { message: 'Schema message', path }
  return {
    raw,
    vendor: 'test',
    message: raw.message,
    localPath: path,
    path,
    semantic: { identifier, values, count },
  }
}

function resolve(value: ValidationIssue, adapter: ReturnType<typeof paraglideMessages>): string {
  const context: MessageContext = {
    issue: value,
    path: value.path,
    identifier: value.semantic?.identifier ?? 'invalid',
    values: value.semantic?.values ?? {},
    count: value.semantic?.count,
    messagePrefix: 'forms.order',
    defaultMessage: value.message,
  }
  const result = adapter.resolve(context)

  if (result.resolved) {
    return result.message
  }

  const attempts = result.attempts ?? (result.attempt ? [result.attempt] : [])
  adapter.onMissing?.({
    messagePrefix: context.messagePrefix,
    path: value.path,
    identifier: context.identifier,
    attempts,
  })
  return value.message
}

describe('paraglideMessages', () => {
  it('accepts real generated functions with different concrete input signatures', () => {
    const locale = () => 'en' as const
    const adapter = paraglideMessages({
      'errors.required': errors_required,
      'errors.minItems': errors_min_items,
    }, { locale, fallbackPrefix: 'errors' })

    expectTypeOf(adapter).toMatchTypeOf<ReturnType<typeof paraglideMessages>>()
    expect(resolve(issue(), adapter)).toBe('Required')
    expect(resolve(issue(['items'], 'minItems', { minimum: 3 }, 1), adapter)).toBe('Need 3, got 1')
  })

  it('requires an explicit locale getter', () => {
    // @ts-expect-error The adapter must not fall back to Paraglide's process-global locale.
    paraglideMessages({ 'errors.required': errors_required }, { fallbackPrefix: 'errors' })
  })

  it('restricts the locale getter to locales accepted by the mapped functions', () => {
    paraglideMessages({ 'errors.required': errors_required }, {
      // @ts-expect-error Generated functions accept only en or nl.
      locale: () => 'fr' as const,
      fallbackPrefix: 'errors',
    })
  })

  it('uses only explicitly mapped exports and falls back from a field key to a global key', () => {
    const unrelated = vi.fn(() => 'Must not be discovered')
    const required = vi.fn((_inputs?: Record<never, never>, options?: { locale?: 'en' | 'nl' }) => (
      options?.locale === 'nl' ? 'Verplicht' : 'Required'
    ))
    const adapter = paraglideMessages({ 'errors.required': required }, {
      locale: () => 'nl' as const,
      fallbackPrefix: 'errors',
      missing: 'throw',
    })

    expect(resolve(issue(), adapter)).toBe('Verplicht')
    expect(required).toHaveBeenCalledWith({}, { locale: 'nl' })
    expect(unrelated).not.toHaveBeenCalled()
  })

  it('passes semantic interpolation values and adds count only when defined', () => {
    const withCount = vi.fn((
      inputs: { minimum: string | number | boolean | null, count: number },
      options?: { locale?: 'en' },
    ) => `${inputs.minimum}:${inputs.count}:${options?.locale}`)
    const withoutCount = vi.fn((
      inputs: { minimum: string | number | boolean | null },
      options?: { locale?: 'en' },
    ) => `${inputs.minimum}:${'count' in inputs}:${options?.locale}`)
    const adapter = paraglideMessages({
      'errors.withCount': withCount,
      'errors.withoutCount': withoutCount,
    }, { locale: () => 'en' as const, fallbackPrefix: 'errors' })

    expect(resolve(issue([], 'withCount', { minimum: 2, count: 99 }, 0), adapter)).toBe('2:0:en')
    expect(resolve(issue([], 'withoutCount', { minimum: 2, count: 99 }), adapter)).toBe('2:false:en')
  })

  it('reacts to a caller-owned locale source without rerunning validation', async () => {
    const locale = ref<'en' | 'nl'>('en')
    const adapter = paraglideMessages({ 'errors.required': errors_required }, {
      locale: () => locale.value,
      fallbackPrefix: 'errors',
    })
    const message = computed(() => resolve(issue(), adapter))

    expect(message.value).toBe('Required')

    locale.value = 'nl'
    await nextTick()

    expect(message.value).toBe('Verplicht')
  })

  it('keeps locale and missing-message state isolated between SSR requests', () => {
    const firstMissing = vi.fn()
    const secondMissing = vi.fn()
    const first = paraglideMessages({ 'errors.required': errors_required }, {
      locale: () => 'en' as const,
      fallbackPrefix: 'errors',
      missing: firstMissing,
    })
    const second = paraglideMessages({ 'errors.required': errors_required }, {
      locale: () => 'nl' as const,
      fallbackPrefix: 'errors',
      missing: secondMissing,
    })

    expect(resolve(issue(), first)).toBe('Required')
    expect(resolve(issue(), second)).toBe('Verplicht')

    expect(resolve(issue([], 'unknown'), first)).toBe('Schema message')
    expect(resolve(issue([], 'unknown'), first)).toBe('Schema message')
    expect(resolve(issue([], 'unknown'), second)).toBe('Schema message')

    expect(firstMissing).toHaveBeenCalledOnce()
    expect(secondMissing).toHaveBeenCalledOnce()
    expect(firstMissing).toHaveBeenCalledWith(expect.objectContaining({
      attempts: expect.arrayContaining([{ locale: 'en', keys: ['errors.unknown'] }]),
    }))
    expect(secondMissing).toHaveBeenCalledWith(expect.objectContaining({
      attempts: expect.arrayContaining([{ locale: 'nl', keys: ['errors.unknown'] }]),
    }))
  })
})
