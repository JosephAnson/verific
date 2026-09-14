import { z } from 'zod'

export const userSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  displayName: z.string().trim().min(1, 'Enter a display name'),
})

export type UserInput = z.input<typeof userSchema>
export type User = z.output<typeof userSchema>
