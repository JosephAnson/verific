import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { auditRenderedValidation } from './rendered-validation-audit.mjs'

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory())
      return markdownFiles(path)

    return entry.isFile() && extname(entry.name) === '.md' ? [path] : []
  }))

  return files.flat()
}

async function filesWithExtension(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory())
      return filesWithExtension(path, extension)

    return entry.isFile() && extname(entry.name) === extension ? [path] : []
  }))

  return files.flat()
}

function fenceMarker(line) {
  let index = 0
  while (index < 3 && line[index] === ' ')
    index++
  const character = line[index]
  if (character !== '`' && character !== '~')
    return

  const start = index
  while (line[index] === character)
    index++
  const length = index - start
  return length >= 3 && {
    character,
    info: line.slice(index),
    length,
  }
}

function closesFence(marker, fence) {
  return marker
    && marker.character === fence.character
    && marker.length >= fence.length
    && marker.info.trim() === ''
}

function withoutFencedCode(markdown) {
  let fence
  return markdown.split('\n').map((line) => {
    const marker = fenceMarker(line)

    if (!fence && marker) {
      fence = marker
      return ''
    }
    if (fence && closesFence(marker, fence)) {
      fence = undefined
      return ''
    }

    return fence ? '' : line
  }).join('\n')
}

function withoutInlineCode(markdown) {
  let result = ''
  let index = 0
  let htmlQuote
  let inHtmlTag = false

  while (index < markdown.length) {
    if (markdown[index] !== '`') {
      const character = markdown[index]
      if (inHtmlTag) {
        if (htmlQuote === character)
          htmlQuote = undefined
        else if (!htmlQuote && ['"', '\''].includes(character))
          htmlQuote = character
        else if (!htmlQuote && character === '>')
          inHtmlTag = false
      }
      else if (character === '<' && /^<\/?[a-z!]/i.test(markdown.slice(index))) {
        inHtmlTag = true
      }
      result += markdown[index++]
      continue
    }

    if (inHtmlTag) {
      result += markdown[index++]
      continue
    }

    let precedingBackslashes = 0
    while (markdown[index - precedingBackslashes - 1] === '\\')
      precedingBackslashes++
    if (precedingBackslashes % 2 === 1) {
      result += markdown[index++]
      continue
    }

    const start = index
    while (markdown[index] === '`')
      index++
    const length = index - start
    let close = index
    while (close < markdown.length) {
      close = markdown.indexOf('`', close)
      if (close < 0)
        break
      let end = close
      while (markdown[end] === '`')
        end++
      if (end - close === length) {
        result += markdown.slice(start, end).replace(/[^\n]/g, ' ')
        index = end
        break
      }
      close = end
    }
    if (close < 0)
      result += markdown.slice(start, index)
  }

  return result
}

function codeBlocks(markdown) {
  const blocks = []
  let fence
  let info = ''
  let lines = []

  for (const line of markdown.split('\n')) {
    const marker = fenceMarker(line)

    if (!fence && marker) {
      fence = marker
      info = marker.info.trim()
      lines = []
    }
    else if (fence && closesFence(marker, fence)) {
      blocks.push({
        info,
        source: lines.join('\n'),
      })
      fence = undefined
    }
    else if (fence) {
      lines.push(line)
    }
  }
  if (fence) {
    blocks.push({
      info,
      source: lines.join('\n'),
    })
  }

  return blocks
}

function balancedContent(source, openIndex, open, close, quoteCharacters = '"\'`') {
  let depth = 0
  let quote

  for (let index = openIndex; index < source.length; index++) {
    const character = source[index]

    if (character === '\\') {
      index++
      continue
    }

    if (quote) {
      if (character === quote)
        quote = undefined
      continue
    }

    if (quoteCharacters.includes(character)) {
      quote = character
      continue
    }

    if (character === open)
      depth++
    else if (character === close && --depth === 0)
      return source.slice(openIndex + 1, index)
  }
}

function linkDestination(body) {
  const trimmed = body.trim()

  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>')
    return end > 0 ? trimmed.slice(1, end) : ''
  }

  let depth = 0
  let end = trimmed.length

  for (let index = 0; index < trimmed.length; index++) {
    const character = trimmed[index]

    if (character === '\\') {
      index++
      continue
    }

    if (character === '(') {
      depth++
    }
    else if (character === ')') {
      depth--
    }
    else if (/\s/.test(character) && depth === 0) {
      end = index
      break
    }
  }

  return trimmed.slice(0, end).replace(/\\([()\\])/g, '$1')
}

function markdownLinks(markdown) {
  const links = []
  const malformed = []

  for (let index = 0; index < markdown.length; index++) {
    if (markdown[index] !== '[' || markdown[index - 1] === '!')
      continue

    let labelDepth = 0
    let labelEnd
    for (let cursor = index; cursor < markdown.length; cursor++) {
      if (markdown[cursor] === '\\') {
        cursor++
        continue
      }

      if (markdown[cursor] === '[') {
        labelDepth++
      }
      else if (markdown[cursor] === ']' && --labelDepth === 0) {
        labelEnd = cursor
        break
      }
    }

    if (labelEnd === undefined)
      continue

    if (markdown[labelEnd + 1] !== '(')
      continue

    const body = balancedContent(markdown, labelEnd + 1, '(', ')', '"')
    if (body === undefined) {
      malformed.push(markdown.slice(index, labelEnd + 2))
      index = labelEnd + 1
      continue
    }

    links.push(linkDestination(body))
    index = labelEnd + body.length + 2
  }

  return { links, malformed }
}

function routeForFile(root, file) {
  const source = relative(root, file).split(sep).join('/')
  const withoutExtension = source.replace(/\.md$/, '')

  if (withoutExtension === 'index')
    return '/'

  return withoutExtension.endsWith('/index')
    ? `/${withoutExtension.slice(0, -'/index'.length)}/`
    : `/${withoutExtension}`
}

