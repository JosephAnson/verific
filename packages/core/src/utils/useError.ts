import type { z } from 'zod'
import { ZodIssueCode } from 'zod'

type ZodIssueCodeUnion = keyof typeof ZodIssueCode

export { ZodIssueCode, ZodIssueCodeUnion }

export function useError(errors: z.ZodFormattedError<any> | undefined, code: ZodIssueCodeUnion | ZodIssueCodeUnion[]) {
  if (!errors) {
    return false
  }

  if (Array.isArray(code)) {
    return errors._errors.some(error => code.includes(error as ZodIssueCodeUnion))
  }
  else {
    return errors._errors.includes(code)
  }
}
