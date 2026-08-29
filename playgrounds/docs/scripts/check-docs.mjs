import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { babelParse, compileTemplate, parse as parseSfc } from '@vue/compiler-sfc'

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
    if (close < 0) {
      result += markdown.slice(start, index)
    }
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

const AST_ELEMENT = 1
const AST_TEXT = 2
const AST_COMMENT = 3
const AST_INTERPOLATION = 5
const AST_ATTRIBUTE = 6
const AST_DIRECTIVE = 7
const ELEMENT_NATIVE = 0
const ELEMENT_COMPONENT = 1
const ELEMENT_SLOT = 2
const ELEMENT_TEMPLATE = 3

function compilerError(error) {
  return typeof error === 'string' ? error : (error?.message ?? String(error))
}

function componentName(name) {
  return name.replace(/[-_]/g, '').toLowerCase()
}

function scriptPlugins(lang) {
  if (lang === 'tsx')
    return ['typescript', 'jsx']
  if (lang === 'ts')
    return ['typescript']
  if (lang === 'jsx')
    return ['jsx']
  return []
}

function valueVueImports(descriptor, displayName, failures) {
  const imports = new Map()

  for (const block of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    let ast
    try {
      ast = babelParse(block.content, {
        plugins: scriptPlugins(block.lang),
        sourceType: 'module',
      })
    }
    catch (error) {
      failures.push(`${displayName}: script compiler error: ${compilerError(error)}`)
      continue
    }

    for (const declaration of ast.program.body) {
      if (
        declaration.type !== 'ImportDeclaration'
        || declaration.importKind === 'type'
        || !declaration.source.value.endsWith('.vue')
      ) {
        continue
      }

      for (const specifier of declaration.specifiers) {
        if (specifier.importKind !== 'type')
          imports.set(componentName(specifier.local.name), declaration.source.value)
      }
    }
  }

  return imports
}

function parseTemplateUnit({ displayName, filename, source, templateOnly = false }, failures) {
  const parsedSource = templateOnly ? `<template>\n${source}\n</template>` : source
  const parsed = parseSfc(parsedSource, { filename })

  for (const error of parsed.errors)
    failures.push(`${displayName}: template compiler error: ${compilerError(error)}`)

  if (parsed.errors.length > 0)
    return
  if (!parsed.descriptor.template?.ast) {
    failures.push(`${displayName}: Vue example has no auditable template`)
    return
  }
  if (parsed.descriptor.template.src || parsed.descriptor.template.lang) {
    failures.push(`${displayName}: external or preprocessed Vue templates are not supported by the documentation checker`)
    return
  }

  const compiled = compileTemplate({
    filename,
    id: filename,
    source: parsed.descriptor.template.content,
  })
  for (const error of compiled.errors)
    failures.push(`${displayName}: template compiler error: ${compilerError(error)}`)
  if (compiled.errors.length > 0)
    return

  return {
    ast: parsed.descriptor.template.ast,
    displayName,
    filename,
    imports: valueVueImports(parsed.descriptor, displayName, failures),
    key: filename,
  }
}

function hasElement(ast, tag) {
  if (ast?.type === AST_ELEMENT && ast.tag === tag)
    return true
  return (ast?.children ?? []).some(child => hasElement(child, tag))
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

function markdownTemplateUnits(file, markdown, docsRoot, failures) {
  const units = []
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
      failures.push(`${relative(docsRoot, file)}: Vue block ${blockIndex + 1} label resolves outside its virtual example directory`)
      continue
    }
    const unit = parseTemplateUnit({
      displayName: `${relative(docsRoot, file)}: Vue block ${blockIndex + 1}`,
      filename,
      source: block.source,
      templateOnly: !fullSfc,
    }, failures)

    if (unit)
      units.push(unit)
  }

  return units
}

function directive(element, name) {
  return element.props.find(prop => prop.type === AST_DIRECTIVE && prop.name === name)
}

function namedProperties(element, name) {
  return element.props.flatMap((prop) => {
    if (prop.type === AST_ATTRIBUTE && prop.name.toLowerCase() === name) {
      return [{
        expression: undefined,
        kind: 'static',
        value: prop.value?.content,
        valueless: prop.value === undefined,
      }]
    }
    if (
      prop.type === AST_DIRECTIVE
      && prop.name === 'bind'
      && prop.arg?.isStatic
      && prop.arg.content.toLowerCase() === name
    ) {
      return [{
        expression: prop.exp,
        kind: 'bound',
        value: prop.exp?.content,
        valueless: false,
      }]
    }
    return []
  })
}

function hasProperty(element, name) {
  return namedProperties(element, name).length > 0
}

function staticValue(element, name) {
  return namedProperties(element, name).find(property => property.kind === 'static')?.value
}

function literalTrue(value) {
  return ['true', '\'true\'', '"true"'].includes(value?.trim())
}

function literalFalse(value) {
  return ['false', '\'false\'', '"false"'].includes(value?.trim())
}

function nativeBooleanState(element, name) {
  const properties = namedProperties(element, name)
  if (properties.length === 0)
    return 'absent'
  if (properties.length !== 1)
    return 'invalid'

  const property = properties[0]
  if (property.kind === 'static' || literalTrue(property.value))
    return 'true'
  if (literalFalse(property.value))
    return 'false'
  return 'unknown'
}

function nativeBoolean(element, name) {
  return nativeBooleanState(element, name) === 'true'
}

function ariaRequiredState(element) {
  const properties = namedProperties(element, 'aria-required')
  if (properties.length === 0)
    return 'absent'
  if (properties.length !== 1)
    return 'unknown'

  const property = properties[0]
  if (property.kind === 'static') {
    if (property.value === 'true')
      return 'true'
    if (property.value === 'false')
      return 'false'
    return 'unknown'
  }
  if (literalTrue(property.value))
    return 'true'
  if (literalFalse(property.value))
    return 'false'
  return 'unknown'
}

function ariaRequired(element) {
  return ariaRequiredState(element) === 'true'
}

function staticallyAriaHidden(element) {
  const properties = namedProperties(element, 'aria-hidden')
  if (properties.length !== 1)
    return false
  const property = properties[0]
  return property.kind === 'static'
    ? property.value === 'true'
    : literalTrue(property.value)
}

function staticallyHidden(element) {
  return nativeBooleanState(element, 'hidden') === 'true' || staticallyAriaHidden(element)
}

function markerState(element, name) {
  const properties = namedProperties(element, name)
  if (properties.length === 0)
    return 'absent'
  return properties.length === 1 && properties[0].kind === 'static' && properties[0].valueless
    ? 'valid'
    : 'invalid'
}

