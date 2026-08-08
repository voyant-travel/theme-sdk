# `@voyant-travel/theme`

The experimental public theme contract for Voyant. Define a theme with
`defineTheme`, validate objects with `checkThemeDefinition`, or load and operate
on a project through `@voyant-travel/theme/tooling`.

The `v1alpha4` contract adds canonical tour index/detail contexts and a strict,
secret-free declaration vocabulary for live catalog and booking capabilities.
See [the contract guide](../../docs/contract.md#tours-and-live-capabilities).

The `v1alpha4` field vocabulary is intentionally minimal and will evolve before
v1. Themes should switch explicitly when a later contract version is introduced.
Additive context fields do not need one: published contexts parse permissively
and keep unknown properties, so a deployed theme survives them.

`themeContextResponseSchema` validates the versioned publication-reader
envelope used by server-rendered themes. `@voyant-travel/astro` owns the
Cloudflare transport; the core contract remains independent of Voyant storage.
