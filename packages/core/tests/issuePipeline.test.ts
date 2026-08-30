import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { IssueNormaliser } from '../src/messages'
import { describe, expect, it, vi } from 'vitest'
import {
  createIssuePipeline,
  resolveValidationMessage,
} from '../src/validation/issuePipeline'

describe('issue-to-Error pipeline', () => {
  it('normalises paths and input before applying each normaliser identity once', () => {
    const calls: string[] = []
    const repeated: IssueNormaliser = vi.fn((context) => {
      calls.push(`repeated:${String(context.input.value)}`)
      return undefined
    })
    const application: IssueNormaliser = vi.fn(() => {
      calls.push('application')
      return { identifier: 'custom', values: { source: 'application' } }
    })
    const pipeline = createIssuePipeline(['profile'], {
      registration: { describeIssue: repeated },
      root: { describeIssue: repeated },
      application: { describeIssue: application },
      creatingScope: false,
    })
    const raw = {
      message: 'Raw message',
      path: [{ key: 'contacts' }, 0, { key: 'email' }],
    } satisfies StandardSchemaV1.Issue

    const issue = pipeline.createIssue(raw, 'test', {
      contacts: [{ email: 'ada@example.com' }],
    })

    expect(calls).toEqual(['repeated:ada@example.com', 'application'])
    expect(issue.raw).toBe(raw)
    expect(issue.localPath).toEqual(['contacts', 0, 'email'])
    expect(issue.path).toEqual(['profile', 'contacts', 0, 'email'])
    expect(issue.semantic).toEqual({ identifier: 'custom', values: { source: 'application' } })
  })

  it('retains resolver ownership and re-resolves a lazy Error on the same stack', () => {
    let locale = 'en'
    const resolver = vi.fn(() => locale === 'en' ? 'Invalid email' : 'Correo no válido')
    const pipeline = createIssuePipeline([], {
      registration: { messages: resolver },
      root: { messages: resolver },
      application: { messages: resolver },
      creatingScope: false,
    })
    const issue = pipeline.createIssue({ message: 'Raw', path: ['email'] }, 'test', {})

    expect(resolveValidationMessage(issue)).toBe('Invalid email')

    locale = 'es'

    expect(resolveValidationMessage(issue)).toBe('Correo no válido')
    expect(resolver).toHaveBeenCalledTimes(2)
  })

  it('uses the built-in semantic fallback after custom normalisers decline', () => {
    const custom = vi.fn(() => undefined)
    const pipeline = createIssuePipeline([], {
      registration: { describeIssue: custom },
      root: {},
      creatingScope: false,
    })
    const issue = pipeline.createIssue({
      code: 'invalid_type',
      expected: 'string',
      message: 'Required',
      path: ['email'],
    } as StandardSchemaV1.Issue, 'zod', {})

    expect(custom).toHaveBeenCalledOnce()
    expect(issue.semantic).toEqual({ identifier: 'required', values: {} })
  })
})
