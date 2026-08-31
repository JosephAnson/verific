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

Verific releases as one workspace. The root manifest and all six public package manifests must always use the same stable version, with one matching `v${version}` tag. Never version or tag a package independently.

For a future version that has not been staged, run `pnpm release` from the repository root. This is the sole versioning entry point. It updates all seven manifests without running lifecycle scripts, committing, tagging or pushing; review the resulting diff, commit it, push `main`, and wait for required CI to pass before creating the tag. Do not rerun the command for a version already staged in every manifest.

Before creating any release tag, protect `main` from deletion and force pushes, and protect `v*` tags from updates and deletions while allowing only the release maintainer to create them. Stop if those rules are absent. A break-glass ruleset change must be documented, approved and restored immediately; it must never be used to replace an npm release.

Version `0.3.0` is staged but unreleased, so do not run `pnpm release` for it. Once these release changes are on green current `main`, prepare the immutable tag manually:

```bash
git switch main
git pull --ff-only
git tag -a v0.3.0 -m "v0.3.0"
git push origin v0.3.0
```

Pushing the tag does not publish packages or create a GitHub Release. Authenticate in the local terminal and invoke the sole npm-writing entry point yourself:

```bash
npm login
npm whoami
pnpm release:publish
```

For an initial publication, `release:publish` fails before publication unless all manifests agree, every package targets the public npm registry, the working tree is clean, `origin` is the canonical Verific repository, current `main` matches both fetched and live remote `main`, and local and remote `v0.3.0` tags point to that commit. It checks npm for an existing partial release, verifies the npm account, runs the complete `pnpm check` gate, repeats the Git identity check, packs these exact packages once into a temporary directory, publishes their tarballs with pnpm's `main` branch safeguard enabled, and confirms every exact package version and SHA-512 integrity on npm:

- `@verific/core`
- `@verific/i18n`
- `@verific/i18next`
- `@verific/vue-i18n`
- `@verific/paraglide`
- `@verific/nuxt`

The local path deliberately does not request npm provenance: npm only generates provenance for supported cloud CI publishers. Let npm prompt interactively for any web authentication or one-time password; never put credentials or OTP values in a script, command history or committed `.npmrc`. The repository workflows require no npm credential. Remove any obsolete `NPM_TOKEN` repository secret or npm trusted-publisher entry after confirming it is not used elsewhere.

If publication stops after only some packages succeed, fix only a transient authentication, network or registry problem and rerun `pnpm release:publish` from the same clean commit and immutable tag. The command confirms that at least one exact package version already exists before enabling retry mode. If `main` has advanced, fetch current refs and use a detached checkout of the immutable tag:

```bash
git fetch origin main --tags
git switch --detach v0.3.0
pnpm release:publish
git switch main
```

Retry mode requires the tagged commit to remain in current canonical `origin/main` history. Its stronger custom clean-tree, canonical-origin, ancestry and local/remote-tag checks replace pnpm's tip-of-branch check so an older immutable tag can finish. Before any further write, the command repacks all six packages and requires every existing npm tarball to have the same SHA-512 integrity; it then publishes only missing tarballs and verifies all six. An integrity mismatch means the partial release did not come from these guarded contents: stop and use a new coordinated version. Do not unpublish, replace, move, delete or reuse that release identity.

Only after `release:publish` succeeds, create the public release manually:

```bash
gh release create v0.3.0 \
  --generate-notes \
  --verify-tag \
  --repo JosephAnson/verific
```

If this command fails, retry it without republishing. GitHub Releases are the canonical public release history.

### Publishing Docker images

Docker image publication is a separate maintainer action. Pushes to `main`, tags and successful CI runs do not publish images, and Docker publication does not gate npm publication or GitHub Release creation.

Before dispatching, authenticate `gh` as a maintainer, confirm the selected `main` commit has a successful push-triggered `CI` run, and configure these repository Actions secrets:

- `DOCKERHUB_DEPLOY_USERNAME_V2`: the Docker Hub account that owns the `verific` repository.
- `DOCKERHUB_DEPLOY_TOKEN_V2`: a Docker Hub access token authorised to push to that repository.

Start the dedicated workflow explicitly from `main`:

```bash
gh workflow run deploy.yml --ref main
```

Find the new manual run and watch it to completion:

```bash
gh run list --workflow deploy.yml --event workflow_dispatch --branch main --limit 5
gh run watch <run-id> --exit-status
```

The workflow fails before Docker login unless the exact selected commit has a successful push-triggered `CI` run. It publishes the immutable commit-SHA tag and promotes that digest to `latest` only while the same SHA remains the live `main` tip.

## Commits and pull requests

Use conventional commit messages with a concise subject. Pull requests should explain the problem, the chosen behaviour and how it was verified. Link a minimal reproduction when fixing a consumer-facing bug.

Do not include unrelated changes in the same pull request.
