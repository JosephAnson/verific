import type { App, Ref } from 'vue'
import type { Messages } from '../src/main'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, unref } from 'vue'
import { ErrorMessages } from '../src/main'

const mountedApps: App[] = []

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
})

describe('errorMessages', () => {
  it('exposes normalised messages through caller-owned markup', () => {
    const container = mountMessages([
      'Email is required',
      ['Email is invalid'],
      { 'Hidden message': false, 'Email is taken': true },
    ], ({ message, index }) => h('li', { 'data-index': index }, message))

    expect(container.childElementCount).toBe(3)
    expect(Array.from(container.querySelectorAll('li')).map(element => element.textContent)).toEqual([
      'Email is required',
      'Email is invalid',
      'Email is taken',
    ])
    expect(Array.from(container.querySelectorAll('li')).map(element => element.getAttribute('data-index'))).toEqual([
      '0',
      '1',
      '2',
    ])
  })

  it('renders no elements without a default slot', () => {
    const container = mountMessages('Email is required')

    expect(container.childElementCount).toBe(0)
  })

  it('does not render or expose an unsupported boolean message', () => {
    const renderMessage = vi.fn(({ message }: { message: string }) => h('p', message))
    const container = mountMessages(true as never, renderMessage)

    expect(container.childElementCount).toBe(0)
    expect(renderMessage).not.toHaveBeenCalled()
  })

  it('updates slot content when messages change', async () => {
    const messages = ref('Email is required')
    const container = mountMessages(messages, ({ message }) => h('p', message))

    expect(container.textContent).toBe('Email is required')

    messages.value = 'Email is invalid'
    await nextTick()

    expect(container.textContent).toBe('Email is invalid')
  })
})

function mountMessages(
  messages: Messages | Ref<string>,
  renderMessage?: (props: { message: string, index: number }) => ReturnType<typeof h>,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp(defineComponent({
    setup() {
      return () => h(
        ErrorMessages,
        { messages: unref(messages) },
        renderMessage ? { default: renderMessage } : undefined,
      )
    },
  }))
  app.mount(container)
  mountedApps.push(app)
  return container
}
