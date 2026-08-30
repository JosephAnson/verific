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

The integrated check covers linting, strict package and playground type checks, coverage, package and playground builds, documentation, high-severity dependency advisories, registry signatures, and the packed Nuxt 3/4 request-local localisation matrix. Use `pnpm test:watch` while developing tests. Tests live alongside their package under `packages/*/tests`.

The targeted package, documentation and integration gates build their own prerequisites, so each can run from a clean checkout:

```bash
pnpm packages:compatibility
pnpm docs:check
pnpm test:integration
```

Dependency freshness is informational and does not affect `pnpm check` or publication. Run it separately when reviewing updates:

```bash
pnpm dependencies:outdated
```

## Code style

- Follow the existing TypeScript and Vue Composition API patterns.
- Run ESLint before opening a pull request.
- Keep public APIs small and document any behavioural change.
- Add tests for fixes and new behaviour.

## Documentation

The documentation site uses VitePress and lives in `playgrounds/docs`. Keep examples aligned with the compiling Vue and Nuxt playgrounds.

## Releasing

Verific releases as one workspace. For a future version that has not yet been staged, run `pnpm release` from the repository root; it is the sole versioning entry point. Follow its prompts to select the new version and create the resulting release commit and tag. Do not rerun it for a version already staged in every manifest. The root manifest and every public package manifest must always use the same version, and the corresponding Git tag must be `v${version}`. Do not version or tag an individual package separately.

Version `0.3.0` is staged but unreleased. The next release tag is `v0.3.0`; do not create a different version or tag for this staged release. Create and push `v0.3.0` only after all release code and publication-workflow changes are merged to `main`, the trusted-publishing, environment and ruleset configuration below is complete, and every required CI check passes on `main`. Until then, do not publish the packages or create a GitHub Release.

Configure trusted publishing for every public package:

- `@verific/core`
- `@verific/i18n`
- `@verific/i18next`
- `@verific/vue-i18n`
- `@verific/paraglide`
- `@verific/nuxt`

Each package must use these exact npm trusted publisher settings:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organisation or user | `JosephAnson` |
| Repository | `verific` |
| Workflow | `publish.yml` |
| Environment | `release` |
| Allowed action | `npm publish` |

The publish job authenticates to npm with GitHub Actions OIDC. Do not create or store a long-lived npm access token, including an `NPM_TOKEN` repository or environment secret.

Create a GitHub environment named `release`. Under **Deployment branches and tags**, choose **Selected branches and tags**, add a tag rule for `v*`, and add no branch rule. Configure required reviewers so a maintainer must approve each deployment.

Protect release tags with two repository tag rulesets targeting `v*`. In the first, enable **Restrict creations** and give the repository administrator role bypass permission so the owner, acting as release maintainer, can create matching tags. In the second, enable **Restrict updates** and **Restrict deletions** with no bypass actor. A release tag is immutable once publication starts: do not move or delete it. For this user-owned repository, emergency recovery requires an owner-controlled temporary change to the second ruleset. Treat it as a break-glass action: document and approve the reason before use, record the change and restoration for audit, and restore the ruleset immediately afterwards.

For each tagged release, the workflow must complete in this order:

1. Verify that the tag, workspace version and all package manifests agree, then run the release checks.
2. Publish all six packages to npm.
3. Create the GitHub Release only after every npm publication succeeds.

If a run fails after publishing only some packages, rerun the workflow for the same tag only when the failure is transient or external and the immutable release commit and package contents are already correct. Keep the existing version, commit and tag, and do not unpublish completed packages: already published package-version pairs are treated as complete, only missing packages are published, and the GitHub Release is created once all six packages are available on npm. If any package contents need to change, do not move or reuse the tag or try to replace a published package version. npm package versions are immutable, so make the corrections and create a new coordinated workspace version, release commit and matching tag.

GitHub Releases are the canonical public release history. Keep release notes there rather than in package-specific changelogs.

## Commits and pull requests

Use conventional commit messages with a concise subject. Pull requests should explain the problem, the chosen behaviour and how it was verified. Link a minimal reproduction when fixing a consumer-facing bug.

Do not include unrelated changes in the same pull request.
