# Voyant Theme SDK

Public, versioned contracts and Astro tooling for building Voyant storefront
themes. The SDK is deliberately theme-facing: themes render published context
objects and do not depend on Voyant Cloud services, databases, or internal APIs.

> `v1alpha1` is experimental. Field kinds and context shapes are the smallest
> useful developer loop, not an exhaustive block or commerce model.

## Try the example

```sh
pnpm install
pnpm --filter @voyant-travel/example-theme dev
```

The existing `@voyant-travel/cli` loads `@voyant-travel/theme/tooling` from a
theme project to implement `voyant theme check`, `build`, and `dev`. See
[the contract](docs/contract.md) and [tooling API](docs/tooling.md).

## Packages

- `@voyant-travel/theme`: contract schemas, `defineTheme`, fixtures, diagnostics,
  and programmatic tooling.
- `@voyant-travel/astro`: Astro integration and fixture context resolver.

The minimal example is intentionally a static fixture build. Its catch-all page
derives `getStaticPaths` from fixture contexts, producing deterministic home,
content, and not-found output. This is a local SDK proof, not a decision about
the later Workers-for-Platforms production runtime.

Licensed under Apache-2.0.
