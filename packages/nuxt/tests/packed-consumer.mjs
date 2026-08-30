import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const fixture = join(root, 'packages/nuxt/tests/fixtures/consumer')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packageManager = process.env.npm_execpath

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'verific-nuxt-consumers-'))
  const tarballDirectory = join(temporaryRoot, 'tarballs')

  try {
    await mkdir(tarballDirectory)
    const tarballs = await packPackages(tarballDirectory)

    const generatedParaglide = await assertPackedPackageConsumers(temporaryRoot, tarballs)
    await assertPackedDocumentationExamples(temporaryRoot, tarballs, generatedParaglide)

    for (const nuxtVersion of ['3.21.11', '4.5.2']) {
      const localised = await createConsumer(temporaryRoot, `nuxt-${nuxtVersion}-localised`, nuxtVersion, tarballs, true)
      if (nuxtVersion === '3.21.11') {
        await assertPackedExports(localised)
      }
      assertPackagesAbsent(localised, ['@nuxtjs/i18n'])
      await assertRequestLocalTypes(localised)
      await assertRender(localised, {
        label: `Nuxt ${nuxtVersion} request-local Vue I18n`,
        environment: { VERIFIC_I18N: 'true' },
        expected: 'Enter an email address',
      })
      await assertConcurrentRequestIsolation(localised, nuxtVersion)

      const plain = await createConsumer(temporaryRoot, `nuxt-${nuxtVersion}-plain`, nuxtVersion, tarballs, false)
      assertLocalePackagesAbsent(plain)
      await assertRender(plain, {
        label: `Nuxt ${nuxtVersion} without localisation peers`,
        environment: {},
        expected: 'Email is required',
      })
    }
  }
  finally {
    if (process.env.KEEP_VERIFIC_CONSUMERS !== 'true') {
      await rm(temporaryRoot, { force: true, recursive: true })
    }
    else {
      console.warn(`Packed consumers retained at ${temporaryRoot}`)
    }
  }
}

async function assertPackedExports(directory) {
  console.warn('\nPacked core and Vue I18n adapter exports')
  if (!existsSync(join(directory, 'node_modules/@verific/vue-i18n/README.md'))) {
    throw new Error('Packed Vue I18n adapter is missing its README.')
  }
  await run(process.execPath, [
    '--input-type=module',
    '--eval',
    'import { createVerific, useValidation } from \'@verific/core\'; import { vueI18nMessages } from \'@verific/vue-i18n\'; if (![createVerific, useValidation, vueI18nMessages].every(value => typeof value === \'function\')) throw new Error(\'Missing ESM export\')',
  ], directory)
  await run(process.execPath, [
    '--input-type=commonjs',
    '--eval',
    'const { createVerific, useValidation } = require(\'@verific/core\'); const { vueI18nMessages } = require(\'@verific/vue-i18n\'); if (![createVerific, useValidation, vueI18nMessages].every(value => typeof value === \'function\')) throw new Error(\'Missing CommonJS export\')',
  ], directory)
}

async function packPackages(tarballDirectory) {
  const packageDirectories = [
    'packages/core',
    'packages/i18n',
    'packages/i18next',
    'packages/paraglide',
    'packages/vue-i18n',
    'packages/nuxt',
  ]
  const expectedBuilds = packageDirectories.map(packageDirectory => (
    packageDirectory === 'packages/nuxt' ? 'dist/module.mjs' : 'dist/main.mjs'
  ))
  const result = {}

  for (const [index, packageDirectory] of packageDirectories.entries()) {
    if (!existsSync(join(root, packageDirectory, expectedBuilds[index]))) {
      throw new Error(`${packageDirectory} is not built. Build all publishable packages before running the packed-consumer matrix.`)
    }
    const before = new Set(await readdir(tarballDirectory))
    await runPackageManager([
      '--config.ignore-scripts=true',
      '--dir',
      join(root, packageDirectory),
      'pack',
      '--pack-destination',
      tarballDirectory,
    ], root)
    const created = (await readdir(tarballDirectory)).find(file => !before.has(file))
    if (!created) {
      throw new Error(`Packing ${packageDirectory} did not create a tarball.`)
    }
    result[packageDirectory] = join(tarballDirectory, created)
  }

  return result
}

