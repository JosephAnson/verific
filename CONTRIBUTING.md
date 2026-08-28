# Contributing to Verific

## Set up the repository

Verific uses pnpm workspaces.

```bash
git clone https://github.com/josephanson/verific.git
cd verific
corepack enable
pnpm install --frozen-lockfile
pnpm run setup
```

## Development commands

```bash
# Run the Nuxt playground
pnpm dev

# Run a specific playground
pnpm dev:nuxt
pnpm dev:vue

# Run the VitePress documentation site
pnpm dev:docs
```

## Quality checks

Run the same checks expected in continuous integration:

```bash
pnpm check
```

The integrated check covers linting, strict package and playground type checks, coverage, package and playground builds, documentation, dependency freshness and audit checks, and the packed Nuxt 3/4 localisation matrix. Use `pnpm test:watch` while developing tests. Tests live alongside their package under `packages/*/tests`.

## Code style

- Follow the existing TypeScript and Vue Composition API patterns.
- Run ESLint before opening a pull request.
- Keep public APIs small and document any behavioural change.
- Add tests for fixes and new behaviour.

## Documentation

The documentation site uses VitePress and lives in `playgrounds/docs`. Keep examples aligned with the compiling Vue and Nuxt playgrounds.

## Commits and pull requests

Use conventional commit messages with a concise subject. Pull requests should explain the problem, the chosen behaviour and how it was verified. Link a minimal reproduction when fixing a consumer-facing bug.

Do not include unrelated changes in the same pull request.
