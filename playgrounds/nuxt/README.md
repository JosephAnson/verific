# Verific Nuxt playground

This app exercises the local core, Vue I18n adapter and Nuxt module with Zod and Valibot.

```bash
# From the repository root
pnpm dev:nuxt

# Type-check or build the playground
pnpm --dir playgrounds/nuxt exec nuxi typecheck
pnpm --dir playgrounds/nuxt build
```

The pages use the auto-imported `useValidation` composable, automatic request-local Vue I18n integration, descendant registration and a component-local Composer override.