async function assertPackedPackageConsumers(temporaryRoot, tarballs) {
  const generatedParaglide = join(temporaryRoot, 'generated-paraglide')

  await assertCoreOnlyConsumer(temporaryRoot, tarballs)
  await assertSharedI18nConsumer(temporaryRoot, tarballs)
  await assertVueI18nConsumer(temporaryRoot, tarballs)
  await assertI18nextConsumer(temporaryRoot, tarballs)
  await assertParaglideConsumer(temporaryRoot, tarballs, generatedParaglide)

  return generatedParaglide
}

async function assertCoreOnlyConsumer(temporaryRoot, tarballs) {
  const directory = await createPackageConsumer(temporaryRoot, 'core-only', [
    'vue@3.4.26',
    tarballs['packages/core'],
  ])
  assertPackagesAbsent(directory, [
    '@inlang/paraglide-js',
    '@verific/i18n',
    '@verific/i18next',
    '@verific/paraglide',
    '@verific/vue-i18n',
    'i18next',
    'i18next-vue',
    'vue-i18n',
  ])
  assertDeclaration(directory, '@verific/core', 'dist/main.d.ts')

  await assertModuleFormats(directory, {
    esm: `
      import { createVerific, useValidation } from '@verific/core'
      import { createSSRApp, h } from 'vue'
      import { renderToString } from 'vue/server-renderer'
      const schema = { '~standard': { version: 1, vendor: 'packed-consumer', validate: value => ({ issues: [{ message: 'Email is required', path: ['email'] }] }) } }
      let validation
      const app = createSSRApp({
        setup() {
          validation = useValidation(schema, { email: '' })
          return () => h('main')
        },
      }).use(createVerific())
      await renderToString(app)
      const result = await validation.validate()
      if (result.success || validation.errorFor('email') !== 'Email is required') throw new Error('Packed core validation failed')
    `,
    cjs: `
      const { createVerific, useValidation } = require('@verific/core')
      const { createSSRApp, h } = require('vue')
      const { renderToString } = require('vue/server-renderer')
      const schema = { '~standard': { version: 1, vendor: 'packed-consumer', validate: value => ({ issues: [{ message: 'Email is required', path: ['email'] }] }) } }
      ;(async () => {
        let validation
        const app = createSSRApp({
          setup() {
            validation = useValidation(schema, { email: '' })
            return () => h('main')
          },
        }).use(createVerific())
        await renderToString(app)
        const result = await validation.validate()
        if (result.success || validation.errorFor('email') !== 'Email is required') throw new Error('Packed core validation failed')
      })().catch((error) => {
        console.error(error)
        process.exitCode = 1
      })
    `,
  })
  await assertTypes(directory, `
    import { ErrorMessages, createVerific, useValidation } from '@verific/core'
    createVerific()
    useValidation
    type ErrorMessagesProps = InstanceType<typeof ErrorMessages>['$props']
    const errorMessagesProps: ErrorMessagesProps = { messages: 'Required' }
    errorMessagesProps.messages

    // @ts-expect-error ErrorMessages requires messages.
    const missingErrorMessagesProps: ErrorMessagesProps = {}
    // @ts-expect-error ErrorMessages rejects unsupported message values.
    const invalidErrorMessagesProps: ErrorMessagesProps = { messages: 42 }

    declare const errorMessages: InstanceType<typeof ErrorMessages>
    errorMessages.$slots.default?.({ message: 'Required', index: 0 })
    // @ts-expect-error The default slot requires a string message.
    errorMessages.$slots.default?.({ message: 42, index: 0 })
    // @ts-expect-error The default slot requires a numeric index.
    errorMessages.$slots.default?.({ message: 'Required', index: '0' })
    // @ts-expect-error The default slot requires the complete payload.
    errorMessages.$slots.default?.({ message: 'Required' })
  `)
}

