import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { expandValidationBindings } from './rendered-validation-audit.mjs'

function expand(script, template) {
  const { descriptor } = parse(`<script setup>${script}</script><template>${template}</template>`)
  expandValidationBindings(descriptor)
  return descriptor.template.ast.children[0]
}

const setup = `import { useValidation } from '@verific/core'; const { on, group } = useValidation(schema, model)`

describe('inline binding accessibility audit', () => {
  it.each(['on', 'group'])('recognizes %s with an explicit error-container reference', (helper) => {
    const node = expand(setup, `<input v-bind="${helper}('email', { describedBy: 'email-errors' })">`)
    expect(node.props.some(prop => prop.name === 'aria-describedby' && prop.value.content === 'email-errors')).toBe(true)
    expect(node.props.some(prop => prop.name === 'bind' && prop.arg.content === 'aria-invalid')).toBe(true)
  })

  it.each([
    `on('email', { ...options, describedBy: 'errors' })`,
    `on('email', { describedBy: dynamicId })`,
    `on('email', { describedBy: 'a', describedBy: 'b' })`,
    `on('email', { id: 'overwritten', describedBy: 'errors' })`,
    `arbitraryAttrs`,
  ])('does not exempt an unknown or unsafe binding: %s', (expression) => {
    const node = expand(setup, `<input v-bind="${expression}">`)
    expect(node.props[0].arg).toBeUndefined()
  })

  it('does not trust an unrelated function called on', () => {
    const node = expand('const on = () => ({})', `<input v-bind="on('email', { describedBy: 'errors' })">`)
    expect(node.props[0].arg).toBeUndefined()
  })

  it('does not infer bindings shadowed by loop variables', () => {
    const node = expand(setup, `<div v-for="on in rows"><input v-bind="on('email', { describedBy: 'errors' })"></div>`)
    expect(node.children[0].props[0].arg).toBeUndefined()
  })
})
