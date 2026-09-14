import type { IssueNormaliser } from '@verific/core'
import { z } from 'zod'

// #region nested
const commonFields = {
  profile: z.object({
    displayName: z.string().min(1, 'Enter a display name'),
  }),
  contacts: z.array(z.object({
    email: z.email('Enter a valid contact email'),
  })).min(1, 'Keep at least one contact'),
  password: z.string().min(8, 'Use at least 8 characters'),
  confirmation: z.string(),
}
// #endregion nested

// #region discriminated
const accountSchema = z.discriminatedUnion('kind', [
  z.object({
    ...commonFields,
    kind: z.literal('person'),
    dateOfBirth: z.string().min(1, 'Enter a date of birth'),
  }),
  z.object({
    ...commonFields,
    kind: z.literal('company'),
    companyNumber: z.string().min(1, 'Enter a company number'),
  }),
])
// #endregion discriminated

// #region custom
export const advancedSchema = accountSchema.superRefine((value, context) => {
  if (value.password !== value.confirmation) {
    context.addIssue({
      code: 'custom',
      message: 'Passwords must match',
      params: { rule: 'passwordMismatch' },
      path: ['confirmation'],
    })
  }
})
// #endregion custom

export type AdvancedInput = z.input<typeof advancedSchema>

// #region describe-issue
export const describeAdvancedIssue: IssueNormaliser = ({ raw }) => {
  const issue = raw as z.ZodIssue & { params?: { rule?: string } }
  const identifier = issue.params?.rule
  return identifier ? { identifier, values: {} } : undefined
}
// #endregion describe-issue