async function assertSharedI18nConsumer(temporaryRoot, tarballs) {
  const directory = await createPackageConsumer(temporaryRoot, 'shared-i18n', [
    'vue@3.5.42',
    tarballs['packages/core'],
    tarballs['packages/i18n'],
  ])
  assertPackagesAbsent(directory, [
    '@inlang/paraglide-js',
    '@verific/i18next',
    '@verific/paraglide',
    '@verific/vue-i18n',
    'i18next',
    'i18next-vue',
    'vue-i18n',
  ])
  assertDeclaration(directory, '@verific/i18n', 'dist/main.d.ts')

  const exercise = moduleSyntax => `
    ${moduleSyntax}
    const adapter = createCatalogueMessages({
      locales: () => ['en'],
      lookup: (key, locale) => key === 'errors.required' && locale === 'en'
        ? { resolved: true, message: 'Required' }
        : { resolved: false },
    }, { fallbackPrefix: 'errors', missing: 'throw' })
    assertResolution(adapter, 'Required')
    assertMissing(adapter)
  `
  await assertModuleFormats(directory, {
    esm: `${esmResolutionHelpers()}${exercise(`import { createCatalogueMessages } from '@verific/i18n'`)}`,
    cjs: `${cjsResolutionHelpers()}${exercise(`const { createCatalogueMessages } = require('@verific/i18n')`)}`,
  })
  await assertTypes(directory, `
    import type { CatalogueMessageDriver } from '@verific/i18n'
    import { createCatalogueMessages } from '@verific/i18n'
    const driver: CatalogueMessageDriver = { locales: () => ['en'], lookup: () => ({ resolved: false }) }
    createCatalogueMessages(driver)
  `)
}

async function assertVueI18nConsumer(temporaryRoot, tarballs) {
  const directory = await createPackageConsumer(temporaryRoot, 'vue-i18n-adapter', [
    'vue@3.5.42',
    'vue-i18n@11.1.12',
    tarballs['packages/core'],
    tarballs['packages/i18n'],
    tarballs['packages/vue-i18n'],
  ])
  assertPackagesAbsent(directory, [
    '@inlang/paraglide-js',
    '@verific/i18next',
    '@verific/paraglide',
    'i18next',
    'i18next-vue',
  ])
  assertDeclaration(directory, '@verific/vue-i18n', 'dist/main.d.ts')

  const exercise = moduleSyntax => `
    ${moduleSyntax}
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: { errors: { required: 'Required' } } } })
    const adapter = vueI18nMessages(i18n.global, { fallbackPrefix: 'errors', missing: 'throw' })
    assertResolution(adapter, 'Required')
    assertMissing(adapter)
  `
  await assertModuleFormats(directory, {
    esm: `${esmResolutionHelpers()}${exercise(`import { vueI18nMessages } from '@verific/vue-i18n'; import { createI18n } from 'vue-i18n'`)}`,
    cjs: `${cjsResolutionHelpers()}${exercise(`const { vueI18nMessages } = require('@verific/vue-i18n'); const { createI18n } = require('vue-i18n')`)}`,
  })
  await assertTypes(directory, `
    import { vueI18nMessages } from '@verific/vue-i18n'
    import { createI18n } from 'vue-i18n'
    const i18n = createI18n({ legacy: false, locale: 'en', messages: {} })
    vueI18nMessages(i18n.global)
  `)
}

