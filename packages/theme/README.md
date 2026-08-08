# `@voyant-travel/theme`

The experimental public theme contract for Voyant. Define a theme with
`defineTheme`, validate objects with `checkThemeDefinition`, or load and operate
on a project through `@voyant-travel/theme/tooling`.

The `v1alpha5` contract retains the v1alpha4 tour surface and adds canonical
cruise, ship, and sailing contexts with recursively commercial- and
privacy-safe publication projections. See
[the contract guide](../../docs/contract.md#cruises).

The `v1alpha5` field vocabulary is intentionally minimal and will evolve before
v1. Themes should switch explicitly when a later contract version is introduced.
Additive context fields do not need one: published contexts parse permissively
and keep unknown properties, so a deployed theme survives them.

`themeContextResponseSchema` validates the versioned publication-reader
envelope used by server-rendered themes. `@voyant-travel/astro` owns the
Cloudflare transport; the core contract remains independent of Voyant storage.

Tour themes can validate deterministic live-selling stories with
`tourSellingFixtureMatrixSchema` and serve them locally with
`createTourFixtureAdapter`. The reference matrix is
[`fixtures/tour-selling.json`](../../fixtures/tour-selling.json); it stays
outside immutable page fixtures so commercial state never becomes published
content.

Themes declare alternate context-compatible renderers in `manifest.templates`.
The platform validates and resolves its vertical, resource-type, taxonomy, and
individual-resource assignments with `checkThemeTemplateAssignments` and
`resolveThemeTemplate`; published contexts carry only the resolved
`templateId`.
