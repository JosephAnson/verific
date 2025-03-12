import type { StandardSchemaV1 } from '@standard-schema/spec'

// Define common error codes that can be used across validation libraries
export enum ErrorCode {
  INVALID_TYPE = 'invalid_type',
  REQUIRED = 'required',
  TOO_SMALL = 'too_small',
  TOO_BIG = 'too_big',
  CUSTOM = 'custom',
  INVALID_STRING = 'invalid_string',
  INVALID_ENUM_VALUE = 'invalid_enum_value'
}

export type ErrorCodeUnion = keyof typeof ErrorCode

export function useError(
  errors: StandardSchemaV1.FailureResult | undefined, 
  code: ErrorCodeUnion | ErrorCodeUnion[]
): boolean {
  if (!errors || !errors.issues || errors.issues.length === 0) {
    return false
  }

  // Check if any error message contains the code string
  // This is a simple implementation that assumes error messages might contain the code
  if (Array.isArray(code)) {
    return errors.issues.some(issue => 
      code.some(c => issue.message.toLowerCase().includes(c.toLowerCase()))
    )
  } else {
    return errors.issues.some(issue => 
      issue.message.toLowerCase().includes(code.toLowerCase())
    )
  }
}