async function assertI18nextConsumer(temporaryRoot, tarballs) {
  const directory = await createPackageConsumer(temporaryRoot, 'i18next-adapter', [
    'i18next@26.4.0',
    'vue@3.5.42',
    tarballs['packages/core'],
    tarballs['packages/i18n'],
    tarballs['packages/i18next'],
  ])
  assertPackagesAbsent(directory, [
    '@inlang/paraglide-js',
    '@verific/paraglide',
    '@verific/vue-i18n',
    'i18next-vue',
    'vue-i18n',
  ])
  assertDeclaration(directory, '@verific/i18next', 'dist/main.d.ts')

  const exercise = moduleSyntax => `
    ${moduleSyntax}
    const i18n = createInstance()
    await i18n.init({ lng: 'en', resources: { en: { translation: { errors: { required: 'Required' } } } } })
    const adapter = i18nextMessages(i18n, { fallbackPrefix: 'errors', missing: 'throw' })
    assertResolution(adapter, 'Required')
    assertMissing(adapter)
    adapter.dispose()
  `
  await assertModuleFormats(directory, {
    esm: `${esmResolutionHelpers()}${exercise(`import { i18nextMessages } from '@verific/i18next'; import { createInstance } from 'i18next'`)}`,
    cjs: `${cjsResolutionHelpers()}(async () => {${exercise(`const { i18nextMessages } = require('@verific/i18next'); const { createInstance } = require('i18next')`)}})().catch(error => { console.error(error); process.exitCode = 1 })`,
  })
  await assertTypes(directory, `
    import { i18nextMessages } from '@verific/i18next'
    import { createInstance } from 'i18next'
    const adapter = i18nextMessages(createInstance())
    adapter.dispose()
  `)
}

async function assertParaglideConsumer(temporaryRoot, tarballs, generatedDirectory) {
  const directory = await createPackageConsumer(temporaryRoot, 'paraglide-adapter', [
    '@inlang/paraglide-js@2.25.0',
    '@inlang/sdk@3.0.2',
    'typescript@5.9.3',
    'vue@3.5.42',
    tarballs['packages/core'],
    tarballs['packages/i18n'],
    tarballs['packages/paraglide'],
  ])
  assertPackagesAbsent(directory, [
    '@verific/i18next',
    '@verific/vue-i18n',
    'i18next',
    'i18next-vue',
    'vue-i18n',
  ])
  assertDeclaration(directory, '@verific/paraglide', 'dist/main.d.ts')
  await generateParaglideOutput(directory, generatedDirectory)

  const exercise = moduleSyntax => `
    ${moduleSyntax}
    const adapter = paraglideMessages({ 'errors.required': errors_invalid_email }, {
      fallbackPrefix: 'errors',
      locale: () => 'es',
      missing: 'throw',
    })
    assertResolution(adapter, 'Introduce una dirección de correo válida')
    assertMissing(adapter)
  `
  await assertModuleFormats(directory, {
    esm: `${esmResolutionHelpers()}${exercise(`import { paraglideMessages } from '@verific/paraglide'; import { errors_invalid_email } from '../generated-paraglide/messages/errors_invalid_email.js'`)}`,
    cjs: `${cjsResolutionHelpers()}(async () => { const { errors_invalid_email } = await import('../generated-paraglide/messages/errors_invalid_email.js'); ${exercise(`const { paraglideMessages } = require('@verific/paraglide')`)} })().catch(error => { console.error(error); process.exitCode = 1 })`,
  })

  await assertTypes(directory, `
    import { paraglideMessages } from '@verific/paraglide'
    import { errors_invalid_email } from '../generated-paraglide/messages/errors_invalid_email.js'
    const adapter = paraglideMessages({ 'errors.required': errors_invalid_email }, {
      fallbackPrefix: 'errors',
      locale: () => 'en' as const,
    })
    adapter.resolve
  `)
}

