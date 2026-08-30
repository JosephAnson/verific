## Context

See `proposal.md` for motivation. The public Scope, Registration, Issue, Error, Message resolver and Locale adapter concepts are already established and must remain stable. The current implementation concentrates lifecycle and observation behaviour in `useValidation.ts`, while the documentation checker combines unrelated discovery and rendered-form auditing in one script. Locale adapters share a real behavioural seam but verify much of it independently.

The refactor must preserve difficult synchronous and asynchronous invariants: newest-run authority, atomic publication, two-phase reset, disposal, Issue identity, lazy Error resolution, accessor-safe capture and synchronous reads of current validation state.

## Goals / Non-Goals

**Goals:**

- Increase module depth, locality and leverage behind the existing public interface.
- Give Scope lifecycle, Registration observation and Issue-to-Error work one clear internal owner each.
- Keep rendered-validation traversal and form contracts behind one deep audit seam.
- Verify common Locale adapter behaviour once while keeping vendor-specific behaviour local.
- Prove that model and locale changes are visible to direct state and Error reads without `nextTick()`.

**Non-Goals:**

- Changing public exports, names, types or runtime semantics.
- Adding validation features, new schema-vendor behaviour or a new Locale adapter.
- Replacing lazy reads with queued watchers or caches.
- Introducing a sidecar declaration format for documentation-audit intent.
- Removing `nextTick()` from tests that explicitly wait for Vue mount, unmount or DOM rendering.

## Decisions

### 1. Establish a dependency-free path implementation

Create `packages/core/src/validation/paths.ts` for selector normalisation, Standard Schema path normalisation, equality/prefix checks and input resolution. Its input-resolution result is structural and does not import message types.

This gives Scope, Registration observation and the Issue pipeline one low-level dependency and prevents cyclic imports. Keeping path helpers in `useValidation.ts` would leave knowledge duplicated across the extracted modules.

### 2. Concentrate Issue-to-Error work in one pipeline

Create `packages/core/src/validation/issuePipeline.ts`. It owns normaliser identity de-duplication, built-in fallback ordering, Issue construction, Message resolver policy association and lazy Error resolution. The pipeline receives ordered generic policy inputs rather than Scope or Vue objects.

`messages.ts`, `issueNormalisers.ts` and all public message contracts remain unchanged. This preserves the existing Locale adapter seam and keeps semantic/vendor knowledge out of Scope lifecycle code.

### 3. Separate Registration observation from Scope scheduling

Create `packages/core/src/validation/registrationObservation.ts` for baselines, touched paths, snapshots, structural comparison, full/exact stamps, retained state objects and reactive observation. It exposes domain operations for registration activation/removal, validation capture/stamping, state reads, touch and reset observation; it does not expose its maps or helper algorithms.

The implementation retains a lazy synchronous `customRef` getter. Direct `state.value` and `stateFor(path)` reads snapshot the current model on the same stack. Watchers, post-flush work and computed-only caches are rejected because they would make consumers wait for Vue scheduling or miss plain-model changes.

Scope supplies a read-only activity view so observation can derive validating state without importing scheduler details. Scope retains reset orchestration and installs its reset guard before observation captures baselines, preserving re-entrant behaviour.

### 4. Make `useValidation` a thin Vue adapter over a deep Scope module

Create `packages/core/src/validation/scope.ts` for Registration lifecycle, validation scheduling, authority adoption/supersession, cancellation, atomic publication, reset and committed result ownership. Its internal interface exposes aggregate Issue, Error, activity and state reads plus Registration handles; callers do not learn committed map structure or root policy storage.

Keep Vue injection/provision, instance-local Scope lookup, public overloads, generic controller types and prefix adaptation in `useValidation.ts`. This preserves the public interface while concentrating the lifecycle implementation. A single core writer performs decisions 1–4 sequentially because splitting overlapping edits would reduce locality and increase integration risk.

### 5. Extract one rendered-validation audit seam

Create `playgrounds/docs/scripts/rendered-validation-audit.mjs` with one high-level audit operation. It hides Vue parsing, imported-SFC and slot expansion, mount context, ID indexing, accessibility rules, form contracts, parsed-unit caching and reached-unit tracking.

Keep Markdown/file discovery, navigation and source-disclosure checks, adapter compatibility, reporting and the 153-case fixture harness in `check-docs.mjs`. Each Markdown snippet and rendered page remains a separate audit root, while parsed units and reached imports remain shared across roots. This avoids false duplicate-ID collisions and prevents imported fields being audited without their parent form.

Optional, skip and required-group declarations stay in rendered documentation only where their intent cannot be inferred safely from the expanded Vue AST or native HTML semantics. Fixture declarations continue to exercise each contract. No redundant checker-only declaration belongs in rendered documentation.

### 6. Share observable Locale adapter conformance tests

Create `tests/support/localeAdapterConformance.ts` and one small fixture suite in each locale package. The harness verifies key-first ordering, exact selected-locale lookup, immediate reactive Error re-resolution and missing diagnostics through `useValidation`.

The driver declares whether it supports a locale chain or one explicit locale. Paraglide verifies key ordering within its request-owned locale; the catalogue, i18next and Vue I18n adapters also verify cross-locale ordering. Vendor calls, listener disposal, generated-function typing and SSR isolation remain in local suites.

The shared tests are test-only and are never exported by a package. Locale package TypeScript roots may widen to the repository root for no-emit checking; package builds must still prove unchanged declaration output.

### 7. Treat synchronous reads as an interface invariant

Core tests mutate model and schema references, then read aggregate and exact state immediately. Locale conformance tests establish an Error dependency, mutate locale and read the Error immediately; only i18next's asynchronous `changeLanguage()` is awaited. `nextTick()` remains only where the test is about Vue lifecycle or rendered DOM updates.

This records the intended interface directly and prevents future observation refactors from introducing scheduling requirements.

## Risks / Trade-offs

- **[Risk] Mechanical extraction changes subtle closure ordering or identity.** → Move behaviour in dependency order, preserve function bodies initially and run focused scheduler/reset tests after each core step.
- **[Risk] Observation becomes cached or post-flush.** → Retain lazy synchronous reads and add same-stack dirty, clean, stale, schema-change and exact-path regressions.
- **[Risk] Issue policy is lost when targeted results replace ledger entries.** → Associate policy by Issue identity in the pipeline and retain identity through all replacement paths.
- **[Risk] Documentation roots are flattened during extraction.** → Keep per-root rendered state and the complete mutation self-test unchanged.
- **[Risk] A lowest-common-denominator adapter harness hides real differences.** → Model locale topology explicitly and retain vendor-specific suites beside conformance.
- **[Risk] Wider test roots affect declaration output.** → Build and inspect every package after type-checking; the harness remains outside runtime entries.
- **[Trade-off] Core extraction is one large task.** → A single writer owns overlapping files, with sequential internal checkpoints and two independent reviewers before acceptance.

## Migration Plan

1. Extract shared paths and the Issue pipeline with focused core tests.
2. Extract Registration observation, then Scope lifecycle, and thin the Vue adapter.
3. In parallel, extract the rendered-validation audit and add Locale adapter conformance fixtures.
4. Integrate accepted revisions, run package and repository gates, inspect declarations and retain `nextTick()` only for genuine lifecycle/DOM waits.
5. Roll back by reverting the change commits; no persisted data, package configuration or public migration is involved.
