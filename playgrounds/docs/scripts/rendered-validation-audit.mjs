import { readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { babelParse, compileTemplate, parse as parseSfc } from '@vue/compiler-sfc'

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
  }

  for (const unit of entries) {
    state.reachedUnits.add(unit.key)
    await expandChildren(unit, unit.ast.children, {
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

function isWithinDirectory(directory, target) {
  const pathFromDirectory = relative(directory, target)
  return pathFromDirectory === ''
    || (!pathFromDirectory.startsWith(`..${sep}`) && pathFromDirectory !== '..' && !isAbsolute(pathFromDirectory))
}

export async function auditRenderedValidation({
  docsRoot,
  markdownEntries,
  realDocsRoot,
  renderedPageEntries,
  vueFiles,
}) {
  const auditFailures = []
  const markdownFailures = []
  const markdownUnits = new Map()
  const renderedPageFailures = new Map()
  const renderedPages = new Map()
  const renderedImportsByPage = new Map()
  const auditor = {
    docsRoot,
    failures: auditFailures,
    realDocsRoot,
    units: new Map(),
  }

  for (const [file, entries] of markdownEntries) {
    const units = []
    for (const entry of entries) {
      if (entry.failure) {
        markdownFailures.push(entry.failure)
        continue
      }
      const unit = parseTemplateUnit(entry, markdownFailures)
      if (unit)
        units.push(unit)
    }
    markdownUnits.set(file, units)
    for (const unit of units) {
      if (auditor.units.has(unit.key))
        markdownFailures.push(`${unit.displayName}: duplicate labelled Vue example ${unit.filename}`)
      else
        auditor.units.set(unit.key, unit)
    }
  }

  for (const [file, entry] of renderedPageEntries) {
    const failures = []
    const pageUnit = parseTemplateUnit(entry, failures)
    renderedPageFailures.set(file, failures)
    if (!pageUnit)
      continue

    renderedImportsByPage.set(file, renderedComponentImports(pageUnit))
    if (hasRenderedComponent(pageUnit))
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

  for (const file of vueFiles) {
    const unit = await loadDiskUnit(file, auditor)
    if (!unit || reachedUnits.has(unit.key))
      continue
    const reached = await auditTemplateEntries([unit], auditor)
    for (const key of reached)
      reachedUnits.add(key)
  }

  return {
    auditFailures,
    markdownFailures,
    renderedPageFailures,
    renderedImportsByPage,
  }
}
