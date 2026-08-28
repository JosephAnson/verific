import type { DiagnosticMessageAdapter, ValidationIssue } from '../src/messages'
import { describe, expect, it, vi } from 'vitest'
import { resolveIssueMessage } from '../src/messages'

function issue(): ValidationIssue {
  const raw = { message: 'Schema message', path: ['email'] }
  return {
    raw,
    vendor: 'test',
    message: raw.message,
    localPath: ['email'],
    path: ['email'],
  }
}

describe('resolveIssueMessage', () => {
  it('assigns missing-message ownership only to an adapter that attempted lookup', () => {
    const emptyMissing = vi.fn()
    const lowerMissing = vi.fn()
    const emptyAdapter: DiagnosticMessageAdapter = {
      resolve: () => ({ resolved: false }),
      onMissing: emptyMissing,
    }
    const lowerAdapter: DiagnosticMessageAdapter = {
      resolve: () => ({
        resolved: false,
        attempt: { locale: 'en', keys: ['errors.invalid'] },
      }),
      onMissing: lowerMissing,
    }

    expect(resolveIssueMessage(issue(), {
      resolvers: [emptyAdapter, lowerAdapter],
    })).toBe('Schema message')
    expect(emptyMissing).not.toHaveBeenCalled()
    expect(lowerMissing).toHaveBeenCalledOnce()
    expect(lowerMissing).toHaveBeenCalledWith(expect.objectContaining({
      attempts: [{ locale: 'en', keys: ['errors.invalid'] }],
    }))
  })

  it('aggregates ordered and legacy attempts under the first attempted owner', () => {
    const firstMissing = vi.fn()
    const secondMissing = vi.fn()
    const first: DiagnosticMessageAdapter = {
      resolve: () => ({
        resolved: false,
        attempts: [
          { locale: 'en', keys: ['forms.email.invalid'] },
          { locale: 'nl', keys: ['forms.email.invalid'] },
        ],
      }),
      onMissing: firstMissing,
    }
    const legacy: DiagnosticMessageAdapter = {
      resolve: () => ({
        resolved: false,
        attempt: { locale: 'fr', keys: ['errors.invalid'] },
      }),
      onMissing: secondMissing,
    }

    expect(resolveIssueMessage(issue(), { resolvers: [first, legacy] })).toBe('Schema message')
    expect(firstMissing).toHaveBeenCalledOnce()
    expect(firstMissing).toHaveBeenCalledWith(expect.objectContaining({
      attempts: [
        { locale: 'en', keys: ['forms.email.invalid'] },
        { locale: 'nl', keys: ['forms.email.invalid'] },
        { locale: 'fr', keys: ['errors.invalid'] },
      ],
    }))
    expect(secondMissing).not.toHaveBeenCalled()
  })

  it('prefers the ordered attempt array when both carriers are present', () => {
    const onMissing = vi.fn()
    const adapter: DiagnosticMessageAdapter = {
      resolve: () => ({
        resolved: false,
        attempt: { locale: 'legacy', keys: ['legacy.invalid'] },
        attempts: [{ locale: 'current', keys: ['current.invalid'] }],
      }),
      onMissing,
    }

    resolveIssueMessage(issue(), { resolvers: [adapter] })

    expect(onMissing).toHaveBeenCalledWith(expect.objectContaining({
      attempts: [{ locale: 'current', keys: ['current.invalid'] }],
    }))
  })

  it('discards accumulated attempts when a later resolver succeeds', () => {
    const onMissing = vi.fn()
    const missing: DiagnosticMessageAdapter = {
      resolve: () => ({
        resolved: false,
        attempts: [{ locale: 'en', keys: ['errors.invalid'] }],
      }),
      onMissing,
    }
    const resolved: DiagnosticMessageAdapter = {
      resolve: () => ({ resolved: true, message: '' }),
    }

    expect(resolveIssueMessage(issue(), { resolvers: [missing, resolved] })).toBe('')
    expect(onMissing).not.toHaveBeenCalled()
  })

  it('does not expose captured validator values to missing-message callbacks', () => {
    const onMissing = vi.fn()
    const secret = 'correct horse battery staple'
    const raw = {
      message: 'Password is too short',
      input: secret,
      path: [{ key: 'password', value: { password: secret } }],
    }
    const sensitiveIssue: ValidationIssue = {
      raw,
      vendor: 'valibot',
      message: raw.message,
      localPath: ['password'],
      path: ['password'],
      semantic: { identifier: 'minLength', values: { minimum: 12 }, count: 12 },
    }
    const adapter: DiagnosticMessageAdapter = {
      resolve: () => ({
        resolved: false,
        attempts: [{ locale: 'en', keys: ['errors.minLength'] }],
      }),
      onMissing,
    }

    resolveIssueMessage(sensitiveIssue, { resolvers: [adapter] })

    const diagnostic = onMissing.mock.calls[0]?.[0]
    expect(diagnostic).toEqual({
      messagePrefix: undefined,
      path: ['password'],
      identifier: 'minLength',
      attempts: [{ locale: 'en', keys: ['errors.minLength'] }],
    })
    expect(JSON.stringify(diagnostic)).not.toContain(secret)
  })
})