function fileForRoute(root, route) {
  const cleanRoute = route.replace(/^\//, '')

  if (!cleanRoute)
    return join(root, 'index.md')

  if (route.endsWith('/'))
    return join(root, cleanRoute, 'index.md')

  return join(root, `${cleanRoute.replace(/\.md$/, '')}.md`)
}

function headingAnchors(markdown) {
  const anchors = new Set()
  const counts = new Map()

  for (const line of withoutFencedCode(markdown).split('\n')) {
    const heading = line.match(/^#{1,6} (.*)$/)?.[1]?.replace(/ #+$/, '')

    if (!heading)
      continue

    const explicitAnchor = heading.match(/\s+\{#([^}]+)\}$/)?.[1]
    let slug = explicitAnchor ?? heading
      .replace(/\s+\{#[^}]+\}$/, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[`*_~]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
      .replace(/\s+/g, '-')

    if (/^\d/.test(slug))
      slug = `_${slug}`

    const count = counts.get(slug) ?? 0
    counts.set(slug, count + 1)
    anchors.add(count === 0 ? slug : `${slug}-${count}`)
  }

  return anchors
}

function localTarget(sourceFile, href) {
  const [rawPath, rawAnchor = ''] = href.split('#', 2)
  const anchor = decodeURIComponent(rawAnchor)

  if (!rawPath)
    return { path: sourceFile, anchor }

  if (rawPath.startsWith('/'))
    return { route: rawPath, anchor }

  const sourceRoute = sourceFile.replace(/\.md$/, '')
  const sourceDirectory = dirname(sourceRoute)
  const resolvedPath = posix.normalize(posix.join(sourceDirectory.split(sep).join('/'), rawPath))

  return { path: extname(resolvedPath) ? resolvedPath : `${resolvedPath}.md`, anchor }
}

function isExternalLink(href) {
  return /^(?:[a-z]+:|\/\/)/i.test(href)
}

function vueFenceLanguage(info) {
  const token = info.split(/\s+/, 1)[0].toLowerCase()
  const language = token.match(/^(vue-html|html|vue)/)?.[1]
  if (!language)
    return

  const suffix = token.slice(language.length)
  const isHighlight = value => /^\{\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*\}$/.test(value)
  if (suffix === '' || isHighlight(suffix))
    return language
  for (const lineModifier of [':line-numbers', ':no-line-numbers']) {
    if (
      suffix === lineModifier
      || (suffix.endsWith(lineModifier) && isHighlight(suffix.slice(0, -lineModifier.length)))
      || (suffix.startsWith(lineModifier) && isHighlight(suffix.slice(lineModifier.length)))
    ) {
      return language
    }
  }
}

function markdownTemplateEntries(file, markdown, docsRoot) {
  const entries = []
  const virtualDirectory = resolve(
    docsRoot,
    `.verific-${relative(docsRoot, file).replace(/[^\w-]/g, '-')}`,
  )

  for (const [blockIndex, block] of codeBlocks(markdown).entries()) {
    const language = vueFenceLanguage(block.info)
    if (!language)
      continue

    const label = block.info.match(/\[([^\]]+\.vue)\]/)?.[1]
    const fullSfc = language !== 'html' && /<script(?:\s|>)/.test(block.source)
    if (!fullSfc && !block.source.includes('<'))
      continue

    const filename = label
      ? resolve(virtualDirectory, label)
      : resolve(virtualDirectory, `block-${blockIndex + 1}.vue`)
    if (label && !isWithinDirectory(virtualDirectory, filename)) {
      entries.push({
        failure: `${relative(docsRoot, file)}: Vue block ${blockIndex + 1} label resolves outside its virtual example directory`,
      })
      continue
    }
    entries.push({
      displayName: `${relative(docsRoot, file)}: Vue block ${blockIndex + 1}`,
      filename,
      source: block.source,
      templateOnly: !fullSfc,
    })
  }

  return entries
}

function withoutFrontmatter(source) {
  const lines = source.split('\n')
  if (lines[0]?.trim() !== '---')
    return source
  const end = lines.slice(1).findIndex(line => line.trim() === '---')
  return end < 0 ? source : lines.slice(end + 2).join('\n')
}

function renderedPageEntry(file, markdown, docsRoot) {
  const source = withoutFencedCode(markdown)
  const scriptPattern = /<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi
  const scripts = [...source.matchAll(scriptPattern)].map(match => match[0])
  const template = withoutFrontmatter(withoutInlineCode(source.replace(scriptPattern, '')))
  const pageName = relative(dirname(file), file).replace(/[^\w-]/g, '-')

  return {
    displayName: `${relative(docsRoot, file)}: rendered page`,
    filename: join(dirname(file), `.verific-rendered-${pageName}.vue`),
    source: `${scripts.join('\n')}\n<template>\n${template}\n</template>`,
  }
}

function sourceImports(markdown) {
  return withoutFencedCode(markdown).split('\n').flatMap((line) => {
    const directive = line.trim()
    if (!directive.startsWith('<<< '))
      return []

    const withRegion = directive.slice('<<< '.length).trim().replace(/\s+\[[^\]]+\]\s*$/, '')
    const withoutLines = withRegion.replace(/\{[^}]*\}\s*$/, '').trim()
    return [withoutLines.split('#', 1)[0]]
  })
}

function sourceImportPath(docsRoot, sourceFile, importedPath) {
  return importedPath.startsWith('@/')
    ? resolve(docsRoot, importedPath.slice(2))
    : resolve(dirname(sourceFile), importedPath)
}

function isWithinDirectory(directory, target) {
  const pathFromDirectory = relative(directory, target)
  return pathFromDirectory === ''
    || (!pathFromDirectory.startsWith(`..${sep}`) && pathFromDirectory !== '..' && !isAbsolute(pathFromDirectory))
}

function configLinks(source) {
  const links = []

  for (const match of source.matchAll(/\blink\s*:/g)) {
    let index = match.index + match[0].length
    while (/\s/.test(source[index] ?? ''))
      index++

    const quote = source[index]
    if (quote !== '"' && quote !== '\'')
      continue

    index++
    let value = ''
    while (index < source.length && source[index] !== quote) {
      if (source[index] === '\\' && index + 1 < source.length)
        index++
      value += source[index++]
    }

    links.push(value.split('#')[0])
  }

  return links
}

function sidebarRoutes(config) {
  const sidebarIndex = config.indexOf('sidebar:')
  if (sidebarIndex < 0)
    return new Set()

  const sidebarOpen = config.indexOf('[', sidebarIndex)
  const sidebar = balancedContent(config, sidebarOpen, '[', ']') ?? ''
  const groupNames = [...sidebar.matchAll(/\bitems:\s*([\w$]+)/g)].map(match => match[1])
  const sources = [sidebar]

  for (const groupName of groupNames) {
    const declarationIndex = config.indexOf(`const ${groupName}`)
    const groupOpen = config.indexOf('[', declarationIndex)

    if (declarationIndex >= 0 && groupOpen >= 0)
      sources.push(balancedContent(config, groupOpen, '[', ']') ?? '')
  }

  return new Set(sources.flatMap(configLinks).filter(route => route.startsWith('/guide/')))
}

function compatibilityRows(markdown) {
  const rows = new Map()

  for (const line of markdown.split('\n')) {
    const cells = [...line.matchAll(/`([^`]+)`/g)].map(match => match[1])
    if (cells.length >= 4 && cells[0].startsWith('@verific/'))
      rows.set(`${cells[0]}\0${cells[1]}`, { peer: cells[2], tested: cells[3] })
  }

  return rows
}

function compatibilityEntryMatches(markdown, packageName, runtime, peer, tested) {
  const row = compatibilityRows(markdown).get(`${packageName}\0${runtime}`)
  return row?.peer === peer && row.tested === tested
}

async function checkAdapterCompatibility(docsRoot, content, failures) {
  const repositoryRoot = resolve(docsRoot, '..', '..')
  const overview = content.get(join(docsRoot, 'guide', 'localisation.md')) ?? ''
  const adapters = [
    {
      factory: 'vueI18nMessages',
      guide: 'vue-i18n.md',
      packageName: '@verific/vue-i18n',
      packagePath: 'vue-i18n',
      runtimes: ['vue-i18n'],
    },
    {
      factory: 'i18nextMessages',
      guide: 'i18next.md',
      packageName: '@verific/i18next',
      packagePath: 'i18next',
      runtimes: ['i18next', 'vue'],
    },
    {
      factory: 'paraglideMessages',
      guide: 'paraglide.md',
      packageName: '@verific/paraglide',
      packagePath: 'paraglide',
      runtimes: ['@inlang/paraglide-js'],
    },
  ]

  for (const adapter of adapters) {
    const packageRoot = join(repositoryRoot, 'packages', adapter.packagePath)
    let manifest
    let source
    let readme

    try {
      [manifest, source, readme] = await Promise.all([
        readFile(join(packageRoot, 'package.json'), 'utf8').then(JSON.parse),
        readFile(join(packageRoot, 'src', 'main.ts'), 'utf8'),
        readFile(join(packageRoot, 'README.md'), 'utf8'),
      ])
    }
    catch (error) {
      if (error?.code === 'ENOENT') {
        failures.push(`${adapter.packageName}: package manifest, source or README is missing`)
        continue
      }
      throw error
    }

    const guide = content.get(join(docsRoot, 'guide', 'localisation', adapter.guide)) ?? ''
    const exampleName = adapter.guide.replace(/\.md$/, '-setup.ts')
    const sourceDirective = `<<< ./examples/${exampleName}`
    let example = ''
    try {
      example = await readFile(join(docsRoot, 'guide', 'localisation', 'examples', exampleName), 'utf8')
    }
    catch (error) {
      if (error?.code !== 'ENOENT')
        throw error
    }
    const factoryMarker = `<!-- verific-adapter:${adapter.packageName} runtime=${adapter.runtimes[0]} factory=${adapter.factory} -->`

    if (!overview.includes(factoryMarker))
      failures.push(`guide/localisation.md: missing adapter marker for ${adapter.packageName}`)
    if (!source.includes(`export function ${adapter.factory}`))
      failures.push(`${adapter.packageName}: documented factory ${adapter.factory} is not exported`)
    if (!guide.includes(sourceDirective))
      failures.push(`${adapter.packageName}: adapter guide does not display its checked source`)
    if (!example.includes(`import { ${adapter.factory} } from '${adapter.packageName}'`))
      failures.push(`${adapter.packageName}: checked adapter example does not import ${adapter.factory}`)
    if (!readme.includes(`${adapter.factory}(`))
      failures.push(`${adapter.packageName}: package README does not use ${adapter.factory}`)

    for (const runtime of adapter.runtimes) {
      const peer = manifest.peerDependencies?.[runtime]
      const tested = manifest.devDependencies?.[runtime]

      if (!peer || !tested) {
        failures.push(`${adapter.packageName}: ${runtime} needs peer and tested dependency metadata`)
        continue
      }

      if (!compatibilityEntryMatches(overview, adapter.packageName, runtime, peer, tested))
        failures.push(`guide/localisation.md: compatibility entry for ${adapter.packageName} and ${runtime} does not match package metadata`)
    }
  }
}

export async function checkDocs(root, options = {}) {
  const docsRoot = resolve(root)
  const realDocsRoot = await realpath(docsRoot)
  const guideRoot = join(docsRoot, 'guide')
  const examplesRoot = join(docsRoot, '.vitepress', 'examples')
  const configPath = join(docsRoot, '.vitepress', 'config.mts')
  const [files, exampleFiles, config] = await Promise.all([
    Promise.all([
      Promise.resolve([join(docsRoot, 'index.md')]),
      markdownFiles(guideRoot),
    ]).then(authoredFiles => authoredFiles.flat()),
    filesWithExtension(examplesRoot, '.vue'),
    readFile(configPath, 'utf8'),
  ])
  const failures = []
  const content = new Map()
  const importedSources = new Map()
  const markdownEntries = new Map()
  const renderedPageEntries = new Map()
  const sourceImportRecords = new Map()

  for (const file of files)
    content.set(file, await readFile(file, 'utf8'))

  for (const [file, markdown] of content) {
    markdownEntries.set(file, markdownTemplateEntries(file, markdown, docsRoot))

    const records = []
    for (const importedPath of sourceImports(markdown)) {
      const target = sourceImportPath(docsRoot, file, importedPath)
      const sourceName = relative(docsRoot, file)

      if (!isWithinDirectory(docsRoot, target)) {
        records.push({
          failure: `${sourceName}: source import resolves outside the documentation root: ${importedPath}`,
        })
        continue
      }

      try {
        const canonicalTarget = await realpath(target)
        if (!isWithinDirectory(realDocsRoot, canonicalTarget)) {
          records.push({
            failure: `${sourceName}: source import resolves outside the documentation root through a symbolic link: ${importedPath}`,
          })
          continue
        }
        records.push({ target })
        importedSources.set(target, await readFile(canonicalTarget, 'utf8'))
      }
      catch {
        records.push({
          failure: `${sourceName}: source import does not exist: ${importedPath}`,
        })
      }
    }
    sourceImportRecords.set(file, records)

    const sourceWithoutCode = withoutFencedCode(markdown)
    const renderedSource = withoutInlineCode(sourceWithoutCode)
    if (
      /\bfrom\s+(['"])[^'"]+\.vue\1/.test(sourceWithoutCode)
      || /<component(?:\s|>)/i.test(renderedSource)
    ) {
      renderedPageEntries.set(file, renderedPageEntry(file, markdown, docsRoot))
    }
  }

  const renderedAudit = await auditRenderedValidation({
    docsRoot,
    markdownEntries,
    realDocsRoot,
    renderedPageEntries,
    vueFiles: new Set([
      ...exampleFiles,
      ...[...importedSources.keys()].filter(file => extname(file) === '.vue'),
    ]),
  })
  failures.push(...renderedAudit.markdownFailures)

  const configuredSidebarRoutes = sidebarRoutes(config)
  const guideRoutes = new Set(files
    .filter(file => file.startsWith(`${guideRoot}${sep}`))
    .map(file => routeForFile(docsRoot, file)))

  for (const route of guideRoutes) {
    if (!configuredSidebarRoutes.has(route))
      failures.push(`${route}: guide page is missing from the sidebar`)
  }

  for (const route of configuredSidebarRoutes) {
    const target = fileForRoute(docsRoot, route)
    if (!content.has(target))
      failures.push(`${route}: sidebar target does not exist`)
  }

  for (const [file, markdown] of content) {
    const sourceWithoutCode = withoutFencedCode(markdown)

    if (sourceWithoutCode.includes('/guide/migration'))
      failures.push(`${relative(docsRoot, file)}: obsolete migration route is linked`)
    if (markdown.includes('BaseField'))
      failures.push(`${relative(docsRoot, file)}: examples must not assume an application-specific BaseField component`)

    const scannedLinks = markdownLinks(sourceWithoutCode)

    for (const link of scannedLinks.malformed)
      failures.push(`${relative(docsRoot, file)}: Markdown link has an unclosed destination: ${link}`)

    for (const href of scannedLinks.links) {
      if (!href || isExternalLink(href))
        continue

      const target = localTarget(file, href)
      const targetFile = target.route
        ? fileForRoute(docsRoot, target.route.split(/[?#]/)[0])
        : resolve(target.path)

      if (!content.has(targetFile)) {
        failures.push(`${relative(docsRoot, file)}: link target does not exist: ${href}`)
        continue
      }

      if (target.anchor && !headingAnchors(content.get(targetFile)).has(target.anchor))
        failures.push(`${relative(docsRoot, file)}: link anchor does not exist: ${href}`)
    }

    const disclosedTargets = new Set()
    for (const record of sourceImportRecords.get(file) ?? []) {
      if (record.failure)
        failures.push(record.failure)
      else
        disclosedTargets.add(record.target)
    }

    failures.push(...(renderedAudit.renderedPageFailures.get(file) ?? []))
    for (const componentPath of renderedAudit.renderedImportsByPage.get(file) ?? []) {
      const renderedTarget = sourceImportPath(docsRoot, file, componentPath)
      if (!disclosedTargets.has(renderedTarget)) {
        failures.push(`${relative(docsRoot, file)}: rendered component does not disclose its source: ${componentPath}`)
      }
    }
  }
  failures.push(...renderedAudit.auditFailures)

  const gettingStarted = content.get(join(guideRoot, 'index.md')) ?? ''
  const frontmatterEnd = gettingStarted.indexOf('\n---', 4)
  const frontmatter = frontmatterEnd > 0 ? gettingStarted.slice(4, frontmatterEnd) : ''
  const frontmatterLines = frontmatter.split('\n')
  const nextIndex = frontmatterLines.findIndex(line => line.trim() === 'next:')
  const nextRoute = frontmatterLines
    .slice(nextIndex + 1)
    .find(line => line.trim().startsWith('link:'))
    ?.trim()
    .slice('link:'.length)
    .trim()

  if (!nextRoute)
    failures.push('guide/index.md: Getting Started must define a next-page link')
  else if (nextRoute === '/guide/' || nextRoute === '/guide')
    failures.push('guide/index.md: Getting Started next-page link points to itself')
  else if (!content.has(fileForRoute(docsRoot, nextRoute)))
    failures.push(`guide/index.md: Getting Started next-page target does not exist: ${nextRoute}`)

  if (guideRoutes.has('/guide/migration'))
    failures.push('/guide/migration: obsolete migration route must not be authored')
  if (config.includes('/guide/migration'))
    failures.push('/guide/migration: obsolete migration route must not appear in navigation')

  if (options.checkAdapterPackages !== false)
    await checkAdapterCompatibility(docsRoot, content, failures)

  return failures
}

async function writeFixture(root) {
  await Promise.all([
    writeFile(join(root, '.vitepress', 'config.mts'), `
const Start = [
  { text: 'Getting started', link: '/guide/' },
]

const More = [
  { text: 'Details', link: '/guide/details' },
  { text: 'Balanced destination', link: '/guide/details_(advanced)' },
  { text: "Reader's guide", link: "/guide/reader's-guide" },
  { text: 'Author\\'s note', link: '/guide/author\\'s-note' },
]

export default {
  themeConfig: {
    sidebar: [
      { text: 'Start', items: Start },
      { text: 'More', items: More },
    ],
  },
}
`),
    writeFile(join(root, 'index.md'), '# Home\n'),
    writeFile(join(root, 'guide', 'index.md'), `---
next:
  text: Details
  link: /guide/details
---

<script setup>
import AccessibleExample from '../.vitepress/examples/AccessibleExample.vue'
import DescendantExample from '../.vitepress/examples/DescendantExample.vue'
import GroupExample from '../.vitepress/examples/GroupExample.vue'
import SlottedExample from '../.vitepress/examples/SlottedExample.vue'
</script>

# Getting started

<AccessibleExample />
<DescendantExample />
<GroupExample />
<SlottedExample />

<<< ../.vitepress/examples/AccessibleExample.vue
<<< ../.vitepress/examples/DescendantExample.vue
<<< ../.vitepress/examples/GroupExample.vue
<<< ../.vitepress/examples/SlottedExample.vue

[Details](/guide/details#details)
[Balanced](./details_(advanced)#balanced)
[Escaped](./details_\\(advanced\\)#balanced)
[Nested [label]](./details_(advanced)#balanced)
[Escaped \\[label\\]](./details_(advanced)#balanced)
[Reader's guide](./reader's-guide#readers-guide)
[Author's note](./author's-note#authors-note)

\`\`\`vue
<form novalidate aria-describedby="required-instructions" @submit.prevent="submit">
  <p id="required-instructions">Email and password are required.</p>
  <label for="email">Email</label>
  <input id="email" required :aria-invalid="errorsFor('email').length > 0" aria-describedby="email-errors">
  <p id="email-errors" aria-live="polite">{{ errorsFor('email')[0] }}</p>

  <label>Password
    <input id="password" required :aria-invalid="errorsFor('password').length > 0" aria-describedby="password-errors">
  </label>
  <ul id="password-errors" role="alert">
    <li v-for="error in errorsFor('password')" :key="error.path">{{ error.message }}</li>
  </ul>

  <input id="username" aria-label="Username" data-validation-optional :aria-invalid="errorsFor('username').length > 0" aria-describedby="username-errors">
  <p id="username-errors" aria-live="assertive">{{ errorsFor('username')[0] }}</p>

  <span id="postcode-label">Postcode</span>
  <input id="postcode" aria-labelledby="postcode-label" data-validation-optional :aria-invalid="errorsFor('postcode').length > 0" aria-describedby="postcode-errors">
  <p id="postcode-errors" role="status">{{ errorsFor('postcode')[0] }}</p>
</form>

<form novalidate>
  <label for="referral-code">Referral code (optional)</label>
  <input id="referral-code" data-validation-optional :aria-invalid="errorsFor('referralCode').length > 0" aria-describedby="referral-code-errors">
  <p id="referral-code-errors" aria-live="polite">{{ errorsFor('referralCode')[0] }}</p>
</form>
\`\`\`

\`\`\`vue [ContactForm.vue]
<script setup>
const { issues, validate } = useValidation()
</script>

<template>
  <form novalidate aria-describedby="issues-required-instructions" @submit.prevent="validate">
    <p id="issues-required-instructions">Email is required.</p>
    <label for="issues-email">Email</label>
    <input
      id="issues-email"
      required
      :aria-invalid="issues.length > 0"
      :aria-describedby="issues.length ? 'issues-email-errors' : undefined"
    >
    <p id="issues-email-errors" v-show="issues.length" aria-live="polite">{{ issues[0]?.message }}</p>
  </form>
</template>
\`\`\`

\`\`\`vue [ImportedRoot.vue]
<script setup>
import FallbackParent from '@/guide/FallbackParent.vue'
import ImportedForm from '@/guide/ImportedForm.vue'
</script>

<template>
  <FallbackParent />
  <ImportedForm />
</template>
\`\`\`

[Final [nested label]](./details_(advanced)#balanced)
`),
    writeFile(join(root, '.vitepress', 'examples', 'AccessibleExample.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <template v-if="true">
    <p>Nested template content</p>
  </template>
  <form novalidate aria-describedby="example-required-instructions">
    <p id="example-required-instructions">Email is required.</p>
    <label for="example-email">Email</label>
    <input id="example-email" required :aria-invalid="errorsFor('email').length > 0" aria-describedby="example-email-errors">
    <p id="example-email-errors" aria-live="polite">{{ errorsFor('email')[0] }}</p>

    <div v-if="showContacts" v-for="(contact, index) in contacts" :key="index">
      <label :for="\`example-contact-\${index}\`">Contact {{ index + 1 }}</label>
      <input
        :id="\`example-contact-\${index}\`"
        v-model="contact.email"
        data-validation-optional
        :aria-invalid="errorsFor(['contacts', index, 'email']).length > 0"
        :aria-describedby="\`example-contact-\${index}-errors example-contact-\${index}-state\`"
      >
      <p :id="\`example-contact-\${index}-errors\`" aria-live="polite">{{ errorsFor(['contacts', index, 'email'])[0] }}</p>
      <p :id="\`example-contact-\${index}-state\`">Current row</p>
    </div>
  </form>
  <form novalidate>
    <label for="example-referral-code">Referral code (optional)</label>
    <input id="example-referral-code" data-validation-optional :aria-invalid="errorsFor('referralCode').length > 0" aria-describedby="example-referral-code-errors">
    <p id="example-referral-code-errors" aria-live="polite">{{ errorsFor('referralCode')[0] }}</p>
  </form>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'DescendantExample.vue'), `<script setup>
import Logo from './Logo.vue'
import RequiredNameField from './RequiredNameField.vue'
import RequiredPhoneField from './RequiredPhoneField.vue'
</script>

<template>
  <form novalidate aria-describedby="descendant-required-instructions">
    <p id="descendant-required-instructions">Name and phone are required.</p>
    <Logo />
    <RequiredNameField />
    <RequiredPhoneField />
  </form>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'RequiredNameField.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <label for="descendant-name">Name</label>
  <input id="descendant-name" required :aria-invalid="errorsFor('name').length > 0" aria-describedby="descendant-name-errors">
  <p id="descendant-name-errors" aria-live="polite">{{ errorsFor('name')[0] }}</p>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'RequiredPhoneField.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <label for="descendant-phone">Phone</label>
  <input id="descendant-phone" required :aria-invalid="errorsFor('phone').length > 0" aria-describedby="descendant-phone-errors">
  <p id="descendant-phone-errors" aria-live="polite">{{ errorsFor('phone')[0] }}</p>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'Logo.vue'), `<template>
  <span aria-hidden="true">V</span>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'LoopChild.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <label for="loop-child-value">Loop child (optional)</label>
  <input id="loop-child-value" data-validation-optional :aria-invalid="errorsFor('value').length > 0" aria-describedby="loop-child-value-errors">
  <p id="loop-child-value-errors" aria-live="polite">{{ errorsFor('value')[0] }}</p>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'OptionalChild.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <label for="optional-child-note">Note (optional)</label>
  <input id="optional-child-note" data-validation-optional :aria-invalid="errorsFor('note').length > 0" aria-describedby="optional-child-note-errors">
  <p id="optional-child-note-errors" aria-live="polite">{{ errorsFor('note')[0] }}</p>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'OptionalParent.vue'), `<script setup>
import OptionalChild from './OptionalChild.vue'
</script>

<template>
  <form novalidate>
    <OptionalChild />
  </form>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'GroupExample.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <form novalidate aria-describedby="preferences-required-instructions preferences-errors">
    <p id="preferences-required-instructions">Country and at least one contact method are required.</p>
    <p id="preferences-errors" v-show="errorsFor('form').length" aria-live="polite">{{ errorsFor('form')[0] }}</p>

    <label for="preferences-country">Country</label>
    <select id="preferences-country" required data-validation-skip>
      <option value="gb">United Kingdom</option>
    </select>
    <button type="button" aria-describedby="preferences-required-instructions">Why?</button>

    <fieldset data-validation-required-group aria-describedby="contact-method-required-instructions contact-method-errors">
      <legend>Contact methods — at least one is required</legend>
      <p id="contact-method-required-instructions">Choose at least one contact method; one choice is required.</p>
      <label>
        <input type="checkbox" :aria-invalid="errorsFor('contactMethods').length > 0" aria-describedby="contact-method-required-instructions contact-method-errors">
        Email
      </label>
      <label>
        <input type="checkbox" :aria-invalid="errorsFor('contactMethods').length > 0" aria-describedby="contact-method-required-instructions contact-method-errors">
        Phone
      </label>
      <p id="contact-method-errors" v-show="errorsFor('contactMethods').length" aria-live="polite">{{ errorsFor('contactMethods')[0] }}</p>
    </fieldset>
  </form>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'FormWrapper.vue'), `<template>
  <form novalidate>
    <slot />
  </form>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'SlottedExample.vue'), `<script setup>
import FormWrapper from './FormWrapper.vue'

const errorsFor = () => []
</script>

<template>
  <FormWrapper>
    <label for="slotted-name">Name (optional)</label>
    <input :id="\`slotted-name\`" data-validation-optional :aria-invalid="errorsFor('name').length > 0" aria-describedby="slotted-name-errors">
    <p id="slotted-name-errors" aria-live="polite">{{ errorsFor('name')[0] }}</p>
  </FormWrapper>
</template>
`),
    writeFile(join(root, '.vitepress', 'examples', 'ChildField.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <label for="child-name">Name</label>
  <input id="child-name" :aria-invalid="errorsFor('name').length > 0" aria-describedby="child-name-errors">
  <p id="child-name-errors" role="alert">{{ errorsFor('name')[0] }}</p>
</template>
`),
    writeFile(join(root, 'guide', 'details.md'), '# Details\n'),
    writeFile(join(root, 'guide', 'ImportedForm.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <form novalidate>
    <label for="imported-note">Note (optional)</label>
    <input id="imported-note" data-validation-optional :aria-invalid="errorsFor('note').length > 0" aria-describedby="imported-note-errors">
    <p id="imported-note-errors" aria-live="polite">{{ errorsFor('note')[0] }}</p>
  </form>
</template>
`),
    writeFile(join(root, 'guide', 'FallbackParent.vue'), `<script setup>
import FallbackWrapper from './FallbackWrapper.vue'
</script>

<template>
  <FallbackWrapper>
    <span>Provided content</span>
  </FallbackWrapper>
</template>
`),
    writeFile(join(root, 'guide', 'FallbackWrapper.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <form novalidate>
    <slot>
      <label for="fallback-name">Fallback name</label>
      <input id="fallback-name" :aria-invalid="errorsFor('name').length > 0" aria-describedby="fallback-name-errors">
      <p id="fallback-name-errors" aria-live="polite">{{ errorsFor('name')[0] }}</p>
    </slot>
  </form>
</template>
`),
    writeFile(join(root, 'guide', 'details_(advanced).md'), '# Balanced\n'),
    writeFile(join(root, 'guide', 'reader\'s-guide.md'), '# Reader\'s guide\n'),
    writeFile(join(root, 'guide', 'author\'s-note.md'), '# Author\'s note\n'),
  ])
}

async function runSelfTest() {
  const compatibilityTable = '| `@verific/i18next` | `i18next` | `>=26 <27` | `26.4.0` |'
  assert.equal(compatibilityEntryMatches(
    compatibilityTable,
    '@verific/i18next',
    'i18next',
    '>=26 <27',
    '26.4.0',
  ), true)
  assert.equal(compatibilityEntryMatches(
    compatibilityTable.replace('>=26 <27', '>=25 <27'),
    '@verific/i18next',
    'i18next',
    '>=26 <27',
    '26.4.0',
  ), false)

  const fixtureRoot = await mkdtemp(join(tmpdir(), 'verific-docs-check-'))
  const outsideRoot = await mkdtemp(join(tmpdir(), 'verific-docs-outside-'))

  try {
    await Promise.all([
      mkdir(join(fixtureRoot, '.vitepress'), { recursive: true }),
      mkdir(join(fixtureRoot, '.vitepress', 'examples'), { recursive: true }),
      mkdir(join(fixtureRoot, 'guide'), { recursive: true }),
    ])
    await writeFixture(fixtureRoot)
    const outsideComponent = join(outsideRoot, 'Escaped.vue')
    await writeFile(outsideComponent, '<template><form /></template>\n')
    await writeFile(join(fixtureRoot, 'guide', 'CycleRoot.vue'), `<script setup>
import CycleRoot from './cycle/CycleRoot.vue'
</script>

<template>
  <CycleRoot />
</template>
`)
    await writeFile(join(fixtureRoot, 'guide', 'ComponentFallbackWrapper.vue'), `<script setup>
import FallbackForm from './FallbackForm.vue'
</script>

<template>
  <slot><FallbackForm /></slot>
</template>
`)
    await writeFile(join(fixtureRoot, 'guide', 'FallbackForm.vue'), `<script setup>
const errorsFor = () => []
</script>

<template>
  <form novalidate>
    <label for="fallback-component-name">Name</label>
    <input id="fallback-component-name" :aria-invalid="errorsFor('name').length > 0" aria-describedby="fallback-component-errors">
    <p id="fallback-component-errors" aria-live="polite">{{ errorsFor('name')[0] }}</p>
  </form>
</template>
`)
    await symlink(outsideComponent, join(fixtureRoot, 'guide', 'Escaped.vue'))
    await symlink('.', join(fixtureRoot, 'guide', 'cycle'))
    assert.deepEqual(await checkDocs(fixtureRoot, { checkAdapterPackages: false }), [])

    const configPath = join(fixtureRoot, '.vitepress', 'config.mts')
    const detailsPath = join(fixtureRoot, 'guide', 'details.md')
    const indexPath = join(fixtureRoot, 'guide', 'index.md')
    const examplePath = join(fixtureRoot, '.vitepress', 'examples', 'AccessibleExample.vue')
    const childPath = join(fixtureRoot, '.vitepress', 'examples', 'ChildField.vue')
    const descendantPath = join(fixtureRoot, '.vitepress', 'examples', 'DescendantExample.vue')
    const fallbackParentPath = join(fixtureRoot, 'guide', 'FallbackParent.vue')
    const groupPath = join(fixtureRoot, '.vitepress', 'examples', 'GroupExample.vue')
    const importedFormPath = join(fixtureRoot, 'guide', 'ImportedForm.vue')
    const namePath = join(fixtureRoot, '.vitepress', 'examples', 'RequiredNameField.vue')
    const phonePath = join(fixtureRoot, '.vitepress', 'examples', 'RequiredPhoneField.vue')
    const slottedPath = join(fixtureRoot, '.vitepress', 'examples', 'SlottedExample.vue')
    const [
      originalConfig,
      originalDetails,
      originalIndex,
      originalExample,
      originalChild,
      originalDescendant,
      originalFallbackParent,
      originalGroup,
      originalImportedForm,
      originalName,
      originalPhone,
      originalSlotted,
    ] = await Promise.all([
      readFile(configPath, 'utf8'),
      readFile(detailsPath, 'utf8'),
      readFile(indexPath, 'utf8'),
      readFile(examplePath, 'utf8'),
      readFile(childPath, 'utf8'),
      readFile(descendantPath, 'utf8'),
      readFile(fallbackParentPath, 'utf8'),
      readFile(groupPath, 'utf8'),
      readFile(importedFormPath, 'utf8'),
      readFile(namePath, 'utf8'),
      readFile(phonePath, 'utf8'),
      readFile(slottedPath, 'utf8'),
    ])
    const originals = new Map([
      [configPath, originalConfig],
      [detailsPath, originalDetails],
      [indexPath, originalIndex],
      [examplePath, originalExample],
      [childPath, originalChild],
      [descendantPath, originalDescendant],
      [fallbackParentPath, originalFallbackParent],
      [groupPath, originalGroup],
      [importedFormPath, originalImportedForm],
      [namePath, originalName],
      [phonePath, originalPhone],
      [slottedPath, originalSlotted],
    ])
    const vueIndex = '$' + '{index}'
    const vueModuloOne = '$' + '{index % 1}'
    const vueModuloTwo = '$' + '{index % 2}'
    const vueIndexCall = '$' + '{String(index)}'
    const vueIndexIife = '$' + '{((value) => value)(index)}'
    const vueIndexSuffix = '$' + '{index}' + '$' + '{suffix}'
    const vueIndexCollision = '$' + '{index}' + '$' + '{index === 1 ? \'0\' : \'\'}'
    const vueOuterIndex = '$' + '{outerIndex}'
    const vueOuterKey = '$' + '{outerKey}'
    const vueRowKey = '$' + '{rowKey}'
    const vueFormId = '$' + '{formId}'
    const dynamicContactDescription = `:aria-describedby="\`example-contact-${vueIndex}-errors example-contact-${vueIndex}-state\`"`
    const brokenDynamicContactDescription = dynamicContactDescription.replace('-errors', '-missing')
    const exampleWithoutRequiredSemantics = originalExample
      .replace(' aria-describedby="example-required-instructions"', '')
      .replace('    <p id="example-required-instructions">Email is required.</p>\n', '')
      .replace(' id="example-email" required', ' id="example-email"')
    const shadowedLoopExample = originalExample
      .replace('      <input\n', '      <template v-for="(note, index) in notes">\n      <input\n')
      .replace('      >\n      <p :id=', '      >\n      </template>\n      <p :id=')
    const dynamicBlockStart = originalExample.indexOf('    <div v-if="showContacts"')
    const dynamicBlockEnd = originalExample.indexOf('    </div>', dynamicBlockStart) + '    </div>'.length
    const dynamicBlock = originalExample.slice(dynamicBlockStart, dynamicBlockEnd)
    const independentLoopExample = originalExample.replace(
      dynamicBlock,
      `${dynamicBlock}\n${dynamicBlock.replace(' in contacts"', ' in backupContacts"')}`,
    )
    const renamedIndependentLoopExample = originalExample.replace(
      dynamicBlock,
      `${dynamicBlock}\n${dynamicBlock.replaceAll('index', 'rowIndex').replace(' in contacts"', ' in backupContacts"')}`,
    )
    const unrelatedLoopIdExample = originalExample.replaceAll(vueIndex, vueFormId)
    const moduloOneLoopIdExample = originalExample.replaceAll(vueIndex, vueModuloOne)
    const moduloTwoLoopIdExample = originalExample.replaceAll(vueIndex, vueModuloTwo)
    const calledLoopIdExample = originalExample.replaceAll(vueIndex, vueIndexCall)
    const iifeLoopIdExample = originalExample.replaceAll(vueIndex, vueIndexIife)
    const suffixedLoopIdExample = originalExample.replaceAll(vueIndex, vueIndexSuffix)
    const conditionallyCollidingLoopIdExample = originalExample.replaceAll(vueIndex, vueIndexCollision)
    const nestedAdjacentLoopIdExample = originalExample.replace(
      dynamicBlock,
      `<div v-for="(_, outerIndex) in groups" :key="outerIndex">\n${dynamicBlock.replaceAll(vueIndex, `${vueOuterIndex}${vueIndex}`)}\n    </div>`,
    )
    const nestedDigitSeparatedLoopIdExample = originalExample.replace(
      dynamicBlock,
      `<div v-for="(_, outerIndex) in groups" :key="outerIndex">\n${dynamicBlock.replaceAll(vueIndex, `${vueOuterIndex}1${vueIndex}`)}\n    </div>`,
    )
    const nestedKeyDelimitedLoopIdExample = originalExample.replace(
      dynamicBlock,
      `<div v-for="(_, outerKey) in groups" :key="outerKey">\n${dynamicBlock
        .replace('v-for="(contact, index) in contacts"', 'v-for="(contact, rowKey) in contacts"')
        .replaceAll(vueIndex, `${vueOuterKey}-${vueRowKey}`)}\n    </div>`,
    )
    const nestedGroupExample = originalGroup
      .replace('      <label>\n        <input type="checkbox"', '      <fieldset>\n        <legend>Nested choices</legend>\n      <label>\n        <input type="checkbox"')
      .replace('      <p id="contact-method-errors"', '      </fieldset>\n      <p id="contact-method-errors"')
    const fourBacktickIndex = originalIndex
      .replace('```vue [ContactForm.vue]', '````vue [ContactForm.vue]')
      .replace('</template>\n```\n\n```vue [ImportedRoot.vue]', '</template>\n````\n\n```vue [ImportedRoot.vue]')
      .replace('<form novalidate aria-describedby="issues-required-instructions"', '<form aria-describedby="issues-required-instructions"')
    const eofFenceIndex = originalIndex.concat('\n\n```vue\n<form></form>\n')
    const outerTemplateLoopIndex = originalIndex.concat(`

\`\`\`vue
<template v-for="row in rows">
  <form novalidate>
    <label for="loop-static">Loop value (optional)</label>
    <input id="loop-static" data-validation-optional :aria-invalid="row.invalid" aria-describedby="loop-static-errors">
    <p id="loop-static-errors" aria-live="polite">{{ row.error }}</p>
  </form>
</template>
\`\`\`
`)
    const outerTemplateIfIndex = originalIndex.concat(`

\`\`\`vue
<template v-if="showError">
  <p id="outer-template-errors" aria-live="polite">Error</p>
</template>
<form novalidate>
  <label for="outer-template-control">Value (optional)</label>
  <input id="outer-template-control" data-validation-optional :aria-invalid="showError" aria-describedby="outer-template-errors">
</form>
\`\`\`
`)
    const directLoopIndex = originalIndex.concat(`

\`\`\`vue
<form novalidate>
  <p id="direct-loop-help">Each repeated row is optional.</p>
  <div v-for="(_, index) in rows" :key="index">
    <label :for="\`direct-row-${vueIndex}\`">Row value</label>
    <input :id="\`direct-row-${vueIndex}\`" data-validation-skip>
  </div>
</form>
\`\`\`
`)
    const arrayThirdAliasIndex = originalIndex.concat(`

\`\`\`vue
<form novalidate>
  <div v-for="(_, rowKey, ordinal) in ['first', 'second']" :key="rowKey">
    <label :for="ordinal">Row value</label>
    <input :id="ordinal" data-validation-skip>
  </div>
</form>
\`\`\`
`)
    const rangeThirdAliasIndex = originalIndex.concat(`

\`\`\`vue
<form novalidate>
  <div v-for="(_, rowKey, ordinal) in 3" :key="rowKey">
    <label :for="ordinal">Range value</label>
    <input :id="ordinal" data-validation-skip>
  </div>
</form>
\`\`\`
`)
    const unusedNativeNameImportIndex = originalIndex.replace(
      'import AccessibleExample from \'../.vitepress/examples/AccessibleExample.vue\'',
      'import Input from \'@/guide/ImportedForm.vue\'\nimport AccessibleExample from \'../.vitepress/examples/AccessibleExample.vue\'',
    )
    const slottedBodyStart = originalSlotted.indexOf('    <label for="slotted-name">')
    const slottedBodyEnd = originalSlotted.indexOf('  </FormWrapper>', slottedBodyStart)
    assert.notEqual(slottedBodyStart, -1, 'Named-slot compatibility fixture start is missing')
    assert.notEqual(slottedBodyEnd, -1, 'Named-slot compatibility fixture end is missing')
    const slottedBody = originalSlotted.slice(slottedBodyStart, slottedBodyEnd)
    const slottedBranchVariant = originalSlotted.replace(
      slottedBody,
      `    <template #default v-if="mode">\n${slottedBody}    </template>\n    <template #default v-else>\n${slottedBody}    </template>\n`,
    )
    const compatibleVariants = [
      {
        name: 'exhaustive conditional slot content',
        original: originalFallbackParent,
        path: fallbackParentPath,
        source: originalFallbackParent.replace(
          '<span>Provided content</span>',
          '<template v-if="mode"><span>A</span></template>\n    <template v-else><span>B</span></template>',
        ),
      },
      {
        name: 'interpolation-only slot content',
        original: originalFallbackParent,
        path: fallbackParentPath,
        source: originalFallbackParent.replace('<span>Provided content</span>', '{{ maybe }}'),
      },
      {
        name: 'mutually exclusive named-slot branches with shared ids',
        original: originalSlotted,
        path: slottedPath,
        source: slottedBranchVariant,
      },
      {
        name: 'direct loop index ids',
        original: originalIndex,
        path: indexPath,
        source: directLoopIndex,
      },
      {
        name: 'unused Input import does not match native input',
        original: originalIndex,
        path: indexPath,
        source: unusedNativeNameImportIndex,
      },
      {
        name: 'bound literal accessible name',
        original: originalIndex,
        path: indexPath,
        source: originalIndex.replace('aria-label="Username"', ':aria-label="\'Username\'"'),
      },
      {
        name: 'literal false optional aria-required',
        original: originalIndex,
        path: indexPath,
        source: originalIndex.replace('data-validation-optional :aria-invalid="errorsFor(\'username\')', 'data-validation-optional :aria-required="false" :aria-invalid="errorsFor(\'username\')'),
      },
      {
        name: 'literal true native boolean bindings',
        original: originalIndex,
        path: indexPath,
        source: originalIndex
          .replace('<form novalidate aria-describedby="required-instructions"', '<form :novalidate="true" aria-describedby="required-instructions"')
          .replace(' id="email" required ', ' id="email" :required="true" '),
      },
      {
        name: 'visible aria-hidden false accessible name',
        original: originalIndex,
        path: indexPath,
        source: originalIndex.replace('<span id="postcode-label">', '<span aria-hidden="false" id="postcode-label">'),
      },
      {
        name: 'literal imported dynamic component',
        original: originalIndex,
        path: indexPath,
        source: originalIndex.replace('<AccessibleExample />', '<component :is="AccessibleExample" />'),
      },
      {
        name: 'inline component example is prose',
        original: originalIndex,
        path: indexPath,
        source: originalIndex.replace('# Getting started', '# Getting started\n\nUse `<AccessibleExample />` to render the demo.'),
      },
      {
        name: 'multiline inline component example is prose',
        original: originalIndex,
        path: indexPath,
        source: originalIndex.replace('# Getting started', '# Getting started\n\nUse `<AccessibleExample\n/>` to render the demo.'),
      },
    ]
    for (const variant of compatibleVariants) {
      assert.notEqual(variant.source, variant.original, `Compatibility fixture did not change: ${variant.name}`)
      await writeFile(variant.path, variant.source)
      assert.deepEqual(
        await checkDocs(fixtureRoot, { checkAdapterPackages: false }),
        [],
        `Expected compatible ${variant.name} to pass`,
      )
      await writeFile(variant.path, variant.original)
    }

    const mutations = [
      { name: 'sidebar source omission', path: configPath, mutated: originalConfig.replace('  { text: \'Details\', link: \'/guide/details\' },\n', ''), expected: 'missing from the sidebar' },
      { name: 'sidebar group omission', path: configPath, mutated: originalConfig.replace('      { text: \'More\', items: More },\n', ''), expected: '/guide/details: guide page is missing from the sidebar' },
      { name: 'missing Markdown link target', path: indexPath, mutated: originalIndex.replace('/guide/details#details', '/guide/missing'), expected: 'link target does not exist' },
      { name: 'missing Markdown link anchor', path: indexPath, mutated: originalIndex.replace('#details)', '#missing)'), expected: 'link anchor does not exist' },
      { name: 'balanced Markdown destination anchor', path: indexPath, mutated: originalIndex.replace('./details_(advanced)#balanced', './details_(advanced)#missing'), expected: 'link anchor does not exist: ./details_(advanced)#missing' },
      { name: 'apostrophe Markdown destination', path: indexPath, mutated: originalIndex.replace('./reader\'s-guide#readers-guide', './reader\'s-missing#readers-guide'), expected: 'link target does not exist: ./reader\'s-missing#readers-guide' },
      { name: 'unclosed Markdown destination', path: indexPath, mutated: originalIndex.replace('[Final [nested label]](./details_(advanced)#balanced)', '[Final [nested label]](./details_(advanced)#balanced'), expected: 'Markdown link has an unclosed destination' },
      { name: 'self-referencing next link', path: indexPath, mutated: originalIndex.replace('link: /guide/details', 'link: /guide/'), expected: 'points to itself' },
      { name: 'escaping virtual fence label', path: indexPath, mutated: originalIndex.replace('[ContactForm.vue]', '[../.vitepress/examples/AccessibleExample.vue]'), expected: 'label resolves outside its virtual example directory' },
      { name: 'four-backtick Vue fence is audited', path: indexPath, mutated: fourBacktickIndex, expected: 'complete form is missing native validation bypass' },
      { name: 'ContactForm Vue highlighted-line fence is audited', path: indexPath, mutated: originalIndex.replace('```vue [ContactForm.vue]', '```vue{1} [ContactForm.vue]').replace('<form novalidate aria-describedby="issues-required-instructions"', '<form aria-describedby="issues-required-instructions"'), expected: 'complete form is missing native validation bypass' },
      { name: 'vue-html fence is audited', path: indexPath, mutated: originalIndex.replace('```vue\n<form novalidate aria-describedby="required-instructions"', '```vue-html\n<form aria-describedby="required-instructions"'), expected: 'complete form is missing native validation bypass' },
      { name: 'EOF-closed Vue fence is audited', path: indexPath, mutated: eofFenceIndex, expected: 'complete form is missing native validation bypass' },
      { name: 'outer template v-for remains auditable', path: indexPath, mutated: outerTemplateLoopIndex, expected: 'id "loop-static" is repeated by v-for and must depend on every loop binding' },
      { name: 'outer template v-if remains auditable', path: indexPath, mutated: outerTemplateIfIndex, expected: 'references conditionally or multiply mounted target "outer-template-errors" through aria-describedby' },
      { name: 'duplicate rendered page component', path: indexPath, mutated: originalIndex.replace('<AccessibleExample />', '<AccessibleExample />\n<AccessibleExample />'), expected: 'duplicate id "example-email" can be mounted more than once' },
      { name: 'rendered page component repeated by v-for', path: indexPath, mutated: originalIndex.replace('<AccessibleExample />', '<AccessibleExample v-for="example in examples" :key="example.id" />'), expected: 'id "example-email" is repeated by v-for and must depend on every loop binding' },
      { name: 'kebab-case rendered page component repeated by v-for', path: indexPath, mutated: originalIndex.replace('<AccessibleExample />', '<accessible-example v-for="example in examples" :key="example.id" />'), expected: 'id "example-email" is repeated by v-for and must depend on every loop binding' },
      { name: 'dynamic rendered page component repeated by v-for', path: indexPath, mutated: originalIndex.replace('<AccessibleExample />', '<component :is="AccessibleExample" v-for="copy in 2" :key="copy" />'), expected: 'id "example-email" is repeated by v-for and must depend on every loop binding' },
      { name: 'only unknown dynamic rendered page component', path: indexPath, mutated: originalIndex.replace('<AccessibleExample />\n<DescendantExample />\n<GroupExample />\n<SlottedExample />', '<component :is="selectedExample" />'), expected: 'dynamic <component :is> must name one imported Vue component literally' },
      { name: 'unknown dynamic component on no-import Markdown page', path: detailsPath, mutated: `${originalDetails}\n<component :is="selectedExample" />\n`, expected: 'dynamic <component :is> must name one imported Vue component literally' },
      { name: 'inline code does not hide rendered component', path: indexPath, mutated: originalIndex.replace('<AccessibleExample />', '`<AccessibleExample />`\n<AccessibleExample />\n<AccessibleExample />'), expected: 'duplicate id "example-email" can be mounted more than once' },
      { name: 'escaped backticks do not hide rendered component', path: indexPath, mutated: originalIndex.replace('<AccessibleExample />', '\\`<AccessibleExample />\\`\n<AccessibleExample />'), expected: 'duplicate id "example-email" can be mounted more than once' },
      { name: 'HTML attribute backticks do not hide rendered components', path: indexPath, mutated: originalIndex.replace('<AccessibleExample />', '<span title="`"></span>\n<AccessibleExample />\n<span title="`"></span>\n<AccessibleExample />'), expected: 'duplicate id "example-email" can be mounted more than once' },
      { name: 'imported Markdown root form', path: importedFormPath, mutated: originalImportedForm.replace('<form novalidate>', '<form>'), expected: 'complete form is missing native validation bypass' },
      { name: 'canonical component cycle identity', path: indexPath, mutated: originalIndex.replace('import ImportedForm from \'@/guide/ImportedForm.vue\'', 'import CycleRoot from \'@/guide/CycleRoot.vue\'').replace('  <ImportedForm />', '  <CycleRoot />'), expected: 'component cycle prevents auditing <CycleRoot>' },

      // Bound adversarial form-audit matrix.
      { name: 'issues/validate Markdown form without novalidate', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="issues-required-instructions"', '<form aria-describedby="issues-required-instructions"'), expected: 'complete form is missing native validation bypass' },
      { name: 'bound false required', path: indexPath, mutated: originalIndex.replace(' id="email" required ', ' id="email" :required="false" '), expected: 'control "email" required must be static or a literal true binding' },
      { name: 'bound false optional required', path: indexPath, mutated: originalIndex.replace(' id="username" aria-label="Username" data-validation-optional', ' id="username" :required="false" aria-label="Username" data-validation-optional'), expected: 'control "username" required must be static or a literal true binding' },
      { name: 'unresolved optional required', path: indexPath, mutated: originalIndex.replace(' id="username" aria-label="Username" data-validation-optional', ' id="username" :required="isRequired" aria-label="Username" data-validation-optional'), expected: 'control "username" required must be static or a literal true binding' },
      { name: 'unknown optional aria-required', path: indexPath, mutated: originalIndex.replace(' id="username" aria-label="Username" data-validation-optional', ' id="username" aria-label="Username" data-validation-optional :aria-required="isRequired"'), expected: 'control "username" aria-required must be a literal true or false' },
      { name: 'requiredness supplied through object v-bind', path: indexPath, mutated: originalIndex.replace(' id="username" aria-label="Username" data-validation-optional', ' id="username" aria-label="Username" data-validation-optional v-bind="{ required: true }"'), expected: 'validation-critical attributes cannot be supplied through argumentless v-bind on <input>' },
      { name: 'label target supplied through object v-bind', path: indexPath, mutated: originalIndex.replace('<label for="email">Email</label>', '<label for="email" v-bind="{ for: \'password\' }">Email</label>'), expected: 'validation-critical attributes cannot be supplied through argumentless v-bind on <label>' },
      { name: 'id owner supplied through object v-bind', path: indexPath, mutated: originalIndex.replace('<p id="email-errors" aria-live="polite">', '<p id="email-errors" v-bind="{ id: \'overwritten-errors\' }" aria-live="polite">'), expected: 'validation-critical attributes cannot be supplied through argumentless v-bind on <p>' },
      { name: 'bound false novalidate', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="required-instructions"', '<form :novalidate="false" aria-describedby="required-instructions"'), expected: 'novalidate must be static or a literal true binding' },
      { name: 'unresolved novalidate', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="required-instructions"', '<form :novalidate="disableNative" aria-describedby="required-instructions"'), expected: 'novalidate must be static or a literal true binding' },
      { name: 'bound false then static novalidate', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="required-instructions"', '<form :novalidate="false" novalidate aria-describedby="required-instructions"'), expected: 'novalidate must be declared exactly once' },
      { name: 'static then bound false novalidate', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="required-instructions"', '<form novalidate :novalidate="false" aria-describedby="required-instructions"'), expected: 'novalidate must be declared exactly once' },
      { name: 'bound false then static required', path: indexPath, mutated: originalIndex.replace(' id="email" required ', ' id="email" :required="false" required '), expected: 'control "email" required must be declared exactly once' },
      { name: 'static then bound false required', path: indexPath, mutated: originalIndex.replace(' id="email" required ', ' id="email" required :required="false" '), expected: 'control "email" required must be declared exactly once' },
      { name: 'native required conflicts with aria false', path: indexPath, mutated: originalIndex.replace(' id="email" required ', ' id="email" required aria-required="false" '), expected: 'control "email" cannot combine native required with aria-required=false' },
      { name: 'valued static skip does not exempt', path: groupPath, mutated: originalGroup.replace(' required data-validation-skip>', ' required data-validation-skip="false">'), expected: ['data-validation-skip must be a valueless static attribute', 'control "preferences-country" needs a dynamic aria-invalid state'] },
      { name: 'bound skip does not exempt', path: groupPath, mutated: originalGroup.replace(' required data-validation-skip>', ' required :data-validation-skip="false">'), expected: ['data-validation-skip must be a valueless static attribute', 'control "preferences-country" needs a dynamic aria-invalid state'] },
      { name: 'static aria-invalid false', path: indexPath, mutated: originalIndex.replace(':aria-invalid="errorsFor(\'password\').length > 0"', 'aria-invalid="false"'), expected: 'control "password" needs a dynamic aria-invalid state' },
      { name: 'literal bound aria-invalid false', path: indexPath, mutated: originalIndex.replace(':aria-invalid="errorsFor(\'password\').length > 0"', ':aria-invalid="false"'), expected: 'control "password" needs a dynamic aria-invalid state' },
      { name: 'error target directly repeated by v-for', path: indexPath, mutated: originalIndex.replace('<ul id="password-errors" role="alert">', '<ul v-for="error in errorsFor(\'password\')" id="password-errors" role="alert">'), expected: 'id "password-errors" is repeated by v-for and must depend on every loop binding' },
      { name: 'constant template id repeated by v-for', path: indexPath, mutated: originalIndex.replace('<ul id="password-errors" role="alert">', '<ul v-for="error in errorsFor(\'password\')" :id="`password-errors`" role="alert">'), expected: 'id "password-errors" is repeated by v-for and must depend on every loop binding' },
      { name: 'conditionally mounted form instruction', path: indexPath, mutated: originalIndex.replace('<p id="required-instructions">', '<p v-if="showInstructions" id="required-instructions">'), expected: 'form instructions references conditionally or multiply mounted target "required-instructions"' },
      { name: 'conditionally visible form instruction', path: indexPath, mutated: originalIndex.replace('<p id="required-instructions">', '<p v-show="false" id="required-instructions">'), expected: 'exposes required controls without a visible required instruction' },
      { name: 'native hidden form instruction', path: indexPath, mutated: originalIndex.replace('<p id="required-instructions">', '<p hidden id="required-instructions">'), expected: 'exposes required controls without a visible required instruction' },
      { name: 'aria-hidden form instruction', path: indexPath, mutated: originalIndex.replace('<p id="required-instructions">', '<p aria-hidden="true" id="required-instructions">'), expected: 'exposes required controls without a visible required instruction' },
      { name: 'optional form instruction IDREF', path: indexPath, mutated: originalIndex.replace('aria-describedby="required-instructions"', ':aria-describedby="showInstructions ? \'required-instructions\' : undefined"'), expected: 'form instructions can omit aria-describedby at runtime' },
      { name: 'empty form instruction IDREF branch', path: indexPath, mutated: originalIndex.replace('aria-describedby="required-instructions"', ':aria-describedby="showInstructions ? \'required-instructions\' : \'\'"'), expected: 'form instructions can omit aria-describedby at runtime' },
      { name: 'conditionally mounted explicit label', path: indexPath, mutated: originalIndex.replace('<label for="email">Email</label>', '<label v-if="showEmailLabel" for="email">Email</label>'), expected: 'control "email" is missing an accessible name' },
      { name: 'optional explicit label for IDREF', path: indexPath, mutated: originalIndex.replace('<label for="email">Email</label>', '<label :for="showEmailLabel ? \'email\' : undefined">Email</label>'), expected: '<label> can omit for at runtime' },
      { name: 'label for accepts exactly one id', path: indexPath, mutated: originalIndex.replace('<label for="email">Email</label>', '<label for="email password">Email</label>'), expected: '<label> for must contain exactly one id' },
      { name: 'imported descendants must back required instructions', path: descendantPath, mutated: originalDescendant.replace('    <RequiredNameField />\n    <RequiredPhoneField />', '    <Logo />\n    <Logo />'), expected: 'describes required fields but no control exposes required semantics' },
      { name: 'component loop bindings stay lexical', path: descendantPath, mutated: originalDescendant.replace('import Logo from \'./Logo.vue\'', 'import Logo from \'./Logo.vue\'\nimport LoopChild from \'./LoopChild.vue\'').replace('    <RequiredNameField />', '    <LoopChild v-for="(_, index) in rows" :key="index" />'), expected: 'id "loop-child-value" is repeated by v-for and must depend on every loop binding' },
      { name: 'component attributes supplied through object v-bind', path: descendantPath, mutated: originalDescendant.replace('    <Logo />', '    <Logo v-bind="logoAttrs" />'), expected: 'validation-critical attributes cannot be supplied through argumentless v-bind on <Logo>' },
      { name: 'required removed from imported name field', path: namePath, mutated: originalName.replace(' id="descendant-name" required ', ' id="descendant-name" '), expected: 'control "descendant-name" must be classified as required, optional or a declared required-group member' },
      { name: 'skip marker on a non-control', path: groupPath, mutated: originalGroup.replace('<p id="preferences-required-instructions">', '<p data-validation-skip id="preferences-required-instructions">'), expected: 'data-validation-skip is only valid on a non-hidden input, select or textarea' },
      { name: 'skip marker on a component', path: descendantPath, mutated: originalDescendant.replace('    <Logo />', '    <Logo data-validation-skip />'), expected: 'data-validation-skip is only valid on a non-hidden input, select or textarea' },
      { name: 'unknown dynamic IDREF', path: indexPath, mutated: originalIndex.replace('aria-describedby="password-errors"', ':aria-describedby="descriptionId"'), expected: 'control "password" has an unknown or empty aria-describedby expression' },
      { name: 'boolean IDREF branch is not absence', path: indexPath, mutated: originalIndex.replace('issues.length ? \'issues-email-errors\' : undefined', 'issues.length ? \'issues-email-errors\' : false'), expected: 'references missing target "false" through aria-describedby' },
      { name: 'logical IDREF expression fails closed', path: indexPath, mutated: originalIndex.replace('issues.length ? \'issues-email-errors\' : undefined', 'issues.length && \'issues-email-errors\''), expected: 'has an unknown or empty aria-describedby expression' },
      { name: 'optional and skip conflict', path: indexPath, mutated: originalIndex.replace('aria-label="Username" data-validation-optional', 'aria-label="Username" data-validation-optional data-validation-skip'), expected: 'cannot combine data-validation-skip and data-validation-optional' },

      { name: 'required removed from imported phone field', path: phonePath, mutated: originalPhone.replace(' id="descendant-phone" required ', ' id="descendant-phone" '), expected: 'control "descendant-phone" must be classified as required, optional or a declared required-group member' },
      { name: 'conditionally mounted aria-labelledby target', path: indexPath, mutated: originalIndex.replace('<span id="postcode-label">', '<span v-if="showPostcodeLabel" id="postcode-label">'), expected: 'control "postcode" references conditionally or multiply mounted target "postcode-label" through aria-labelledby' },
      { name: 'optional aria-labelledby IDREF', path: indexPath, mutated: originalIndex.replace('aria-labelledby="postcode-label"', ':aria-labelledby="showPostcodeLabel ? \'postcode-label\' : undefined"'), expected: 'control "postcode" can omit aria-labelledby at runtime' },
      { name: 'empty aria-labelledby IDREF branch', path: indexPath, mutated: originalIndex.replace('aria-labelledby="postcode-label"', ':aria-labelledby="showPostcodeLabel ? \'postcode-label\' : \'\'"'), expected: 'control "postcode" can omit aria-labelledby at runtime' },
      { name: 'duplicated static id', path: indexPath, mutated: originalIndex.replace('<p id="email-errors" aria-live="polite">{{ errorsFor(\'email\')[0] }}</p>', '<p id="email-errors" aria-live="polite">{{ errorsFor(\'email\')[0] }}</p>\n  <p id="email-errors" aria-live="polite">Duplicate</p>'), expected: 'duplicate id "email-errors" can be mounted more than once' },
      { name: 'malformed Vue template', path: indexPath, mutated: originalIndex.replace('</form>\n\n<form novalidate>', '</section>\n\n<form novalidate>'), expected: 'template compiler error' },
      { name: 'orphan v-else is malformed', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="required-instructions"', '<div v-else />\n<form novalidate aria-describedby="required-instructions"'), expected: 'template compiler error' },
      { name: 'missing v-if expression is malformed', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="required-instructions"', '<form v-if novalidate aria-describedby="required-instructions"'), expected: 'template compiler error' },
      { name: 'invalid v-for expression is malformed', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="required-instructions"', '<form v-for="what" novalidate aria-describedby="required-instructions"'), expected: 'template compiler error' },
      { name: 'valued optional marker', path: indexPath, mutated: originalIndex.replace(' id="username" aria-label="Username" data-validation-optional', ' id="username" aria-label="Username" data-validation-optional="true"'), expected: 'data-validation-optional must be a valueless static attribute' },
      { name: 'conflicting optional and required classification', path: indexPath, mutated: originalIndex.replace(' id="email" required', ' id="email" required data-validation-optional'), expected: 'control "email" has conflicting requiredness classifications' },
      { name: 'optional marker on form', path: indexPath, mutated: originalIndex.replace('<form novalidate aria-describedby="required-instructions"', '<form novalidate data-validation-optional aria-describedby="required-instructions"'), expected: 'data-validation-optional is only valid on a non-hidden input, select or textarea' },
      { name: 'required semantics removed', path: indexPath, mutated: originalIndex.replace(' id="email" required', ' id="email"'), expected: 'control "email" must be classified as required, optional or a declared required-group member' },
      { name: 'required instruction weakened', path: indexPath, mutated: originalIndex.replace('Email and password are required.', 'Complete this form.'), expected: 'exposes required controls without a visible required instruction' },
      { name: 'optional classification removed', path: indexPath, mutated: originalIndex.replace(' data-validation-optional :aria-invalid="errorsFor(\'username\')', ' :aria-invalid="errorsFor(\'username\')'), expected: 'control "username" must be classified as required, optional or a declared required-group member' },
      { name: 'optional-only form control unclassified', path: indexPath, mutated: originalIndex.replace(' id="referral-code" data-validation-optional', ' id="referral-code"'), expected: 'control "referral-code" must be classified as required, optional or a declared required-group member' },
      { name: 'application-specific BaseField', path: indexPath, mutated: originalIndex.replace('<form novalidate', '<BaseField />\n<form novalidate'), expected: 'must not assume an application-specific BaseField' },
      { name: 'explicit label removed', path: indexPath, mutated: originalIndex.replace('  <label for="email">Email</label>\n', ''), expected: 'control "email" is missing an accessible name' },
      { name: 'explicit label text is empty', path: indexPath, mutated: originalIndex.replace('<label for="email">Email</label>', '<label for="email"></label>'), expected: 'control "email" is missing an accessible name' },
      { name: 'explicit label text is unknown', path: indexPath, mutated: originalIndex.replace('<label for="email">Email</label>', '<label for="email">{{ emailLabel }}</label>'), expected: 'control "email" is missing an accessible name' },
      { name: 'wrapping label removed', path: indexPath, mutated: originalIndex.replace('  <label>Password\n', '  <span>Password\n').replace('  </label>\n  <ul id="password-errors"', '  </span>\n  <ul id="password-errors"'), expected: 'control "password" is missing an accessible name' },
      { name: 'aria-label removed', path: indexPath, mutated: originalIndex.replace(' aria-label="Username"', ''), expected: 'control "username" is missing an accessible name' },
      { name: 'bound empty aria-label', path: indexPath, mutated: originalIndex.replace('aria-label="Username"', ':aria-label="\'\'"'), expected: 'control "username" is missing an accessible name' },
      { name: 'bound undefined aria-label', path: indexPath, mutated: originalIndex.replace('aria-label="Username"', ':aria-label="undefined"'), expected: 'control "username" is missing an accessible name' },
      { name: 'bound false aria-label', path: indexPath, mutated: originalIndex.replace('aria-label="Username"', ':aria-label="false"'), expected: 'control "username" is missing an accessible name' },
      { name: 'bound unknown aria-label', path: indexPath, mutated: originalIndex.replace('aria-label="Username"', ':aria-label="usernameLabel"'), expected: 'control "username" is missing an accessible name' },
      { name: 'aria-labelledby misses', path: indexPath, mutated: originalIndex.replace(' aria-labelledby="postcode-label"', ' aria-labelledby="missing-label"'), expected: 'control "postcode" references missing target "missing-label" through aria-labelledby' },
      { name: 'aria-labelledby target text is empty', path: indexPath, mutated: originalIndex.replace('<span id="postcode-label">Postcode</span>', '<span id="postcode-label"></span>'), expected: 'control "postcode" is missing an accessible name' },
      { name: 'aria-labelledby text hidden from accessibility tree', path: indexPath, mutated: originalIndex.replace('<span id="postcode-label">Postcode</span>', '<span id="postcode-label"><span aria-hidden="true">Postcode</span></span>'), expected: 'control "postcode" is missing an accessible name' },
      { name: 'native hidden aria-labelledby target', path: indexPath, mutated: originalIndex.replace('<span id="postcode-label">Postcode</span>', '<span id="postcode-label" hidden>Postcode</span>'), expected: 'control "postcode" is missing an accessible name' },
      { name: 'conditional aria-labelledby alternative must have text', path: indexPath, mutated: originalIndex
        .replace('<span id="postcode-label">Postcode</span>', '<span id="postcode-label">Postcode</span>\n  <span id="postcode-label-empty"></span>')
        .replace('aria-labelledby="postcode-label"', ':aria-labelledby="showPostcode ? \'postcode-label\' : \'postcode-label-empty\'"'), expected: 'control "postcode" is missing an accessible name' },
      { name: 'invalid state removed', path: indexPath, mutated: originalIndex.replace(' :aria-invalid="errorsFor(\'password\').length > 0"', ''), expected: 'control "password" needs a dynamic aria-invalid state' },
      { name: 'error target misses', path: indexPath, mutated: originalIndex.replace(' aria-describedby="password-errors"', ' aria-describedby="missing-errors"'), expected: 'control "password" references missing target "missing-errors" through aria-describedby' },
      { name: 'announcement strategy removed', path: indexPath, mutated: originalIndex.replace(' id="password-errors" role="alert"', ' id="password-errors"'), expected: 'error container for control "password" is missing an announcement strategy' },
      { name: 'aria-live off is not an announcement', path: indexPath, mutated: originalIndex.replace('id="email-errors" aria-live="polite"', 'id="email-errors" aria-live="off"'), expected: 'error container for control "email" is missing an announcement strategy' },
      { name: 'always hidden error target cannot announce', path: indexPath, mutated: originalIndex.replace('<p id="email-errors" aria-live="polite">', '<p id="email-errors" v-show="false" aria-live="polite">'), expected: 'error container for control "email" is missing an announcement strategy' },
      { name: 'native hidden error target cannot announce', path: indexPath, mutated: originalIndex.replace('<p id="email-errors" aria-live="polite">', '<p id="email-errors" hidden aria-live="polite">'), expected: 'error container for control "email" is missing an announcement strategy' },
      { name: 'negated true error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="!true"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'void zero error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="void 0"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'numeric-zero error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="0"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'negative-zero error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="-0"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'positive-zero error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="+0"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'negative-bigint-zero error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="-0n"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'null error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="null"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'undefined error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="undefined"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'empty-string error target cannot announce', path: indexPath, mutated: originalIndex.replace('v-show="issues.length"', 'v-show="\'\'"'), expected: 'error container for control "issues-email" is missing an announcement strategy' },
      { name: 'conditionally mounted error target', path: indexPath, mutated: originalIndex.replace('<ul id="password-errors" role="alert">', '<ul v-if="errorsFor(\'password\').length" id="password-errors" role="alert">'), expected: 'control "password" references conditionally or multiply mounted target "password-errors"' },
      { name: 'source import misses', path: indexPath, mutated: originalIndex.replace('<<< ../.vitepress/examples/AccessibleExample.vue', '<<< ../.vitepress/examples/MissingExample.vue'), expected: 'source import does not exist' },
      { name: 'rendered source undisclosed', path: indexPath, mutated: originalIndex.replace('<<< ../.vitepress/examples/AccessibleExample.vue', '<<< ../.vitepress/examples/ChildField.vue'), expected: 'rendered component does not disclose its source' },
      { name: 'source import symlink cannot escape docs', path: indexPath, mutated: originalIndex.replace('<<< ../.vitepress/examples/AccessibleExample.vue', '<<< ./Escaped.vue'), expected: 'source import resolves outside the documentation root through a symbolic link' },
      { name: 'SFC label removed', path: examplePath, mutated: originalExample.replace('    <label for="example-email">Email</label>\n', ''), expected: 'control "example-email" is missing an accessible name' },
      { name: 'SFC required semantics removed with instructions', path: examplePath, mutated: exampleWithoutRequiredSemantics, expected: 'control "example-email" must be classified as required, optional or a declared required-group member' },
      { name: 'SFC required classification removed', path: examplePath, mutated: originalExample.replace(' id="example-email" required', ' id="example-email"'), expected: 'control "example-email" must be classified as required, optional or a declared required-group member' },
      { name: 'dynamic SFC classification removed', path: examplePath, mutated: originalExample.replace('        data-validation-optional\n', ''), expected: `control "example-contact-${vueIndex}" must be classified as required, optional or a declared required-group member` },
      { name: 'second SFC form optional classification removed', path: examplePath, mutated: originalExample.replace(' id="example-referral-code" data-validation-optional', ' id="example-referral-code"'), expected: 'control "example-referral-code" must be classified as required, optional or a declared required-group member' },
      { name: 'SFC invalid state and association removed', path: examplePath, mutated: originalExample.replace(' :aria-invalid="errorsFor(\'email\').length > 0" aria-describedby="example-email-errors"', ''), expected: 'control "example-email" needs a dynamic aria-invalid state' },
      { name: 'dynamic template ID mismatch', path: examplePath, mutated: originalExample.replace(dynamicContactDescription, brokenDynamicContactDescription), expected: 'references missing target' },
      { name: 'shadowed v-for binding cannot match outer target', path: examplePath, mutated: shadowedLoopExample, expected: `references missing target "example-contact-${vueIndex}-errors" through aria-describedby` },
      { name: 'independent loops cannot hide duplicate IDs', path: examplePath, mutated: independentLoopExample, expected: `duplicate id "example-contact-${vueIndex}" can be mounted more than once` },
      { name: 'renamed loop aliases cannot hide duplicate IDs', path: examplePath, mutated: renamedIndependentLoopExample, expected: `duplicate id "example-contact-${vueIndex}" can be mounted more than once` },
      { name: 'array third v-for alias is not injective', path: indexPath, mutated: arrayThirdAliasIndex, expected: 'id expression cannot be resolved statically' },
      { name: 'range third v-for alias is not injective', path: indexPath, mutated: rangeThirdAliasIndex, expected: 'id expression cannot be resolved statically' },
      { name: 'loop id must depend on its binding', path: examplePath, mutated: unrelatedLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'modulo-one loop id is not injective', path: examplePath, mutated: moduloOneLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'modulo-two loop id is not provably injective', path: examplePath, mutated: moduloTwoLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'called loop id is not provably injective', path: examplePath, mutated: calledLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'IIFE loop id is not provably injective', path: examplePath, mutated: iifeLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'direct index plus unknown suffix is not injective', path: examplePath, mutated: suffixedLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'direct index plus conditional suffix can collide', path: examplePath, mutated: conditionallyCollidingLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'adjacent nested loop indices are not injective', path: examplePath, mutated: nestedAdjacentLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'digit-separated nested loop indices are not injective', path: examplePath, mutated: nestedDigitSeparatedLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'delimiter-separated nested object keys are not injective', path: examplePath, mutated: nestedKeyDelimitedLoopIdExample, expected: 'id expression cannot be resolved statically' },
      { name: 'dynamic id family collides with static id', path: examplePath, mutated: originalExample.replace('  <form novalidate aria-describedby="example-required-instructions">', '  <p id="example-contact-0">Static collision</p>\n  <form novalidate aria-describedby="example-required-instructions">'), expected: `dynamic id family "example-contact-${vueIndex}" can collide with static id "example-contact-0"` },
      { name: 'slotted control belongs to imported form', path: slottedPath, mutated: originalSlotted.replace(' data-validation-optional ', ' '), expected: 'control "slotted-name" must be classified as required, optional or a declared required-group member' },
      { name: 'empty supplied slot renders validation fallback', path: fallbackParentPath, mutated: originalFallbackParent.replace('<span>Provided content</span>', '<template #default />'), expected: 'control "fallback-name" must be classified as required, optional or a declared required-group member' },
      { name: 'conditional supplied slot can expose validation fallback', path: fallbackParentPath, mutated: originalFallbackParent.replace('<span>Provided content</span>', '<template #default v-if="show"><span>Provided content</span></template>'), expected: 'control "fallback-name" must be classified as required, optional or a declared required-group member' },
      { name: 'conditional slot audits imported fallback closure', path: fallbackParentPath, mutated: originalFallbackParent.replace('import FallbackWrapper from \'./FallbackWrapper.vue\'', 'import FallbackWrapper from \'./ComponentFallbackWrapper.vue\'').replace('<span>Provided content</span>', '<span v-if="show">Provided content</span>'), expected: 'control "fallback-component-name" must be classified as required, optional or a declared required-group member' },

      { name: 'required group rejects skipped choice', path: groupPath, mutated: originalGroup.replace('<input type="checkbox" :aria-invalid=', '<input type="checkbox" data-validation-skip :aria-invalid='), expected: 'required checkbox group must keep its individual choices unclassified' },
      { name: 'required group rejects optional marker', path: groupPath, mutated: originalGroup.replace('<input type="checkbox" :aria-invalid=', '<input type="checkbox" data-validation-optional :aria-invalid='), expected: 'required checkbox group must keep its individual choices unclassified' },
      { name: 'required group rejects nested boundary leakage', path: groupPath, mutated: nestedGroupExample, expected: 'required checkbox group must keep its individual choices unclassified' },
      { name: 'required group legend cannot be conditional', path: groupPath, mutated: originalGroup.replace('<legend>Contact methods', '<legend v-if="showLegend">Contact methods'), expected: 'required checkbox group needs a legend that says at least one choice is required' },
      { name: 'required group legend cannot be repeated', path: groupPath, mutated: originalGroup.replace('<legend>Contact methods', '<legend v-for="group in groups">Contact methods'), expected: 'required checkbox group needs a legend that says at least one choice is required' },
      { name: 'required group legend must be visible', path: groupPath, mutated: originalGroup.replace('<legend>Contact methods', '<legend v-show="false">Contact methods'), expected: 'required checkbox group needs a legend that says at least one choice is required' },
      { name: 'required group instruction cannot be conditional', path: groupPath, mutated: originalGroup.replace('<p id="contact-method-required-instructions">', '<p v-if="showInstructions" id="contact-method-required-instructions">'), expected: 'required checkbox group needs a persistent described instruction' },
      { name: 'required group instruction must be visible', path: groupPath, mutated: originalGroup.replace('<p id="contact-method-required-instructions">', '<p v-show="false" id="contact-method-required-instructions">'), expected: 'required checkbox group needs a persistent described instruction' },
      { name: 'generic native IDREF target must exist', path: groupPath, mutated: originalGroup.replace('<button type="button" aria-describedby="preferences-required-instructions">', '<button type="button" aria-describedby="missing-button-help">'), expected: '<button> references missing target "missing-button-help" through aria-describedby' },
      { name: 'standalone child error association removed', path: childPath, mutated: originalChild.replace(' aria-describedby="child-name-errors"', ''), expected: 'control "child-name" is missing error association' },
    ]

    for (const mutation of mutations) {
      const original = originals.get(mutation.path)
      assert.notEqual(mutation.mutated, original, `Mutation did not change fixture text: ${mutation.name}`)
      await writeFile(mutation.path, mutation.mutated)
      const failures = await checkDocs(fixtureRoot, { checkAdapterPackages: false })
      for (const expected of [mutation.expected].flat()) {
        assert(
          failures.some(failure => failure.includes(expected)),
          `Expected ${mutation.name} mutation to fail with: ${expected}\n${failures.join('\n')}`,
        )
      }
      await writeFile(mutation.path, original)
    }
  }
  finally {
    await Promise.all([
      rm(fixtureRoot, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ])
  }
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest()
    console.log('Documentation checker self-test passed.')
    return
  }

  const scriptDirectory = dirname(fileURLToPath(import.meta.url))
  const failures = await checkDocs(resolve(scriptDirectory, '..'))

  if (failures.length > 0) {
    console.error(`Documentation check failed with ${failures.length} problem(s):`)
    for (const failure of failures)
      console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }

  console.log('Documentation check passed.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
