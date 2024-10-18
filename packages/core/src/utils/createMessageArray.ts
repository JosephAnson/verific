import { type MaybeRef, unref } from 'vue'

export type Messages = string | Messages[] | Record<string, boolean> | false

export function createMessageArray(errors: MaybeRef<Messages>): string[] {
  const _errors = unref(errors)

  if (!_errors) {
    return []
  }
  else if (Array.isArray(_errors)) {
    return _errors.reduce<string[]>((acc, error) => {
      return acc.concat(createMessageArray(error))
    }, [])
  }
  else if (typeof _errors === 'object') {
    return Object.keys(_errors).filter(key => _errors[key])
  }
  else {
    return [_errors]
  }
}
