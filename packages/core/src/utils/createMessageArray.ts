import type { MaybeRef } from 'vue'
import { unref } from 'vue'

export type Messages = string | readonly Messages[] | Readonly<Record<string, boolean>> | false

export function createMessageArray(messages: MaybeRef<Messages>): string[] {
  const value = unref(messages)

  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return (value as readonly Messages[]).flatMap(message => createMessageArray(message))
  }

  if (typeof value === 'object') {
    const conditionalMessages = value as Readonly<Record<string, boolean>>
    return Object.keys(conditionalMessages).filter(key => conditionalMessages[key])
  }

  return [value]
}
