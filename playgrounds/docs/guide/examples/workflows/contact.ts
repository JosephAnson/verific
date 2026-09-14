import { z } from 'zod'

export const contactDetailsSchema = z.object({
  email: z.email('Enter a valid email address'),
})

export const postalAddressSchema = z.object({
  postcode: z.string().min(1, 'Enter a postcode'),
})

export interface Contact {
  details: z.input<typeof contactDetailsSchema>
  address: z.input<typeof postalAddressSchema>
}