async function assertPackedDocumentationExamples(temporaryRoot, tarballs, generatedParaglide) {
  console.warn('\nCopyable documentation examples against packed packages')
  const directory = await createPackageConsumer(temporaryRoot, 'packed-docs', [
    '@inlang/paraglide-js@2.25.0',
    'i18next@26.4.0',
    'i18next-vue@5.4.0',
    'typescript@5.9.3',
    'vue@3.5.42',
    'vue-i18n@11.1.12',
    tarballs['packages/core'],
    tarballs['packages/i18n'],
    tarballs['packages/i18next'],
    tarballs['packages/paraglide'],
    tarballs['packages/vue-i18n'],
  ])
  const examples = join(directory, 'examples')
  await cp(join(root, 'playgrounds/docs/guide/localisation/examples'), examples, { recursive: true })
  await rm(join(examples, 'paraglide'), { force: true, recursive: true })
  await cp(generatedParaglide, join(examples, 'paraglide'), { recursive: true })
  const compilerOptions = {
    allowJs: false,
    module: 'ESNext',
    moduleResolution: 'Bundler',
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: 'ES2022',
  }
  const suites = [
    { name: 'i18next', include: ['./i18next-form.ts', './i18next-setup.ts'] },
    { name: 'paraglide', include: ['./paraglide-form.ts', './paraglide-setup.ts', './paraglide/**/*.d.ts'] },
    { name: 'vue-i18n', include: ['./vue-i18n-setup.ts'] },
  ]

  for (const { name, include } of suites) {
    const config = join(examples, `tsconfig.${name}.json`)
    await writeFile(config, `${JSON.stringify({ compilerOptions, include }, null, 2)}\n`)
    await run(join(root, 'node_modules/.bin/tsc'), ['--noEmit', '-p', config], directory)
  }
}

async function createPackageConsumer(temporaryRoot, name, dependencies) {
  console.warn(`\nPacked consumer: ${name}`)
  const directory = join(temporaryRoot, name)
  await mkdir(directory)
  await writeFile(join(directory, 'package.json'), `${JSON.stringify({ name, private: true, type: 'module' }, null, 2)}\n`)
  await run(npmCommand, [
    'install',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    ...dependencies,
  ], directory, {
    ...process.env,
    npm_config_cache: process.env.VERIFIC_NPM_CACHE ?? join(temporaryRoot, '.npm-cache'),
  })
  return directory
}

function assertPackagesAbsent(directory, packagePaths) {
  for (const packagePath of packagePaths) {
    if (existsSync(join(directory, 'node_modules', packagePath))) {
      throw new Error(`Packed consumer unexpectedly installed unrelated package ${packagePath}.`)
    }
  }
}

function assertDeclaration(directory, packagePath, declaration) {
  if (!existsSync(join(directory, 'node_modules', packagePath, declaration))) {
    throw new Error(`${packagePath} is missing its published declaration entry point ${declaration}.`)
  }
}

async function assertModuleFormats(directory, sources) {
  await writeFile(join(directory, 'entry.mjs'), sources.esm)
  await run(process.execPath, ['entry.mjs'], directory)
  await writeFile(join(directory, 'entry.cjs'), sources.cjs)
  await run(process.execPath, ['entry.cjs'], directory)
}