function isDynamicExpression(expression) {
  let node = expression?.ast
  while (node && ['ParenthesizedExpression', 'TSAsExpression', 'TSNonNullExpression', 'TSTypeAssertion'].includes(node.type))
    node = node.expression

  if (!node) {
    const source = expression?.content.trim()
    return Boolean(source) && !/^(?:false|null|true|undefined|[-+]?\d+(?:\.\d+)?|(['"])[\s\S]*\1)$/.test(source)
  }
  if (node.type === 'TemplateLiteral')
    return node.expressions.length > 0
  return ![
    'BigIntLiteral',
    'BooleanLiteral',
    'DecimalLiteral',
    'NullLiteral',
    'NumericLiteral',
    'RegExpLiteral',
    'StringLiteral',
  ].includes(node.type) && !(node.type === 'Identifier' && node.name === 'undefined')
}

function unwrappedExpressionNode(node) {
  while (node && ['ParenthesizedExpression', 'TSAsExpression', 'TSNonNullExpression', 'TSTypeAssertion'].includes(node.type))
    node = node.expression
  return node
}

function guaranteedNonEmptyExpression(expression, node = expression?.ast) {
  node = unwrappedExpressionNode(node)
  if (!node) {
    const source = expression?.content.trim()
    const string = source?.match(/^(['"])([\s\S]*)\1$/)
    return Boolean(string?.[2].trim())
  }
  if (node.type === 'StringLiteral')
    return node.value.trim().length > 0
  if (node.type === 'TemplateLiteral') {
    if (node.quasis.some(quasi => quasi.value.cooked?.trim() || quasi.value.raw.trim()))
      return true
    return node.expressions.some(part => guaranteedNonEmptyExpression(expression, part))
  }
  if (node.type === 'ConditionalExpression') {
    return guaranteedNonEmptyExpression(expression, node.consequent)
      && guaranteedNonEmptyExpression(expression, node.alternate)
  }
  return false
}

function provablyFalseExpression(expression) {
  const node = unwrappedExpressionNode(expression?.ast)
  if (node) {
    if (node.type === 'BooleanLiteral')
      return node.value === false
    if (node.type === 'NullLiteral')
      return true
    if (node.type === 'Identifier')
      return node.name === 'undefined'
    if (node.type === 'StringLiteral')
      return node.value === ''
    if (node.type === 'NumericLiteral' || node.type === 'DecimalLiteral')
      return Number(node.value) === 0
    if (node.type === 'BigIntLiteral')
      return node.value === '0'
    if (node.type === 'UnaryExpression' && node.operator === 'void')
      return true
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      const argument = unwrappedExpressionNode(node.argument)
      return argument?.type === 'BooleanLiteral' && argument.value === true
    }
    if (node.type === 'UnaryExpression' && ['+', '-'].includes(node.operator)) {
      const argument = unwrappedExpressionNode(node.argument)
      if (argument?.type === 'NumericLiteral' || argument?.type === 'DecimalLiteral')
        return Number(argument.value) === 0
      return node.operator === '-' && argument?.type === 'BigIntLiteral' && argument.value === '0'
    }
    if (node.type === 'TemplateLiteral')
      return node.expressions.length === 0 && node.quasis.every(quasi => quasi.value.cooked === '')
    return false
  }
  const source = expression?.content.trim()
  return /^(?:false|null|undefined|!\s*true|void\s+0|[-+]?0+(?:\.0+)?|-0+n|''|""|``)$/.test(source)
}

function hasDynamicInvalidState(element) {
  const properties = namedProperties(element, 'aria-invalid')
  if (properties.length !== 1 || properties[0].kind !== 'bound')
    return false
  return isDynamicExpression(properties[0].expression)
}

function hasAnnouncementStrategy(element) {
  const role = staticValue(element, 'role')
  if (role === 'alert' || role === 'status')
    return true

  return namedProperties(element, 'aria-live').some((property) => {
    const value = property.value?.trim()
    return property.kind === 'static'
      ? ['assertive', 'polite'].includes(value)
      : ['\'assertive\'', '\'polite\'', '"assertive"', '"polite"'].includes(value)
  })
}

function isReferenceIdentifier(parent, parentKey) {
  return !(
    ['MemberExpression', 'OptionalMemberExpression'].includes(parent?.type)
    && parentKey === 'property'
    && !parent.computed
  ) && !(
    ['ObjectMethod', 'ObjectProperty'].includes(parent?.type)
    && parentKey === 'key'
    && !parent.computed
  )
}

function referencesIdentifier(node, name, parent, parentKey) {
  if (!node || typeof node !== 'object')
    return false
  if (Array.isArray(node))
    return node.some(child => referencesIdentifier(child, name, parent, parentKey))
  if (node.type === 'Identifier')
    return isReferenceIdentifier(parent, parentKey) && node.name === name

  return Object.entries(node).some(([key, value]) => (
    !['comments', 'errors', 'extra', 'loc'].includes(key)
    && referencesIdentifier(value, name, node, key)
  ))
}

function referencedBindings(node, bindings, fallbackSource) {
  return [...bindings].filter(([name]) => (
    node
      ? referencesIdentifier(node, name)
      : new RegExp(`(?:^|[^\\w$])${name.replace(/\$/g, '\\$&')}(?![\\w$])`).test(fallbackSource)
  )).sort(([first], [second]) => first.localeCompare(second))
}

function staticIdSet(value) {
  const tokens = value.split(/\s+/).filter(Boolean).map(key => ({
    collisionKey: `static:${key}`,
    dynamic: false,
    key: `static:${key}`,
    scopes: [],
  }))
  return {
    guaranteedKeys: new Set(tokens.map(token => token.key)),
    mayBeEmpty: tokens.length === 0,
    tokens,
  }
}

function normaliseTemplateBindings(source, node, references) {
  if (!node || references.length === 0)
    return source

  const names = new Set(references.map(([name]) => name))
  const identifiers = []
  function collect(nodeValue, parent, parentKey) {
    if (!nodeValue || typeof nodeValue !== 'object')
      return
    if (Array.isArray(nodeValue)) {
      for (const child of nodeValue)
        collect(child, parent, parentKey)
      return
    }
    if (
      nodeValue.type === 'Identifier'
      && names.has(nodeValue.name)
      && isReferenceIdentifier(parent, parentKey)
    ) {
      identifiers.push(nodeValue)
      return
    }
    for (const [key, value] of Object.entries(nodeValue)) {
      if (!['comments', 'errors', 'extra', 'loc'].includes(key))
        collect(value, nodeValue, key)
    }
  }
  collect(node)

  const placeholders = new Map()
  for (const identifier of identifiers.sort((first, second) => first.start - second.start)) {
    if (!placeholders.has(identifier.name))
      placeholders.set(identifier.name, `__loop_binding_${placeholders.size}__`)
  }

  let normalised = source
  for (const identifier of identifiers.sort((first, second) => second.start - first.start)) {
    const start = identifier.start - node.start
    const end = identifier.end - node.start
    normalised = normalised.slice(0, start) + placeholders.get(identifier.name) + normalised.slice(end)
  }
  return normalised
}

function templateIdParts(body) {
  const parts = []
  let current = ''
  let expressionDepth = 0

  for (let index = 0; index < body.length; index++) {
    if (body[index] === '$' && body[index + 1] === '{') {
      expressionDepth++
      current += '${'
      index++
    }
    else if (body[index] === '}' && expressionDepth > 0) {
      expressionDepth--
      current += '}'
    }
    else if (/\s/.test(body[index]) && expressionDepth === 0) {
      if (current)
        parts.push(current.replace(/\s+/g, ''))
      current = ''
    }
    else {
      current += body[index]
    }
  }

  if (expressionDepth !== 0)
    return
  if (current)
    parts.push(current.replace(/\s+/g, ''))
  return parts
}

function idTokensFromTemplate(source, bindings, node) {
  if (!source.startsWith('`') || !source.endsWith('`'))
    return

  const body = source.slice(1, -1)
  if ((node && node.expressions.length === 0) || (!node && !body.includes('${')))
    return staticIdSet(body)

  const keys = templateIdParts(body)
  if (!node || !keys)
    return

  const references = referencedBindings(node, bindings, body)
  const directReferences = node.expressions.flatMap((expression) => {
    const direct = unwrappedExpressionNode(expression)
    const binding = direct?.type === 'Identifier' ? bindings.get(direct.name) : undefined
    return binding?.injective ? [[direct.name, binding]] : []
  })
  if (directReferences.length !== node.expressions.length)
    return
  const directSegments = keys.flatMap(key => (
    [...key.matchAll(/\$\{([A-Z_$][\w$]*)\}/gi)].map((match, index, matches) => ({
      name: match[1],
      unsafeSeparator: index > 0 && !/\D/.test(key.slice(
        matches[index - 1].index + matches[index - 1][0].length,
        match.index,
      )),
    }))
  ))
  if (
    directSegments.length !== directReferences.length
    || directSegments.some(segment => segment.unsafeSeparator)
    || directSegments.some((segment, index) => segment.name !== directReferences[index][0])
    || (
      new Set(directReferences.map(([, binding]) => binding.loop)).size > 1
        && directReferences.some(([, binding]) => binding.position !== 'index')
    )
  ) {
    return
  }

  const scope = references.map(([name, binding]) => `${name}@${binding.loop}`).join(',')
  const scopes = [...new Set(directReferences.map(([, binding]) => binding.loop))]
  const collisionSource = normaliseTemplateBindings(source, node, references)
  const collisionKeys = templateIdParts(collisionSource.slice(1, -1))
  if (!keys || !collisionKeys || keys.length !== collisionKeys.length)
    return

  const tokens = keys.map((key, index) => ({
    collisionKey: `template:${collisionKeys[index]}`,
    dynamic: true,
    key: `template:${key}${scope ? `|scope:${scope}` : ''}`,
    scopes,
  }))
  return {
    guaranteedKeys: new Set(tokens.map(token => token.key)),
    mayBeEmpty: false,
    tokens,
  }
}

function expressionSlice(expression, node) {
  const offset = expression.ast?.start === 1 ? 1 : 0
  return expression.content.slice(node.start - offset, node.end - offset)
}

function bindingIdSet(name, binding) {
  if (!binding?.injective)
    return
  return {
    guaranteedKeys: new Set([`binding:${name}|scope:${name}@${binding.loop}`]),
    mayBeEmpty: false,
    tokens: [{
      bindingPosition: binding.position,
      collisionKey: 'binding:__loop_binding_0__',
      dynamic: true,
      key: `binding:${name}|scope:${name}@${binding.loop}`,
      scopes: [binding.loop],
    }],
  }
}

function expressionIdTokens(expression, bindings, node = expression?.ast) {
  if (!expression)
    return

  if (!node) {
    const source = expression.content.trim()
    if (/^(['"])[\s\S]*\1$/.test(source))
      return staticIdSet(source.slice(1, -1))
    if (source.startsWith('`'))
      return idTokensFromTemplate(source, bindings)
    if (/^[A-Z_$][\w$]*$/i.test(source) && !['null', 'undefined'].includes(source))
      return bindingIdSet(source, bindings.get(source))
    if (['undefined', 'null'].includes(source))
      return { guaranteedKeys: new Set(), mayBeEmpty: true, tokens: [] }
    if (/^(?:false|true|[-+]?\d+(?:\.\d+)?)$/.test(source))
      return staticIdSet(source)
    return
  }

  if (node.type === 'StringLiteral')
    return staticIdSet(node.value)
  if (node.type === 'Identifier' && node.name !== 'undefined')
    return bindingIdSet(node.name, bindings.get(node.name))
  if (node.type === 'TemplateLiteral')
    return idTokensFromTemplate(expressionSlice(expression, node), bindings, node)
  if (node.type === 'ConditionalExpression') {
    const consequent = expressionIdTokens(expression, bindings, node.consequent)
    const alternate = expressionIdTokens(expression, bindings, node.alternate)
    if (consequent === undefined || alternate === undefined)
      return
    return {
      guaranteedKeys: new Set([...consequent.guaranteedKeys].filter(key => alternate.guaranteedKeys.has(key))),
      mayBeEmpty: consequent.mayBeEmpty || alternate.mayBeEmpty,
      tokens: [...new Map(
        [...consequent.tokens, ...alternate.tokens].map(token => [token.key, token]),
      ).values()],
    }
  }
  if (node.type === 'LogicalExpression')
    return
  if (['TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(node.type))
    return expressionIdTokens(expression, bindings, node.expression)
  if (
    node.type === 'NullLiteral'
    || (node.type === 'Identifier' && node.name === 'undefined')
  ) {
    return { guaranteedKeys: new Set(), mayBeEmpty: true, tokens: [] }
  }
  if (node.type === 'BooleanLiteral' || node.type === 'NumericLiteral')
    return staticIdSet(String(node.value))
}

function idTokens(element, name, bindings = new Map()) {
  const properties = namedProperties(element, name)
  if (properties.length !== 1)
    return

  const property = properties[0]
  if (property.kind === 'static') {
    if (!property.value)
      return { guaranteedKeys: new Set(), mayBeEmpty: true, tokens: [] }
    return staticIdSet(property.value)
  }
  return expressionIdTokens(property.expression, bindings)
}

function displayId(token) {
  return token.key.replace(/^(?:static|template):/, '').replace(/\|scope:.*$/, '')
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function dynamicIdMatchesStatic(dynamicToken, staticToken) {
  if (!staticToken.collisionKey.startsWith('static:'))
    return false
  const staticId = staticToken.collisionKey.slice('static:'.length)

  if (dynamicToken.collisionKey.startsWith('binding:')) {
    return dynamicToken.bindingPosition === 'index'
      ? /^(?:0|[1-9]\d*)$/.test(staticId)
      : staticId.length > 0
  }
  if (!dynamicToken.collisionKey.startsWith('template:'))
    return false

  const family = dynamicToken.collisionKey.slice('template:'.length)
  const placeholder = /\$\{__loop_binding_\d+__\}/g
  let pattern = '^'
  let cursor = 0
  for (const match of family.matchAll(placeholder)) {
    pattern += escapeRegularExpression(family.slice(cursor, match.index))
    pattern += '\\S+'
    cursor = match.index + match[0].length
  }
  if (cursor === 0)
    return false
  pattern += `${escapeRegularExpression(family.slice(cursor))}$`
  return new RegExp(pattern).test(staticId)
}

function mountCopy(mount) {
  return {
    guards: new Map(mount.guards),
    bindings: new Map(mount.bindings),
    hidden: mount.hidden,
    loops: new Set(mount.loops),
    visibility: new Set(mount.visibility),
  }
}

function contextsOverlap(first, second) {
  for (const [guard, branch] of first.guards) {
    if (second.guards.has(guard) && second.guards.get(guard) !== branch)
      return false
  }
  return true
}

function targetGuaranteed(owner, target, requireVisible = false) {
  for (const [guard, branch] of target.mount.guards) {
    if (owner.mount.guards.get(guard) !== branch)
      return false
  }
  for (const loop of target.mount.loops) {
    if (!owner.mount.loops.has(loop))
      return false
  }
  if (requireVisible) {
    if (target.mount.hidden)
      return false
    for (const guard of target.mount.visibility) {
      if (!owner.mount.visibility.has(guard))
        return false
    }
  }
  return true
}

function isTransparentBranchSibling(node) {
  return node.type === AST_COMMENT || (node.type === AST_TEXT && node.content.trim() === '')
}

function collectPatternBindings(pattern, bindings) {
  if (!pattern)
    return
  if (pattern.type === 'Identifier') {
    bindings.add(pattern.name)
    return
  }
  if (pattern.type === 'AssignmentPattern') {
    collectPatternBindings(pattern.left, bindings)
    return
  }
  if (pattern.type === 'RestElement') {
    collectPatternBindings(pattern.argument, bindings)
    return
  }
  if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements)
      collectPatternBindings(element, bindings)
    return
  }
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties)
      collectPatternBindings(property.type === 'RestElement' ? property.argument : property.value, bindings)
  }
}

function vForBindings(forDirective) {
  const bindings = new Map()
  for (const [position, alias] of ['value', 'key', 'index']
    .map(name => [name, forDirective.forParseResult?.[name]])
    .filter(([, alias]) => Boolean(alias))) {
    if (/^[A-Z_$][\w$]*$/i.test(alias.content)) {
      bindings.set(alias.content, { injective: position === 'key', position })
      continue
    }
    if (alias.ast?.type === 'ArrowFunctionExpression') {
      const names = new Set()
      collectPatternBindings(alias.ast.params[0], names)
      for (const name of names)
        bindings.set(name, { injective: false, position })
    }
  }
  return bindings
}

function occurrenceText(occurrence) {
  function text(node) {
    if (node.type === AST_TEXT)
      return node.content
    if (node.type === AST_INTERPOLATION)
      return ' '
    return (node.children ?? []).map(text).join(' ')
  }
  return text(occurrence.node).replace(/\s+/g, ' ').trim()
}

function hasGuaranteedAccessibleText(nodes) {
  const nodeGuaranteesText = (node) => {
    if (node.type === AST_TEXT)
      return node.content.trim().length > 0
    if (node.type === AST_INTERPOLATION)
      return guaranteedNonEmptyExpression(node.content)
    if (node.type !== AST_ELEMENT || directive(node, 'for') || staticallyHidden(node))
      return false

    const show = directive(node, 'show')
    if (show && show.exp?.content.trim() !== 'true')
      return false
    return hasGuaranteedAccessibleText(node.children)
  }

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (isTransparentBranchSibling(node))
      continue

    if (node.type === AST_ELEMENT && directive(node, 'if')) {
      const branches = [node]
      let branchIndex = index
      let exhaustive = false

      while (!exhaustive) {
        let nextIndex = branchIndex + 1
        while (nextIndex < nodes.length && isTransparentBranchSibling(nodes[nextIndex]))
          nextIndex++
        const next = nodes[nextIndex]
        if (next?.type !== AST_ELEMENT)
          break
        if (directive(next, 'else-if')) {
          branches.push(next)
          branchIndex = nextIndex
          continue
        }
        if (directive(next, 'else')) {
          branches.push(next)
          branchIndex = nextIndex
          exhaustive = true
        }
        break
      }

      if (exhaustive && branches.every(nodeGuaranteesText))
        return true
      index = branchIndex
      continue
    }

    if (
      node.type === AST_ELEMENT
      && (directive(node, 'else-if') || directive(node, 'else'))
    ) {
      continue
    }
    if (nodeGuaranteesText(node))
      return true
  }

  return false
}

function occurrenceHasGuaranteedAccessibleText(occurrence) {
  return !occurrence.mount.hidden && hasGuaranteedAccessibleText(occurrence.node.children)
}

function occurrenceName(occurrence, fallbackIndex = 0) {
  const ids = idTokens(occurrence.node, 'id', occurrence.mount.bindings)
  return ids?.tokens.length === 1 ? `"${displayId(ids.tokens[0])}"` : `${occurrence.node.tag} ${fallbackIndex + 1}`
}

function isFormControl(occurrence) {
  if (!['input', 'select', 'textarea'].includes(occurrence.node.tag))
    return false
  return staticValue(occurrence.node, 'type') !== 'hidden'
}

function hasRequiredSemantics(occurrence) {
  return nativeBoolean(occurrence.node, 'required') || ariaRequired(occurrence.node)
}

function isDescendantOf(occurrence, ancestor) {
  let current = occurrence.parent
  while (current) {
    if (current === ancestor)
      return true
    current = current.parent
  }
  return false
}

async function loadDiskUnit(filename, auditor) {
  if (auditor.units.has(filename))
    return auditor.units.get(filename)
  if (
    !isWithinDirectory(auditor.docsRoot, filename)
    && !isWithinDirectory(auditor.realDocsRoot, filename)
  ) {
    auditor.failures.push(`${filename}: imported component resolves outside the documentation root`)
    return
  }

  let canonicalFilename
  try {
    canonicalFilename = await realpath(filename)
  }
  catch (error) {
    if (error?.code === 'ENOENT') {
      auditor.failures.push(`${relative(auditor.docsRoot, filename)}: imported Vue component does not exist`)
      return
    }
    const errorCode = error?.code ? ` (${error.code})` : ''
    auditor.failures.push(`${relative(auditor.docsRoot, filename)}: imported Vue component cannot be resolved${errorCode}`)
    return
  }
  if (!isWithinDirectory(auditor.realDocsRoot, canonicalFilename)) {
    auditor.failures.push(`${relative(auditor.docsRoot, filename)}: imported component resolves outside the documentation root through a symbolic link`)
    return
  }

  const cachedUnit = auditor.units.get(canonicalFilename)
  if (cachedUnit) {
    auditor.units.set(filename, cachedUnit)
    return cachedUnit
  }

  const source = await readFile(canonicalFilename, 'utf8')

  const unit = parseTemplateUnit({
    displayName: relative(auditor.realDocsRoot, canonicalFilename),
    filename: canonicalFilename,
    source,
  }, auditor.failures)
  if (unit) {
    auditor.units.set(canonicalFilename, unit)
    auditor.units.set(filename, unit)
  }
  return unit
}

function componentReferenceName(element) {
  if (element.tag !== 'component')
    return element.tag

  const properties = namedProperties(element, 'is')
  if (properties.length !== 1)
    return
  const property = properties[0]
  const node = unwrappedExpressionNode(property.expression?.ast)
  if (property.kind === 'static')
    return property.value
  if (node?.type === 'Identifier')
    return node.name
  if (node?.type === 'StringLiteral')
    return node.value
  const source = property.expression?.content.trim()
  if (/^[A-Z_$][\w$]*$/i.test(source ?? ''))
    return source
  const string = source?.match(/^(['"])([A-Z_$][\w$]*)\1$/i)
  if (string)
    return string[2]
}

async function componentUnit(unit, element, auditor) {
  const resolvedName = componentReferenceName(element)
  if (element.tag === 'component') {
    if (!resolvedName || !unit.imports.has(componentName(resolvedName))) {
      auditor.failures.push(`${unit.displayName}: dynamic <component :is> must name one imported Vue component literally`)
      return
    }
  }

  const importedPath = unit.imports.get(componentName(resolvedName))
  if (!importedPath)
    return

  const filename = importedPath.startsWith('@/')
    ? resolve(auditor.docsRoot, importedPath.slice(2))
    : resolve(dirname(unit.filename), importedPath)
  if (
    !isWithinDirectory(auditor.docsRoot, filename)
    && !isWithinDirectory(auditor.realDocsRoot, filename)
  ) {
    auditor.failures.push(`${unit.displayName}: imported component resolves outside the documentation root`)
    return
  }
  return auditor.units.get(filename) ?? loadDiskUnit(filename, auditor)
}

async function expandChildren(unit, children, frame, state, auditor) {
  let conditionalChain

  for (const child of children) {
    if (child.type !== AST_ELEMENT) {
      if (!isTransparentBranchSibling(child))
        conditionalChain = undefined
      continue
    }

    const ifDirective = directive(child, 'if')
    const elseIfDirective = directive(child, 'else-if')
    const elseDirective = directive(child, 'else')
    let branch
    if (ifDirective) {
      conditionalChain = { branch: 0, key: `if:${state.nextMountId++}` }
      branch = { key: conditionalChain.key, value: 0 }
    }
    else if ((elseIfDirective || elseDirective) && conditionalChain) {
      conditionalChain.branch++
      branch = { key: conditionalChain.key, value: conditionalChain.branch }
    }
    else {
      conditionalChain = undefined
    }

    const mount = mountCopy(frame.mount)
    if (branch)
      mount.guards.set(branch.key, branch.value)
    const forDirective = directive(child, 'for')
    if (forDirective) {
      const loop = `for:${state.nextMountId++}`
      mount.loops.add(loop)
      for (const [name, binding] of vForBindings(forDirective))
        mount.bindings.set(name, { ...binding, loop })
    }
    const showDirective = directive(child, 'show')
    if (showDirective && showDirective.exp?.content.trim() !== 'true') {
      mount.visibility.add(`show:${state.nextMountId++}`)
      if (provablyFalseExpression(showDirective.exp))
        mount.hidden = true
    }
    if (staticallyHidden(child))
      mount.hidden = true

    await expandElement(unit, child, { ...frame, mount }, state, auditor)
  }
}

function slotName(slotDirective) {
  if (!slotDirective?.arg)
    return 'default'
  return slotDirective.arg.isStatic ? slotDirective.arg.content : undefined
}

function addSuppliedSlot(slots, name, supplied) {
  const entries = slots.get(name) ?? []
  entries.push(supplied)
  slots.set(name, entries)
}

function suppliedSlots(unit, element, inheritedSlots, callerBindings, failures) {
  const slots = new Map()
  const componentSlot = directive(element, 'slot')
  if (componentSlot) {
    const name = slotName(componentSlot)
    if (!name) {
      failures.push(`${unit.displayName}: dynamic component slot names cannot be audited`)
    }
    else {
      addSuppliedSlot(slots, name, {
        bindings: new Map(callerBindings),
        children: element.children,
        slots: inheritedSlots,
        unit,
      })
    }
    return slots
  }

  const defaultChildren = []
  const namedEntries = new Map()
  for (const child of element.children) {
    const templateSlot = child.type === AST_ELEMENT && child.tagType === ELEMENT_TEMPLATE
      ? directive(child, 'slot')
      : undefined
    if (!templateSlot) {
      defaultChildren.push(child)
      continue
    }

    const name = slotName(templateSlot)
    if (!name) {
      failures.push(`${unit.displayName}: dynamic component slot names cannot be audited`)
    }
    else {
      let supplied = namedEntries.get(name)
      if (!supplied) {
        supplied = {
          bindings: new Map(callerBindings),
          children: [],
          slots: inheritedSlots,
          unit,
        }
        namedEntries.set(name, supplied)
        addSuppliedSlot(slots, name, supplied)
      }
      supplied.children.push(child)
    }
  }
  if (defaultChildren.length > 0) {
    addSuppliedSlot(slots, 'default', {
      bindings: new Map(callerBindings),
      children: defaultChildren,
      slots: inheritedSlots,
      unit,
    })
  }
  return slots
}

function hasValidationContent(nodes) {
  return nodes.some((node) => {
    if (node.type !== AST_ELEMENT)
      return false
    if (['form', 'input', 'select', 'textarea'].includes(node.tag))
      return true
    if (node.props.some(prop => (
      prop.type === AST_ATTRIBUTE && prop.name.startsWith('data-validation-')
    ))) {
      return true
    }
    return hasValidationContent(node.children)
  })
}

function hasSlotOutput(nodes) {
  return nodes.some((node) => {
    if (node.type === AST_COMMENT)
      return false
    if (node.type === AST_TEXT)
      return node.content.trim() !== ''
    if (node.type === AST_INTERPOLATION)
      return true
    if (node.type !== AST_ELEMENT)
      return false
    return node.tagType === ELEMENT_TEMPLATE ? hasSlotOutput(node.children) : true
  })
}

function hasGuaranteedSlotOutput(nodes) {
  const nodeGuaranteesOutput = (node) => {
    if (node.type === AST_TEXT)
      return node.content.trim() !== ''
    if (node.type === AST_INTERPOLATION)
      return true
    if (node.type !== AST_ELEMENT)
      return false
    if (directive(node, 'for'))
      return false
    return node.tagType === ELEMENT_TEMPLATE ? hasGuaranteedSlotOutput(node.children) : true
  }

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (isTransparentBranchSibling(node))
      continue

    if (node.type === AST_ELEMENT && directive(node, 'if')) {
      const branches = [node]
      let branchIndex = index
      let exhaustive = false

      while (!exhaustive) {
        let nextIndex = branchIndex + 1
        while (nextIndex < nodes.length && isTransparentBranchSibling(nodes[nextIndex]))
          nextIndex++
        const next = nodes[nextIndex]
        if (next?.type !== AST_ELEMENT)
          break
        if (directive(next, 'else-if')) {
          branches.push(next)
          branchIndex = nextIndex
          continue
        }
        if (directive(next, 'else')) {
          branches.push(next)
          branchIndex = nextIndex
          exhaustive = true
        }
        break
      }

      if (exhaustive && branches.every(nodeGuaranteesOutput))
        return true
      index = branchIndex
      continue
    }

    if (
      node.type === AST_ELEMENT
      && (directive(node, 'else-if') || directive(node, 'else'))
    ) {
      continue
    }
    if (nodeGuaranteesOutput(node))
      return true
  }

  return false
}

async function expandElement(unit, element, frame, state, auditor) {
  if (element.tagType === ELEMENT_SLOT) {
    const boundName = namedProperties(element, 'name').find(property => property.kind === 'bound')
    if (boundName) {
      auditor.failures.push(`${unit.displayName}: dynamic <slot> names cannot be audited`)
      return
    }
    const name = staticValue(element, 'name') ?? 'default'
    const supplied = frame.slots.get(name)
    const suppliedHasOutput = supplied?.some(entry => hasSlotOutput(entry.children))
    const suppliedGuaranteed = supplied?.some(entry => hasGuaranteedSlotOutput(entry.children))
    if (suppliedHasOutput) {
      for (const entry of supplied) {
        const mount = mountCopy(frame.mount)
        mount.bindings = new Map(entry.bindings)
        await expandChildren(entry.unit, entry.children, {
          ...frame,
          mount,
          slots: entry.slots,
        }, state, auditor)
      }
      if (!suppliedGuaranteed)
        await expandChildren(unit, element.children, frame, state, auditor)
    }
    else {
      await expandChildren(unit, element.children, frame, state, auditor)
    }
    return
  }

  if (element.tagType === ELEMENT_TEMPLATE) {
    await expandChildren(unit, element.children, frame, state, auditor)
    return
  }

  const occurrence = {
    componentTrail: frame.componentTrail,
    form: frame.form,
    mount: frame.mount,
    node: element,
    parent: frame.parent,
    unit,
  }

  if (element.tagType === ELEMENT_COMPONENT) {
    state.markerElements.push(occurrence)
    const childUnit = await componentUnit(unit, element, auditor)
    if (!childUnit) {
      if (frame.form || hasValidationContent(element.children))
        auditor.failures.push(`${unit.displayName}: <${element.tag}> with validation content is not a resolvable local Vue component`)
      await expandChildren(unit, element.children, {
        ...frame,
        parent: occurrence,
      }, state, auditor)
      if (frame.form)
        state.unresolvedComponents.push({ form: frame.form, occurrence })
      return
    }
    if (frame.stack.includes(childUnit.key)) {
      auditor.failures.push(`${unit.displayName}: component cycle prevents auditing <${element.tag}>`)
      return
    }

    state.reachedUnits.add(childUnit.key)
    const childMount = mountCopy(frame.mount)
    childMount.bindings.clear()
    await expandChildren(childUnit, childUnit.ast.children, {
      componentTrail: [...frame.componentTrail, childUnit.key],
      form: frame.form,
      mount: childMount,
      parent: occurrence,
      slots: suppliedSlots(unit, element, frame.slots, frame.mount.bindings, auditor.failures),
      stack: [...frame.stack, childUnit.key],
    }, state, auditor)
    return
  }

  if (element.tagType !== ELEMENT_NATIVE)
    return

  state.elements.push(occurrence)
  state.markerElements.push(occurrence)
  let form = frame.form
  if (element.tag === 'form') {
    if (form)
      auditor.failures.push(`${unit.displayName}: nested native forms are not valid`)
    form = occurrence
    occurrence.form = occurrence
    state.forms.push(occurrence)
  }

  await expandChildren(unit, element.children, {
    ...frame,
    form,
    parent: occurrence,
  }, state, auditor)
}

async function expandedDocument(entries, auditor) {
  const state = {
    elements: [],
    forms: [],
    markerElements: [],
    nextMountId: 1,
    reachedUnits: new Set(),
    unresolvedComponents: [],
  }

  for (const unit of entries) {
    state.reachedUnits.add(unit.key)
    await expandChildren(unit, unit.ast.children, {
      componentTrail: [unit.key],
      form: undefined,
      mount: {
        bindings: new Map(),
        guards: new Map(),
        hidden: false,
        loops: new Set(),
        visibility: new Set(),
      },
      parent: undefined,
      slots: new Map(),
      stack: [unit.key],
    }, state, auditor)
  }

  return state
}

function idIndex(state, failures) {
  const collisions = new Map()
  const targets = new Map()
  const allFacts = []

  for (const occurrence of state.elements) {
    if (!hasProperty(occurrence.node, 'id'))
      continue
    const ids = idTokens(occurrence.node, 'id', occurrence.mount.bindings)
    if (!ids || ids.mayBeEmpty || ids.tokens.length !== 1) {
      failures.push(`${occurrence.unit.displayName}: <${occurrence.node.tag}> id expression cannot be resolved statically`)
      continue
    }

    const token = ids.tokens[0]
    const uncoveredLoops = [...occurrence.mount.loops].filter(loop => !token.scopes.includes(loop))
    if (uncoveredLoops.length > 0)
      failures.push(`${occurrence.unit.displayName}: id "${displayId(token)}" is repeated by v-for and must depend on every loop binding`)
    const fact = { occurrence, token }
    const facts = targets.get(token.key) ?? []
    facts.push(fact)
    targets.set(token.key, facts)
    const collisionFacts = collisions.get(token.collisionKey) ?? []
    collisionFacts.push(fact)
    collisions.set(token.collisionKey, collisionFacts)
    allFacts.push(fact)
  }

  for (const facts of collisions.values()) {
    let duplicate = false
    for (let firstIndex = 0; firstIndex < facts.length && !duplicate; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < facts.length; secondIndex++) {
        if (contextsOverlap(facts[firstIndex].occurrence.mount, facts[secondIndex].occurrence.mount)) {
          failures.push(`${facts[firstIndex].occurrence.unit.displayName}: duplicate id "${displayId(facts[firstIndex].token)}" can be mounted more than once`)
          duplicate = true
          break
        }
      }
    }
  }

  const dynamicFacts = allFacts.filter(fact => fact.token.dynamic)
  const staticFacts = allFacts.filter(fact => !fact.token.dynamic)
  for (const dynamic of dynamicFacts) {
    for (const staticFact of staticFacts) {
      if (
        contextsOverlap(dynamic.occurrence.mount, staticFact.occurrence.mount)
        && dynamicIdMatchesStatic(dynamic.token, staticFact.token)
      ) {
        failures.push(`${dynamic.occurrence.unit.displayName}: dynamic id family "${displayId(dynamic.token)}" can collide with static id "${displayId(staticFact.token)}"`)
      }
    }
  }

  return targets
}

function resolveIdReferences(owner, name, targets, failures, description, options = {}) {
  const references = idTokens(owner.node, name, owner.mount.bindings)
  if (!references || references.tokens.length === 0) {
    failures.push(`${owner.unit.displayName}: ${description} has an unknown or empty ${name} expression`)
    return []
  }
  if (references.mayBeEmpty && !options.allowEmpty) {
    failures.push(`${owner.unit.displayName}: ${description} can omit ${name} at runtime`)
    return []
  }
  if (options.single && references.tokens.length !== 1) {
    failures.push(`${owner.unit.displayName}: ${description} ${name} must contain exactly one id`)
    return []
  }
  const referenceTokens = options.guaranteedOnly
    ? references.tokens.filter(token => references.guaranteedKeys.has(token.key))
    : references.tokens
  if (referenceTokens.length === 0) {
    failures.push(`${owner.unit.displayName}: ${description} does not persistently reference ${name}`)
    return []
  }

  const resolved = []
  for (const token of referenceTokens) {
    const candidates = targets.get(token.key) ?? []
    const guaranteed = candidates.filter(candidate => targetGuaranteed(owner, candidate.occurrence, options.requireVisible))
    if (guaranteed.length !== 1) {
      const reason = candidates.length === 0 ? 'missing' : 'conditionally or multiply mounted'
      failures.push(`${owner.unit.displayName}: ${description} references ${reason} target "${displayId(token)}" through ${name}`)
      continue
    }
    resolved.push(guaranteed[0].occurrence)
  }
  return resolved
}

function markerFailure(occurrence, marker, failures) {
  if (markerState(occurrence.node, marker) === 'invalid') {
    failures.push(`${occurrence.unit.displayName}: ${marker} must be a valueless static attribute`)
    return true
  }
  return false
}

function nearestAncestor(occurrence, tag) {
  let current = occurrence.parent
  while (current) {
    if (current.node?.tag === tag)
      return current
    current = current.parent
  }
}

function auditControlNames(controls, labels, targets, failures) {
  for (const [controlIndex, control] of controls.entries()) {
    const controlName = occurrenceName(control, controlIndex)
    let named = namedProperties(control.node, 'aria-label').some(property => (
      property.kind === 'static'
        ? Boolean(property.value?.trim())
        : guaranteedNonEmptyExpression(property.expression)
    ))
    const wrappingLabel = nearestAncestor(control, 'label')
    named ||= Boolean(wrappingLabel && occurrenceHasGuaranteedAccessibleText(wrappingLabel))

    const controlIds = idTokens(control.node, 'id', control.mount.bindings)?.tokens ?? []
    if (!named && controlIds.length === 1) {
      named = labels.some((label) => {
        const forTokens = idTokens(label.node, 'for', label.mount.bindings)
        return forTokens
          && !forTokens.mayBeEmpty
          && forTokens.tokens.length === 1
          && forTokens.tokens.some(token => token.key === controlIds[0].key)
          && targetGuaranteed(control, label, true)
          && occurrenceHasGuaranteedAccessibleText(label)
      })
    }

    if (hasProperty(control.node, 'aria-labelledby')) {
      const labelledBy = resolveIdReferences(
        control,
        'aria-labelledby',
        targets,
        failures,
        `control ${controlName}`,
        { requireVisible: true },
      )
      named ||= labelledBy.length > 0 && labelledBy.every(occurrenceHasGuaranteedAccessibleText)
    }

    if (!named)
      failures.push(`${control.unit.displayName}: control ${controlName} is missing an accessible name`)
  }
}

function auditLabels(labels, targets, failures) {
  for (const label of labels) {
    if (hasProperty(label.node, 'for'))
      resolveIdReferences(label, 'for', targets, failures, '<label>', { single: true })
  }
}

function auditNativeIdReferences(elements, targets, failures) {
  for (const element of elements) {
    for (const name of ['aria-describedby', 'aria-labelledby']) {
      if (!hasProperty(element.node, name))
        continue
      resolveIdReferences(
        element,
        name,
        targets,
        failures,
        `<${element.node.tag}>`,
        { allowEmpty: true, requireVisible: name === 'aria-labelledby' },
      )
    }
  }
}

function auditControlErrors(controls, targets, failures) {
  for (const [controlIndex, control] of controls.entries()) {
    const controlName = occurrenceName(control, controlIndex)
    const skip = markerState(control.node, 'data-validation-skip')
    if (skip === 'invalid')
      markerFailure(control, 'data-validation-skip', failures)
    if (skip === 'valid')
      continue

    if (!hasDynamicInvalidState(control.node))
      failures.push(`${control.unit.displayName}: control ${controlName} needs a dynamic aria-invalid state`)
    if (!hasProperty(control.node, 'aria-describedby')) {
      failures.push(`${control.unit.displayName}: control ${controlName} is missing error association`)
      continue
    }

    const described = resolveIdReferences(
      control,
      'aria-describedby',
      targets,
      failures,
      `control ${controlName}`,
      { allowEmpty: true },
    )
    if (described.length === 0)
      continue
    const hasAnnouncement = described.some(target => (
      !target.mount.hidden && hasAnnouncementStrategy(target.node)
    ))
    if (!hasAnnouncement)
      failures.push(`${control.unit.displayName}: error container for control ${controlName} is missing an announcement strategy`)
  }
}

function auditMarkerContracts(elements, failures) {
  const contracts = [
    ['data-validation-skip', isFormControl, 'a non-hidden input, select or textarea'],
    ['data-validation-optional', isFormControl, 'a non-hidden input, select or textarea'],
    ['data-validation-required-group', occurrence => occurrence.node.tag === 'fieldset', '<fieldset>'],
    ['data-validation-required-descendants', occurrence => occurrence.node.tag === 'form', '<form>'],
  ]

  for (const element of elements) {
    const objectBind = element.node.props.some(prop => (
      prop.type === AST_DIRECTIVE
      && prop.name === 'bind'
      && !prop.arg
    ))
    if (objectBind) {
      failures.push(`${element.unit.displayName}: validation-critical attributes cannot be supplied through argumentless v-bind on <${element.node.tag}>`)
    }

    for (const [marker, allowed, target] of contracts) {
      if (!hasProperty(element.node, marker))
        continue
      if (markerState(element.node, marker) === 'invalid')
        markerFailure(element, marker, failures)
      if (!allowed(element))
        failures.push(`${element.unit.displayName}: ${marker} is only valid on ${target}`)
    }
  }
}

function auditForm(form, state, targets, failures) {
  const controls = state.elements.filter(element => element.form === form && isFormControl(element))
  const validationControls = controls.filter(control => markerState(control.node, 'data-validation-skip') !== 'valid')
  const formName = `${form.unit.displayName}: complete form`
  const novalidate = nativeBooleanState(form.node, 'novalidate')

  if (novalidate !== 'true')
    failures.push(`${formName} is missing native validation bypass`)
  if (novalidate === 'invalid')
    failures.push(`${formName} novalidate must be declared exactly once`)
  else if (['false', 'unknown'].includes(novalidate))
    failures.push(`${formName} novalidate must be static or a literal true binding`)
  markerFailure(form, 'data-validation-required-descendants', failures)
  if (hasProperty(form.node, 'data-validation-optional-only'))
    failures.push(`${formName} must classify optional controls individually`)
  if (hasProperty(form.node, 'data-validation-optional'))
    failures.push(`${formName} optional marker on <form> is only valid on a non-hidden input, select or textarea`)

  const groupControls = new Set()
  let validRequiredGroups = 0
  const fieldsets = state.elements.filter(element => element.form === form && element.node.tag === 'fieldset')
  for (const fieldset of fieldsets) {
    const marker = markerState(fieldset.node, 'data-validation-required-group')
    if (marker === 'invalid')
      markerFailure(fieldset, 'data-validation-required-group', failures)

    const descendants = controls.filter(control => nearestAncestor(control, 'fieldset') === fieldset)
    const checkboxes = descendants.filter(control => (
      control.node.tag === 'input' && staticValue(control.node, 'type') === 'checkbox'
    ))
    const legend = state.elements.find(element => (
      element.form === form && element.node.tag === 'legend' && element.parent === fieldset
    ))
    const legendText = legend && targetGuaranteed(fieldset, legend, true) ? occurrenceText(legend) : ''

    if (marker === 'absent') {
      if (/at least one/i.test(legendText) && /\brequired\b/i.test(legendText))
        failures.push(`${formName} required checkbox group is missing its checker declaration`)
      continue
    }
    if (marker !== 'valid')
      continue

    let valid = true
    if (!/at least one/i.test(legendText) || !/\brequired\b/i.test(legendText)) {
      failures.push(`${formName} required checkbox group needs a legend that says at least one choice is required`)
      valid = false
    }
    if (
      checkboxes.length < 2
      || checkboxes.some(control => (
        hasRequiredSemantics(control)
        || markerState(control.node, 'data-validation-optional') === 'valid'
        || markerState(control.node, 'data-validation-skip') === 'valid'
      ))
    ) {
      failures.push(`${formName} required checkbox group must keep its individual choices unclassified`)
      valid = false
    }

    const groupInstructions = hasProperty(fieldset.node, 'aria-describedby')
      ? resolveIdReferences(
          fieldset,
          'aria-describedby',
          targets,
          failures,
          'required checkbox group',
          { guaranteedOnly: true },
        )
      : []
    const validInstructions = groupInstructions.filter((instruction) => {
      const text = occurrenceText(instruction)
      return isDescendantOf(instruction, fieldset)
        && targetGuaranteed(fieldset, instruction, true)
        && /at least one/i.test(text)
        && /\brequired\b/i.test(text)
    })
    if (
      validInstructions.length === 0
      || checkboxes.some((control) => {
        const descriptions = idTokens(control.node, 'aria-describedby', control.mount.bindings)
        const tokens = descriptions?.tokens.filter(token => descriptions.guaranteedKeys.has(token.key)) ?? []
        const instructionTokens = validInstructions.flatMap(instruction => (
          idTokens(instruction.node, 'id', instruction.mount.bindings)?.tokens ?? []
        ))
        return !instructionTokens.some(instruction => tokens.some(token => token.key === instruction.key))
      })
    ) {
      failures.push(`${formName} required checkbox group needs a persistent described instruction`)
      valid = false
    }

    if (valid) {
      validRequiredGroups++
      for (const control of checkboxes)
        groupControls.add(control)
    }
  }

  for (const element of state.elements.filter(element => element.form === form)) {
    if (element !== form && hasProperty(element.node, 'data-validation-required-descendants'))
      failures.push(`${formName} required-descendants marker belongs on the form, not <${element.node.tag}>`)
    if (hasProperty(element.node, 'data-validation-optional') && !isFormControl(element))
      failures.push(`${formName} optional marker on <${element.node.tag}> is only valid on a non-hidden input, select or textarea`)
  }

  for (const [controlIndex, control] of controls.entries()) {
    const controlName = occurrenceName(control, controlIndex)
    const required = nativeBooleanState(control.node, 'required')
    const ariaRequired = ariaRequiredState(control.node)
    if (
      markerState(control.node, 'data-validation-skip') === 'valid'
      && markerState(control.node, 'data-validation-optional') === 'valid'
    ) {
      failures.push(`${formName} control ${controlName} cannot combine data-validation-skip and data-validation-optional`)
    }
    if (required === 'invalid') {
      failures.push(`${formName} control ${controlName} required must be declared exactly once`)
    }
    else if (['false', 'unknown'].includes(required)) {
      failures.push(`${formName} control ${controlName} required must be static or a literal true binding`)
    }
    if (ariaRequired === 'unknown')
      failures.push(`${formName} control ${controlName} aria-required must be a literal true or false`)
    if (required === 'true' && ariaRequired === 'false')
      failures.push(`${formName} control ${controlName} cannot combine native required with aria-required=false`)
  }

  for (const [controlIndex, control] of validationControls.entries()) {
    const controlName = occurrenceName(control, controlIndex)
    const optional = markerState(control.node, 'data-validation-optional')
    if (optional === 'invalid')
      markerFailure(control, 'data-validation-optional', failures)

    const classifications = Number(hasRequiredSemantics(control))
      + Number(optional === 'valid')
      + Number(groupControls.has(control))
    if (classifications === 0)
      failures.push(`${formName} control ${controlName} must be classified as required, optional or a declared required-group member`)
    else if (classifications > 1)
      failures.push(`${formName} control ${controlName} has conflicting requiredness classifications`)
  }

  const descendantControls = validationControls.filter(control => control.componentTrail.length > form.componentTrail.length)
  const descendantRequired = descendantControls.some(hasRequiredSemantics)
    || [...groupControls].some(control => descendantControls.includes(control))
  const descendantMarker = markerState(form.node, 'data-validation-required-descendants')
  const unresolved = state.unresolvedComponents.some(component => component.form === form)
  if (descendantRequired && descendantMarker === 'absent')
    failures.push(`${formName} has required controls in imported descendants but is missing data-validation-required-descendants`)
  if (descendantMarker === 'valid' && (!descendantRequired || unresolved))
    failures.push(`${formName} required-descendants marker is not backed by resolved required child controls`)

  const requiredCount = controls.filter(hasRequiredSemantics).length + validRequiredGroups
  let requiredInstructions = []
  if (hasProperty(form.node, 'aria-describedby')) {
    requiredInstructions = resolveIdReferences(
      form,
      'aria-describedby',
      targets,
      failures,
      'form instructions',
      { guaranteedOnly: true },
    )
      .filter(instruction => (
        isDescendantOf(instruction, form)
        && targetGuaranteed(form, instruction, true)
        && /\brequired\b/i.test(occurrenceText(instruction))
      ))
  }
  if (requiredCount > 0 && requiredInstructions.length === 0)
    failures.push(`${formName} exposes required controls without a visible required instruction`)
  else if (requiredInstructions.length > 0 && requiredCount === 0)
    failures.push(`${formName} describes required fields but no control exposes required semantics`)
}

async function auditTemplateEntries(entries, auditor) {
  if (entries.length === 0)
    return new Set()
  const state = await expandedDocument(entries, auditor)
  const targets = idIndex(state, auditor.failures)
  const controls = state.elements.filter(isFormControl)
  const labels = state.elements.filter(element => element.node.tag === 'label')

  auditMarkerContracts(state.markerElements, auditor.failures)
  auditLabels(labels, targets, auditor.failures)
  auditNativeIdReferences(state.elements, targets, auditor.failures)
  auditControlNames(controls, labels, targets, auditor.failures)
  auditControlErrors(controls, targets, auditor.failures)
  for (const form of state.forms)
    auditForm(form, state, targets, auditor.failures)
  return state.reachedUnits
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

function renderedComponentImports(unit) {
  const imports = []

  function visit(node) {
    if (node.type !== AST_ELEMENT)
      return
    if (node.tagType === ELEMENT_COMPONENT) {
      const resolvedName = componentReferenceName(node)
      const importedPath = resolvedName && unit.imports.get(componentName(resolvedName))
      if (importedPath)
        imports.push(importedPath)
    }
    for (const child of node.children)
      visit(child)
  }

  for (const child of unit.ast.children)
    visit(child)
  return imports
}

function hasRenderedComponent(unit) {
  function visit(node) {
    return node.type === AST_ELEMENT
      && (node.tagType === ELEMENT_COMPONENT || node.children.some(visit))
  }
  return unit.ast.children.some(visit)
}

function withoutFrontmatter(source) {
  const lines = source.split('\n')
  if (lines[0]?.trim() !== '---')
    return source
  const end = lines.slice(1).findIndex(line => line.trim() === '---')
  return end < 0 ? source : lines.slice(end + 2).join('\n')
}

function renderedPageUnit(file, markdown, docsRoot, failures) {
  const source = withoutFencedCode(markdown)
  const scriptPattern = /<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi
  const scripts = [...source.matchAll(scriptPattern)].map(match => match[0])
  const template = withoutFrontmatter(withoutInlineCode(source.replace(scriptPattern, '')))
  const pageName = relative(dirname(file), file).replace(/[^\w-]/g, '-')

  return parseTemplateUnit({
    displayName: `${relative(docsRoot, file)}: rendered page`,
    filename: join(dirname(file), `.verific-rendered-${pageName}.vue`),
    source: `${scripts.join('\n')}\n<template>\n${template}\n</template>`,
  }, failures)
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
  const markdownUnits = new Map()
  const renderedPages = new Map()
  const auditor = {
    docsRoot,
    failures,
    realDocsRoot,
    units: new Map(),
  }

  for (const file of files)
    content.set(file, await readFile(file, 'utf8'))

  for (const [file, markdown] of content) {
    const units = markdownTemplateUnits(file, markdown, docsRoot, failures)
    markdownUnits.set(file, units)
    for (const unit of units) {
      if (auditor.units.has(unit.key))
        failures.push(`${unit.displayName}: duplicate labelled Vue example ${unit.filename}`)
      else
        auditor.units.set(unit.key, unit)
    }
  }

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
        const canonicalTarget = await realpath(target)
        if (!isWithinDirectory(realDocsRoot, canonicalTarget)) {
          failures.push(`${sourceName}: source import resolves outside the documentation root through a symbolic link: ${importedPath}`)
          continue
        }
        disclosedTargets.add(target)
        importedSources.set(target, await readFile(canonicalTarget, 'utf8'))
      }
      catch {
        failures.push(`${sourceName}: source import does not exist: ${importedPath}`)
      }
    }

    const renderedSource = withoutInlineCode(sourceWithoutCode)
    const pageUnit = (
      /\bfrom\s+(['"])[^'"]+\.vue\1/.test(sourceWithoutCode)
      || /<component(?:\s|>)/i.test(renderedSource)
    )
      ? renderedPageUnit(file, markdown, docsRoot, failures)
      : undefined
    const pageTargets = pageUnit ? renderedComponentImports(pageUnit) : []
    for (const componentPath of pageTargets) {
      const renderedTarget = sourceImportPath(docsRoot, file, componentPath)
      if (!disclosedTargets.has(renderedTarget)) {
        failures.push(`${relative(docsRoot, file)}: rendered component does not disclose its source: ${componentPath}`)
      }
    }
    if (pageUnit && hasRenderedComponent(pageUnit))
      renderedPages.set(file, pageUnit)
  }

  const reachedUnits = new Set()
  for (const units of markdownUnits.values()) {
    for (const unit of units.filter(candidate => hasElement(candidate.ast, 'form') || candidate.imports.size > 0)) {
      const reached = await auditTemplateEntries([unit], auditor)
      for (const key of reached)
        reachedUnits.add(key)
    }
  }

  for (const unit of renderedPages.values()) {
    auditor.units.set(unit.key, unit)
    const reached = await auditTemplateEntries([unit], auditor)
    for (const key of reached)
      reachedUnits.add(key)
  }

  const remainingVueFiles = new Set([
    ...exampleFiles,
    ...[...importedSources.keys()].filter(file => extname(file) === '.vue'),
  ])
  for (const file of remainingVueFiles) {
    const unit = await loadDiskUnit(file, auditor)
    if (!unit || reachedUnits.has(unit.key))
      continue
    const reached = await auditTemplateEntries([unit], auditor)
    for (const key of reached)
      reachedUnits.add(key)
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
  <form novalidate data-validation-required-descendants aria-describedby="descendant-required-instructions">
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
      { name: 'Logo cannot prove required descendants', path: descendantPath, mutated: originalDescendant.replace('    <RequiredNameField />\n    <RequiredPhoneField />', '    <Logo />\n    <Logo />'), expected: 'required-descendants marker is not backed by resolved required child controls' },
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
