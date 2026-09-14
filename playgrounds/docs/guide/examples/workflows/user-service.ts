import type { User } from './user'

export async function registerUser(user: User): Promise<void> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  })

  if (!response.ok)
    throw new Error('Registration failed')
}