async function assertTypes(directory, source) {
  await writeFile(join(directory, 'entry.ts'), source)
  await writeFile(join(directory, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: 'ES2022',
    },
    include: ['./entry.ts'],
  }, null, 2)}\n`)
  await run(join(root, 'node_modules/.bin/tsc'), ['--noEmit', '-p', 'tsconfig.json'], directory)
}

function esmResolutionHelpers() {
  return resolutionHelpers()
}

function cjsResolutionHelpers() {
  return resolutionHelpers()
}

function resolutionHelpers() {
  return `
    function context(identifier = 'required') {
      const raw = { message: 'Schema fallback', path: ['email'] }
      const issue = { raw, vendor: 'test', message: raw.message, localPath: raw.path, path: raw.path, semantic: { identifier, values: {} } }
      return { issue, path: issue.path, identifier, values: {}, defaultMessage: issue.message }
    }
    function resolve(adapter, identifier) {
      const value = context(identifier)
      const result = adapter.resolve(value)
      if (result.resolved) return result.message
      adapter.onMissing?.({ path: value.path, identifier: value.identifier, attempts: result.attempts ?? (result.attempt ? [result.attempt] : []) })
      return value.defaultMessage
    }
    function assertResolution(adapter, expected) {
      const actual = resolve(adapter, 'required')
      if (actual !== expected) throw new Error('Expected ' + JSON.stringify(expected) + ', received ' + JSON.stringify(actual))
    }
    function assertMissing(adapter) {
      try {
        resolve(adapter, 'missing')
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!message.includes('[Verific] Missing validation message for "missing"') || !/Attempted [^:,.]+:[^,.]+/.test(message)) {
          throw new Error('Strict missing-message resolution threw an unexpected error: ' + message)
        }
        return
      }
      throw new Error('Expected strict missing-message resolution to throw')
    }
  `
}

async function generateParaglideOutput(directory, outputDirectory) {
  await writeFile(join(directory, 'generate.mjs'), `
    import { mkdir, writeFile } from 'node:fs/promises'
    import { dirname, join } from 'node:path'
    import { compileProject } from '@inlang/paraglide-js'
    import { insertBundleNested, loadProjectInMemory, newProject } from '@inlang/sdk'

    const project = await loadProjectInMemory({
      blob: await newProject({ settings: { locales: ['en', 'es'], baseLocale: 'en' } }),
    })
    await insertBundleNested(project.db, {
      id: 'errors_invalid_email',
      declarations: [],
      messages: [
        {
          id: 'errors_invalid_email_en', bundleId: 'errors_invalid_email', locale: 'en', selectors: [],
          variants: [{ id: 'errors_invalid_email_en_variant', messageId: 'errors_invalid_email_en', matches: [], pattern: [{ type: 'text', value: 'Enter a valid email address' }] }],
        },
        {
          id: 'errors_invalid_email_es', bundleId: 'errors_invalid_email', locale: 'es', selectors: [],
          variants: [{ id: 'errors_invalid_email_es_variant', messageId: 'errors_invalid_email_es', matches: [], pattern: [{ type: 'text', value: 'Introduce una dirección de correo válida' }] }],
        },
      ],
    })
    const output = await compileProject({
      project,
      compilerOptions: {
        emitGitIgnore: false,
        emitPrettierIgnore: false,
        emitReadme: false,
        emitTsDeclarations: true,
      },
    })
    for (const [path, contents] of Object.entries(output)) {
      const target = join(${JSON.stringify(outputDirectory)}, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, contents)
    }
    await project.close()
  `)
  await run(process.execPath, ['generate.mjs'], directory)
  if (!existsSync(join(outputDirectory, 'messages/errors_invalid_email.js'))
    || !existsSync(join(outputDirectory, 'messages/errors_invalid_email.d.ts'))) {
    throw new Error('Paraglide did not emit the expected real JavaScript and declaration output.')
  }
}

async function createConsumer(temporaryRoot, name, nuxtVersion, tarballs, localisation) {
  const directory = join(temporaryRoot, name)
  await cp(fixture, directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), `${JSON.stringify({
    name,
    private: true,
    type: 'module',
  }, null, 2)}\n`)

  const dependencies = [
    `nuxt@${nuxtVersion}`,
    tarballs['packages/core'],
    tarballs['packages/nuxt'],
  ]
  if (localisation) {
    dependencies.push(
      'vue-i18n@11.1.12',
      tarballs['packages/i18n'],
      tarballs['packages/vue-i18n'],
    )
  }

  await run(npmCommand, [
    'install',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    ...dependencies,
  ], directory, {
    ...process.env,
    npm_config_cache: process.env.VERIFIC_NPM_CACHE ?? join(temporaryRoot, '.npm-cache'),
  })
  return directory
}

async function assertRequestLocalTypes(directory) {
  await assertTypes(directory, `
    import { createVerific } from '@verific/core'
    import { vueI18nMessages } from '@verific/vue-i18n'
    import { createSSRApp, h } from 'vue'
    import { createI18n } from 'vue-i18n'

    const i18n = createI18n({ legacy: false, locale: 'en', messages: {} })
    const app = createSSRApp({ render: () => h('main') })
    app.use(i18n)
    app.use(createVerific({ messages: vueI18nMessages(i18n.global) }))
  `)
}

function assertLocalePackagesAbsent(directory) {
  for (const packagePath of ['@nuxtjs/i18n', '@verific/vue-i18n', 'vue-i18n']) {
    if (existsSync(join(directory, 'node_modules', packagePath))) {
      throw new Error(`Localisation-disabled consumer unexpectedly installed ${packagePath}.`)
    }
  }
}

async function assertRender(directory, scenario) {
  console.warn(`\n${scenario.label}`)
  await rm(join(directory, '.nuxt'), { force: true, recursive: true })
  await rm(join(directory, '.output'), { force: true, recursive: true })
  const environment = { ...process.env, ...scenario.environment }
  await run(nuxtBinary(directory), ['build'], directory, environment)

  const { result: html } = await useAvailableServer(
    directory,
    environment,
    (url, server, readOutput) => request(url, server, readOutput),
  )
  if (!html.includes(scenario.expected)) {
    throw new Error(`${scenario.label} did not render ${JSON.stringify(scenario.expected)}.\n${html}`)
  }
  if (scenario.expected !== 'Email is required' && html.includes('Email is required')) {
    throw new Error(`${scenario.label} fell back to the raw schema message.\n${html}`)
  }
}

async function assertConcurrentRequestIsolation(directory, nuxtVersion) {
  const label = `Nuxt ${nuxtVersion} concurrent request isolation`
  console.warn(`\n${label}`)
  await rm(join(directory, '.nuxt'), { force: true, recursive: true })
  await rm(join(directory, '.output'), { force: true, recursive: true })
  const environment = {
    ...process.env,
    VERIFIC_I18N: 'true',
    VERIFIC_MISSING_WARN: 'true',
    VERIFIC_REQUEST_BARRIER: 'true',
  }
  await run(nuxtBinary(directory), ['build'], directory, environment)

  const locales = ['en', 'nl', 'en', 'nl']
  const { result: pages, output } = await useAvailableServer(
    directory,
    environment,
    (url, server, readOutput) => Promise.all(locales.map(locale => request(
      url,
      server,
      readOutput,
      { headers: { 'x-verific-locale': locale } },
    ))),
  )

  const expectedMessages = [
    'Enter an email address',
    'Vul een e-mailadres in',
    'Enter an email address',
    'Vul een e-mailadres in',
  ]
  for (const [index, page] of pages.entries()) {
    const expected = expectedMessages[index]
    const unexpected = expectedMessages[index % 2 === 0 ? 1 : 0]
    if (!page.includes(expected) || page.includes(unexpected)) {
      throw new Error(`${label} leaked locale state for request ${index + 1}.\n${page}`)
    }
    if (!page.includes('Request-local diagnostic')) {
      throw new Error(`${label} did not preserve raw fallback for request ${index + 1}.\n${page}`)
    }
  }

  const diagnostics = output.match(/\[Verific\] Missing validation message[^\n]+/g) ?? []
  if (diagnostics.length !== locales.length) {
    throw new Error(`${label} expected one request-local diagnostic per request, received ${diagnostics.length}.\n${output}`)
  }
  for (const locale of ['en', 'nl']) {
    const count = diagnostics.filter(diagnostic => diagnostic.includes(`Attempted ${locale}:forms.consumer.diagnostic.invalid`)).length
    if (count !== 2) {
      throw new Error(`${label} expected two ${locale} diagnostics from independent request caches, received ${count}.\n${diagnostics.join('\n')}`)
    }
  }

  assertRequestBarrier(output, label)
}

function assertRequestBarrier(output, label) {
  const arrivals = output.match(/\[Verific test barrier\] arrived (?:en|nl) \d\/4/g) ?? []
  const continued = output.match(/\[Verific test barrier\] continued (?:en|nl)/g) ?? []
  const releaseMarker = '[Verific test barrier] released 4/4'
  const releaseIndex = output.indexOf(releaseMarker)

  if (arrivals.length !== 4 || continued.length !== 4 || releaseIndex < 0) {
    throw new Error(`${label} did not complete the four-request barrier.\n${output}`)
  }
  for (const locale of ['en', 'nl']) {
    if (arrivals.filter(arrival => arrival.includes(`arrived ${locale} `)).length !== 2) {
      throw new Error(`${label} did not record two ${locale} barrier participants.\n${arrivals.join('\n')}`)
    }
  }
  if (continued.some(marker => output.indexOf(marker) < releaseIndex)) {
    throw new Error(`${label} allowed a request to continue before every request arrived.\n${output}`)
  }
}

async function useAvailableServer(directory, environment, exercise) {
  let lastError

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = await findAvailablePort()
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Expected a non-zero server port, received ${port}.`)
    }

    const server = spawn(process.execPath, [join(directory, '.output/server/index.mjs')], {
      cwd: directory,
      env: { ...environment, HOST: '127.0.0.1', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    server.stdout.on('data', chunk => output += chunk)
    server.stderr.on('data', chunk => output += chunk)

    try {
      const result = await exercise(`http://127.0.0.1:${port}/`, server, () => output)
      await new Promise(resolveImmediate => setImmediate(resolveImmediate))
      const reportedPort = Number(output.match(/Listening on http:\/\/127\.0\.0\.1:(\d+)/)?.[1])
      if (reportedPort !== port) {
        throw new Error(`Nuxt reported port ${reportedPort || 'none'} instead of selected port ${port}.\n${output}`)
      }
      return { result, output }
    }
    catch (error) {
      lastError = error
      if (!/EADDRINUSE|address already in use/i.test(output) || attempt === 4) {
        throw error
      }
      console.warn(`Port ${port} was claimed before Nuxt started; retrying.`)
    }
    finally {
      await stopServer(server)
    }
  }

  throw lastError ?? new Error('Nuxt server could not claim an available port.')
}

async function findAvailablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createServer()
    probe.unref()
    probe.once('error', rejectPort)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = address && typeof address !== 'string' ? address.port : 0
      probe.close((error) => {
        if (error) {
          rejectPort(error)
          return
        }
        resolvePort(port)
      })
    })
  })
}

