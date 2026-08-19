# Voyant Theme SDK

Public, versioned contracts and Astro tooling for building Themes for Voyant
Sites. Every Voyant Theme is an Astro project; it can use Astro integrations
such as React, Vue, or Solid while Astro remains the required framework. The
SDK is deliberately Theme-facing: Themes render published context objects and
do not depend on Voyant Cloud services, databases, or internal APIs.

`v1` is the stable public contract for tour, cruise, managed-shopping, Trip,
and Book-all themes. Published context objects remain forward compatible:
Voyant may add fields, but changing or removing a stable field requires a new
major contract version.

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
- `@voyant-travel/astro`: Astro/Cloudflare integration and context resolver.

The minimal example is one immutable Astro server release. In local development
its catch-all route renders fixtures. In Voyant, the same release reads the
current publication through a dispatcher-injected Cloudflare service binding.
Publishing content therefore changes publication data and edge pointers, not
theme source or the release artifact.

See [the runtime contract](docs/runtime.md) for the exact Cloudflare bindings,
request protocol, and deployment metadata.

Licensed under Apache-2.0.
