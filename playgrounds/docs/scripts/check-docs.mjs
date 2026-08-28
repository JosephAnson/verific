import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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

function withoutFencedCode(markdown) {
  let fence

  return markdown.split('\n').map((line) => {
    const marker = line.match(/^(```|~~~)/)?.[1]

    if (marker) {
      fence = fence === marker ? undefined : (fence ?? marker)
      return ''
    }

    return fence ? '' : line
  }).join('\n')
}

function codeBlocks(markdown) {
  const blocks = []
  let fence
  let lines = []

  for (const line of markdown.split('\n')) {
    const marker = line.match(/^(```|~~~)/)?.[1]

    if (!fence && marker) {
      fence = marker
      lines = []
    }
    else if (marker && fence === marker) {
      blocks.push(lines.join('\n'))
      fence = undefined
    }
    else if (fence) {
      lines.push(line)
    }
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

function startTags(source) {
  const tags = []

  for (let index = 0; index < source.length; index++) {
    if (source[index] !== '<' || !/[a-z]/i.test(source[index + 1] ?? ''))
      continue

    const nameStart = index + 1
    let nameEnd = nameStart
    while (/[\w-]/.test(source[nameEnd] ?? ''))
      nameEnd++

    let end = nameEnd
    let quote
    while (end < source.length) {
      const character = source[end]

      if (character === '\\') {
        end += 2
        continue
      }

      if (quote) {
        if (character === quote)
          quote = undefined
      }
      else if (character === '"' || character === '\'') {
        quote = character
      }
      else if (character === '>') {
        break
      }

      end++
    }

    tags.push({
      attributes: parseAttributes(source.slice(nameEnd, end)),
      end,
      name: source.slice(nameStart, nameEnd).toLowerCase(),
      start: index,
    })
    index = end
  }

  return tags
}

function parseAttributes(source) {
  const attributes = new Map()
  let index = 0

  while (index < source.length) {
    while (/\s/.test(source[index] ?? ''))
      index++

    if (source[index] === '/')
      break

    const nameStart = index
    while (index < source.length && !/[\s=]/.test(source[index]))
      index++

    if (nameStart === index)
      break

    const rawName = source.slice(nameStart, index).toLowerCase()
    const name = rawName.replace(/^(?::|v-bind:)/, '')
    while (/\s/.test(source[index] ?? ''))
      index++

    let value = ''
    if (source[index] === '=') {
      index++
      while (/\s/.test(source[index] ?? ''))
        index++

      const quote = source[index] === '"' || source[index] === '\'' ? source[index++] : undefined
      const valueStart = index

      if (quote) {
        while (index < source.length && source[index] !== quote)
          index++
        value = source.slice(valueStart, index++)
      }
      else {
        while (index < source.length && !/\s/.test(source[index]))
          index++
        value = source.slice(valueStart, index)
      }
    }

    attributes.set(name, value)
  }

  return attributes
}

function describedIds(value) {
  const ids = new Set()
  const targetExpression = value.includes('?') ? value.slice(value.indexOf('?') + 1) : value

  if (/^[\w:\s-]+$/.test(targetExpression)) {
    for (const id of targetExpression.split(/\s+/))
      ids.add(id)
  }

  for (const match of targetExpression.matchAll(/['"]([^'"]+)['"]/g)) {
    for (const id of match[1].split(/\s+/))
      ids.add(id)
  }

  return ids
}

function hasAccessibleName(control, labels, labelRanges, targets) {
  const id = control.attributes.get('id')
  const explicitLabel = id && labels.some(label => label.attributes.get('for') === id)
  const implicitLabel = labelRanges.some(range => control.start > range.start && control.end < range.end)
  const ariaLabel = control.attributes.get('aria-label')?.trim()
  const labelledBy = control.attributes.get('aria-labelledby')
  const labelledByIds = labelledBy === undefined ? [] : [...describedIds(labelledBy)]
  const validLabelledBy = labelledByIds.length > 0 && labelledByIds.every(targetId => targets.has(targetId))

  return Boolean(explicitLabel || implicitLabel || ariaLabel || validLabelledBy)
}

function vueTemplates(source) {
  const blocks = []
  const tags = /<\/?template(?:\s[^>]*)?>/gi
  let depth = 0
  let start
  let match

  while (true) {
    match = tags.exec(source)
    if (!match)
      break

    const closing = match[0].startsWith('</')
    const selfClosing = /\/\s*>$/.test(match[0])

    if (closing) {
      if (depth > 0 && --depth === 0 && start !== undefined) {
        blocks.push(source.slice(start, match.index))
        start = undefined
      }
    }
    else if (!selfClosing) {
      if (depth === 0)
        start = tags.lastIndex
      depth++
    }
  }

  return blocks
}

function checkCompleteForms(file, source, failures, sourceType = 'Markdown') {
  const blocks = sourceType === 'Vue SFC' ? vueTemplates(source) : codeBlocks(source)

  for (const [index, block] of blocks.entries()) {
    const hasForm = block.includes('<form')
    const hasValidation = /errorsFor\s*\(/.test(block)
    if (sourceType === 'Markdown' ? !hasForm || !hasValidation : !hasForm && !hasValidation)
      continue

    const tags = startTags(block)
    const forms = tags.filter(tag => tag.name === 'form')
    const controls = tags.filter(tag => ['input', 'select', 'textarea'].includes(tag.name) && tag.attributes.get('type') !== 'hidden')
    const labels = tags.filter(tag => tag.name === 'label')
    const labelRanges = labels.flatMap((label) => {
      const close = block.indexOf('</label>', label.end)
      return close < 0 ? [] : [{ end: close, start: label.start }]
    })
    const targets = new Map(tags.flatMap((tag) => {
      const id = tag.attributes.get('id')
      return id ? [[id, tag]] : []
    }))

    for (const [formIndex, form] of forms.entries()) {
      if (!form.attributes.has('novalidate'))
        failures.push(`${file}: complete ${sourceType} form block ${index + 1} form ${formIndex + 1} is missing native validation bypass`)
    }

    for (const [controlIndex, control] of controls.entries()) {
      const id = control.attributes.get('id')
      const controlName = id ? `"${id}"` : `${control.name} ${controlIndex + 1}`

      if (!hasAccessibleName(control, labels, labelRanges, targets))
        failures.push(`${file}: complete ${sourceType} form block ${index + 1} control ${controlName} is missing an accessible name`)

      if (sourceType === 'Vue SFC' && control.attributes.has('data-validation-skip'))
        continue

      if (!control.attributes.has('aria-invalid'))
        failures.push(`${file}: complete ${sourceType} form block ${index + 1} control ${controlName} is missing invalid state`)

      const describedBy = control.attributes.get('aria-describedby')
      if (describedBy === undefined) {
        failures.push(`${file}: complete ${sourceType} form block ${index + 1} control ${controlName} is missing error association`)
        continue
      }

      const targetIds = [...describedIds(describedBy)]
      const missingTargets = targetIds.filter(id => !targets.has(id))
      if (targetIds.length === 0 || missingTargets.length > 0) {
        failures.push(`${file}: complete ${sourceType} form block ${index + 1} control ${controlName} describes a missing error container`)
        continue
      }

      const hasAnnouncement = targetIds.some((targetId) => {
        const target = targets.get(targetId)
        const role = target.attributes.get('role')
        return target.attributes.has('aria-live') || role === 'alert' || role === 'status'
      })

      if (!hasAnnouncement)
        failures.push(`${file}: complete ${sourceType} form block ${index + 1} error container "${targetIds.join(' ')}" is missing an announcement strategy`)
    }
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

function renderedComponentImports(markdown) {
  const source = withoutFencedCode(markdown)
  return [...source.matchAll(/\bimport\s+([A-Z][\w$]*)\s+from\s+(['"])([^'"]+\.vue)\2/g)]
    .filter(match => new RegExp(`<${match[1]}(?:\\s|/?>)`).test(source))
    .map(match => match[3])
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

  for (const file of files)
    content.set(file, await readFile(file, 'utf8'))

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
    for (const importedPath of sourceImports(markdown)) {
      const target = sourceImportPath(docsRoot, file, importedPath)
      const sourceName = relative(docsRoot, file)

      if (!isWithinDirectory(docsRoot, target)) {
        failures.push(`${sourceName}: source import resolves outside the documentation root: ${importedPath}`)
        continue
      }

      try {
        disclosedTargets.add(target)
        importedSources.set(target, await readFile(target, 'utf8'))
      }
      catch {
        failures.push(`${sourceName}: source import does not exist: ${importedPath}`)
      }
    }

    for (const componentPath of renderedComponentImports(markdown)) {
      const renderedTarget = sourceImportPath(docsRoot, file, componentPath)
      if (!disclosedTargets.has(renderedTarget)) {
        failures.push(`${relative(docsRoot, file)}: rendered component does not disclose its source: ${componentPath}`)
      }
    }

    checkCompleteForms(relative(docsRoot, file), markdown, failures)
  }

  for (const [file, source] of importedSources) {
    if (extname(file) === '.vue')
      checkCompleteForms(relative(docsRoot, file), source, failures, 'Vue SFC')
  }

  for (const file of exampleFiles) {
    if (importedSources.has(file))
      continue
    checkCompleteForms(relative(docsRoot, file), await readFile(file, 'utf8'), failures, 'Vue SFC')
  }

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
</script>

# Getting started

<AccessibleExample />

<<< ../.vitepress/examples/AccessibleExample.vue

[Details](/guide/details#details)
[Balanced](./details_(advanced)#balanced)
[Escaped](./details_\\(advanced\\)#balanced)
[Nested [label]](./details_(advanced)#balanced)
[Escaped \\[label\\]](./details_(advanced)#balanced)
[Reader's guide](./reader's-guide#readers-guide)
[Author's note](./author's-note#authors-note)

\`\`\`vue
<form novalidate @submit.prevent="submit">
  <label for="email">Email</label>
  <input id="email" :aria-invalid="errorsFor('email').length > 0" aria-describedby="email-errors">
  <p id="email-errors" aria-live="polite">{{ errorsFor('email')[0] }}</p>

  <label>Password
    <input id="password" :aria-invalid="errorsFor('password').length > 0" aria-describedby="password-errors">
  </label>
  <p id="password-errors" role="alert">{{ errorsFor('password')[0] }}</p>

  <input id="username" aria-label="Username" :aria-invalid="errorsFor('username').length > 0" aria-describedby="username-errors">
  <p id="username-errors" aria-live="assertive">{{ errorsFor('username')[0] }}</p>

  <span id="postcode-label">Postcode</span>
  <input id="postcode" aria-labelledby="postcode-label" :aria-invalid="errorsFor('postcode').length > 0" aria-describedby="postcode-errors">
  <p id="postcode-errors" role="status">{{ errorsFor('postcode')[0] }}</p>
</form>
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
  <form novalidate>
    <label for="example-email">Email</label>
    <input id="example-email" :aria-invalid="errorsFor('email').length > 0" aria-describedby="example-email-errors">
    <p id="example-email-errors" aria-live="polite">{{ errorsFor('email')[0] }}</p>
  </form>
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

  try {
    await Promise.all([
      mkdir(join(fixtureRoot, '.vitepress'), { recursive: true }),
      mkdir(join(fixtureRoot, '.vitepress', 'examples'), { recursive: true }),
      mkdir(join(fixtureRoot, 'guide'), { recursive: true }),
    ])
    await writeFixture(fixtureRoot)
    assert.deepEqual(await checkDocs(fixtureRoot, { checkAdapterPackages: false }), [])

    const configPath = join(fixtureRoot, '.vitepress', 'config.mts')
    const indexPath = join(fixtureRoot, 'guide', 'index.md')
    const examplePath = join(fixtureRoot, '.vitepress', 'examples', 'AccessibleExample.vue')
    const childPath = join(fixtureRoot, '.vitepress', 'examples', 'ChildField.vue')
    const originalConfig = await readFile(configPath, 'utf8')
    const originalIndex = await readFile(indexPath, 'utf8')
    const originalExample = await readFile(examplePath, 'utf8')
    const originalChild = await readFile(childPath, 'utf8')
    const originals = new Map([
      [configPath, originalConfig],
      [indexPath, originalIndex],
      [examplePath, originalExample],
      [childPath, originalChild],
    ])
    const mutations = [
      [configPath, originalConfig.replace('  { text: \'Details\', link: \'/guide/details\' },\n', ''), 'missing from the sidebar'],
      [configPath, originalConfig.replace('      { text: \'More\', items: More },\n', ''), '/guide/details: guide page is missing from the sidebar'],
      [indexPath, originalIndex.replace('/guide/details#details', '/guide/missing'), 'link target does not exist'],
      [indexPath, originalIndex.replace('#details)', '#missing)'), 'link anchor does not exist'],
      [indexPath, originalIndex.replace('./details_(advanced)#balanced', './details_(advanced)#missing'), 'link anchor does not exist: ./details_(advanced)#missing'],
      [indexPath, originalIndex.replace('./reader\'s-guide#readers-guide', './reader\'s-missing#readers-guide'), 'link target does not exist: ./reader\'s-missing#readers-guide'],
      [indexPath, originalIndex.replace('[Final [nested label]](./details_(advanced)#balanced)', '[Final [nested label]](./details_(advanced)#balanced'), 'Markdown link has an unclosed destination'],
      [indexPath, originalIndex.replace('link: /guide/details', 'link: /guide/'), 'points to itself'],
      [indexPath, originalIndex.replace('<form novalidate', '<form'), 'is missing native validation bypass'],
      [indexPath, originalIndex.replace('<form novalidate', '<BaseField />\n<form novalidate'), 'must not assume an application-specific BaseField'],
      [indexPath, originalIndex.replace('  <label for="email">Email</label>\n', ''), 'control "email" is missing an accessible name'],
      [indexPath, originalIndex.replace('  <label>Password\n', '  Password\n'), 'control "password" is missing an accessible name'],
      [indexPath, originalIndex.replace(' aria-label="Username"', ''), 'control "username" is missing an accessible name'],
      [indexPath, originalIndex.replace(' aria-labelledby="postcode-label"', ' aria-labelledby="missing-label"'), 'control "postcode" is missing an accessible name'],
      [indexPath, originalIndex.replace(' :aria-invalid="errorsFor(\'password\').length > 0"', ''), 'control "password" is missing invalid state'],
      [indexPath, originalIndex.replace(' aria-describedby="password-errors"', ' aria-describedby="missing-errors"'), 'control "password" describes a missing error container'],
      [indexPath, originalIndex.replace(' id="password-errors" role="alert"', ' id="password-errors"'), 'error container "password-errors" is missing an announcement strategy'],
      [indexPath, originalIndex.replace('<<< ../.vitepress/examples/AccessibleExample.vue', '<<< ../.vitepress/examples/MissingExample.vue'), 'source import does not exist'],
      [indexPath, originalIndex.replace('<<< ../.vitepress/examples/AccessibleExample.vue', '<<< ../.vitepress/examples/ChildField.vue'), 'rendered component does not disclose its source'],
      [examplePath, originalExample.replace('    <label for="example-email">Email</label>\n', ''), 'control "example-email" is missing an accessible name'],
      [examplePath, originalExample.replace(' :aria-invalid="errorsFor(\'email\').length > 0" aria-describedby="example-email-errors"', ''), 'control "example-email" is missing invalid state'],
      [childPath, originalChild.replace(' aria-describedby="child-name-errors"', ''), 'control "child-name" is missing error association'],
    ]

    for (const [path, mutated, expected] of mutations) {
      await writeFile(path, mutated)
      const failures = await checkDocs(fixtureRoot, { checkAdapterPackages: false })
      assert(failures.some(failure => failure.includes(expected)), `Expected mutation to fail with: ${expected}`)
      await writeFile(path, originals.get(path))
    }
  }
  finally {
    await rm(fixtureRoot, { recursive: true, force: true })
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
