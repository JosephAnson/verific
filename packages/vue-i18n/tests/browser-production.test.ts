// @vitest-environment node

import type { DiagnosticMessageAdapter, MessageContext, ValidationIssue } from '@verific/core'
import type { vueI18nMessages } from '../src/main'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'tsup'
import { describe, expect, it, vi } from 'vitest'

function reportMissing(adapter: DiagnosticMessageAdapter): void {
  const raw = { message: 'Schema message', path: ['email'] }
  const issue: ValidationIssue = {
    raw,
    vendor: 'test',
    message: raw.message,
    localPath: raw.path,
    path: raw.path,
    semantic: { identifier: 'invalidEmail', values: {} },
  }
  const context: MessageContext = {
    issue,
    path: issue.path,
    identifier: 'invalidEmail',
    values: {},
    messagePrefix: 'forms.signup',
    defaultMessage: issue.message,
  }
  const result = adapter.resolve(context)

  expect(result.resolved).toBe(false)
  if (!result.resolved) {
    adapter.onMissing?.({
      messagePrefix: context.messagePrefix,
      path: issue.path,
      identifier: context.identifier,
      attempts: result.attempts ?? (result.attempt ? [result.attempt] : []),
    })
  }
}

describe('browser production bundle', () => {
  it('is silent by default without a process global', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'verific-vue-i18n-'))

    try {
      await build({
        entry: [fileURLToPath(new URL('../src/main.ts', import.meta.url))],
        outDir: outputDirectory,
        format: ['iife'],
        platform: 'browser',
        globalName: 'VerificVueI18n',
        define: { 'process.env.NODE_ENV': JSON.stringify('production') },
        clean: false,
        dts: false,
        noExternal: ['@verific/i18n'],
        silent: true,
      })

      const bundle = await readFile(join(outputDirectory, 'main.global.js'), 'utf8')
      const warn = vi.fn()
      const browser = { console: { warn } } as {
        VerificVueI18n?: { vueI18nMessages: typeof vueI18nMessages }
      }
      runInNewContext(bundle, browser)

      const adapter = browser.VerificVueI18n?.vueI18nMessages({
        locale: { value: 'en' },
        fallbackLocale: { value: false },
        isGlobal: true,
        fallbackRoot: true,
        te: () => false,
        t: () => 'unreachable',
      })
      if (!adapter) {
        throw new Error('The browser bundle did not expose vueI18nMessages')
      }

      reportMissing(adapter)
      expect(warn).not.toHaveBeenCalled()
      expect('process' in browser).toBe(false)
    }
    finally {
      await rm(outputDirectory, { recursive: true, force: true })
    }
  })
})
