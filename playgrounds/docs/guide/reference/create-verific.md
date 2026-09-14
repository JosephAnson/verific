---
outline: deep
---

# `createVerific`

`createVerific` is an optional application plugin factory from `@verific/core`. Use it to supply application-wide [message resolvers](./messages#messageresolver) and [issue normalisers](./messages#issuenormaliser). `useValidation` also works without installing the plugin.

## Signature and types

Signature; `Verific`, `VerificOptions`, `MessageResolver` and `IssueNormaliser` are exported from `@verific/core`:

```ts
function createVerific(options?: VerificOptions): Verific

interface VerificOptions {
  readonly messages?: MessageResolver
  readonly describeIssue?: IssueNormaliser
}

interface Verific {
  readonly options: Readonly<VerificOptions>
  install: (app: App) => void
}
```

`App` is Vue's application type. `options` defaults to `{}`; both properties default to absent. Registration and root-scope policies take precedence over these application defaults. There is no application `messagePrefix` option: set that on [`useValidation`](./use-validation).

## Install

<<< ../examples/api/create-verific.ts

Call `installValidation(app)` before mounting. A resolver returns `undefined` to let resolution continue to the schema message. Use a [locale adapter](./locale-adapters) instead when the application already has a locale catalogue.

## Return value and ownership

The factory returns a non-reactive Vue plugin. It makes a shallow frozen copy of `options`; it does not freeze resolver objects or their caller-owned locale state. Installation provides the same instance through Vue injection and `app.config.globalProperties.$verific`.

Create the plugin once per application. It registers no validation schema, owns no model values and exposes no disposal method. Any adapter resource remains caller-owned: for example, call an [i18next adapter's `dispose()`](./locale-adapters#i18nextmessages) when its owner finishes.

For SSR, create the plugin and mutable locale state inside each application or request. The factory does not isolate a shared mutable resolver for you. In Nuxt, the module installs a default plugin; set `verific.global: false` before supplying your own [request-local plugin](../nuxt#request-local-vue-i18n).