async function stopServer(server) {
  if (hasExited(server)) {
    return
  }
  server.kill('SIGTERM')
  if (await waitForExit(server, 5000)) {
    return
  }
  server.kill('SIGKILL')
  if (!await waitForExit(server, 5000)) {
    throw new Error('Nuxt server did not exit after SIGKILL.')
  }
}

function waitForExit(server, timeoutMilliseconds) {
  if (hasExited(server)) {
    return Promise.resolve(true)
  }

  return new Promise((resolveExit) => {
    let timeout
    let settled = false

    function finish(exited) {
      if (settled) {
        return
      }
      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      server.off('exit', onExit)
      resolveExit(exited)
    }

    function onExit() {
      finish(true)
    }

    server.once('exit', onExit)
    if (hasExited(server)) {
      finish(true)
      return
    }

    timeout = setTimeout(finish, timeoutMilliseconds, false)
    timeout.unref()
    if (hasExited(server)) {
      finish(true)
    }
  })
}

function hasExited(server) {
  return server.exitCode !== null || server.signalCode !== null
}

function nuxtBinary(directory) {
  return join(directory, 'node_modules/.bin', process.platform === 'win32' ? 'nuxt.cmd' : 'nuxt')
}

async function request(url, server, readOutput, init) {
  let lastError
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Nuxt server exited before responding.\n${readOutput()}`)
    }
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(1000) })
      if (response.ok) {
        return response.text()
      }
      lastError = new Error(`HTTP ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250))
  }
  throw new Error(`Nuxt server did not respond: ${lastError ?? 'no listening address reported'}\n${readOutput()}`)
}

async function runPackageManager(arguments_, cwd) {
  if (packageManager) {
    await run(packageManager, arguments_, cwd)
    return
  }
  await run('corepack', ['pnpm', ...arguments_], cwd)
}

async function run(command, arguments_, cwd, environment = process.env) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, arguments_, {
      cwd,
      env: environment,
      stdio: 'inherit',
    })
    child.once('error', rejectRun)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun()
        return
      }
      rejectRun(new Error(`${command} exited with ${code ?? signal}.`))
    })
  })
}
