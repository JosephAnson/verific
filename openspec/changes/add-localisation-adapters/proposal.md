## Why

Verific already separates validation issues from display messages, but only Vue I18n has a first-party adapter. Applications using i18next or Paraglide must recreate key selection, interpolation, fallback and missing-key diagnostics at every integration point, which defeats the localisation seam and produces the verbose caller code this library is intended to remove.

## What Changes

- Add a shared `@verific/i18n` package that owns catalogue key generation, key ordering and missing-key diagnostics behind the existing core message-resolver interface.
- Refactor `@verific/vue-i18n` onto that shared implementation without changing its public factory.
- Add a tested `@verific/i18next` adapter for i18next and i18next-vue.
- Add a tested `@verific/paraglide` adapter for explicit maps of generated Paraglide message functions.
- Add a dedicated Localisation adapters documentation section covering Vue I18n, i18next, Paraglide and custom catalogue drivers.
- Remove the unused migration guide because no released consumer surface requires migration guidance.
- Provide development warnings and a `missing: 'throw'` test mode. Do not add an ESLint package: schema identifiers and model paths may be runtime-derived, so static analysis cannot prove catalogue completeness.

## Capabilities

### New Capabilities

- `localisation-adapters`: Shared catalogue behaviour, Vue I18n, i18next and Paraglide adapter contracts, diagnostics, reactivity and SSR isolation.
- `localisation-adapter-documentation`: Discoverable, copy-ready adapter guidance and compatibility information for each supported integration.

### Modified Capabilities

None.

## Impact

The change adds three publishable packages (`@verific/i18n`, `@verific/i18next`, `@verific/paraglide`), refactors `@verific/vue-i18n`, extends workspace dependency/build/test/packaging configuration, and reorganises the localisation documentation and navigation. Each leaf package peers only on the runtimes it imports: its locale library and, for the reactive i18next adapter, Vue. No optional locale dependency is added to core.
