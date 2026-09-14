import type { Contact } from './contact'

export async function saveContact(contact: Contact): Promise<void> {
  const response = await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(contact),
  })

  if (!response.ok)
    throw new Error('Could not save the contact')
}
