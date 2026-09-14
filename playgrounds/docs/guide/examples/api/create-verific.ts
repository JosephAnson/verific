import type { App } from 'vue'
import { createVerific } from '@verific/core'

export function installValidation(app: App) {
  const verific = createVerific({
    messages: ({ identifier }) => identifier === 'invalidEmail'
      ? 'Enter a valid email address'
      : undefined,
  })

  app.use(verific)
  return verific
}
