import type { MaybeRef } from 'vue'

export type Messages = string | Messages[] | Record<string, boolean> | false

export function createMessageArray(errors: MaybeRef<Messages>): string[] {
  if (!errors) {
    return []
  }
  else if (Array.isArray(errors)) {
    return errors.reduce<string[]>((acc, error) => {
      return acc.concat(createMessageArray(error))
    }, [])
  }
  else if (typeof errors === 'object') {
    return Object.keys(errors).filter(key => errors[key])
  }
  else {
    return [unref(errors)]
  }
}
