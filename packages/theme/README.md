# `@voyant-travel/theme`

The stable public theme contract for Voyant. Define a theme with
`defineTheme`, validate objects with `checkThemeDefinition`, or load and operate
on a project through `@voyant-travel/theme/tooling`.

Connected local development uses the separately versioned, host-neutral
`ThemeDevelopmentRuntimeDescriptor`. Platform session creation and credentials
remain proprietary and are supplied by the Voyant CLI through a runtime
Adapter; the public descriptor contains identifiers and endpoints, never
capability secrets. Its editor base URL is non-secret; the proprietary CLI
exchanges any one-time handoff code separately. Omitting a runtime preserves
fixture-backed development.

The `v1` contract stabilizes the v1alpha5 tour, cruise, ship, sailing,
managed-shopping, opaque Trip, and Book-all surfaces with recursively
commercial- and privacy-safe publication projections. See
[the contract guide](../../docs/contract.md#cruises).

Stable authoring fields and context discriminants will not be removed or change
meaning within v1. Additive context fields do not require a new contract
version: published contexts parse permissively and keep unknown properties, so
a deployed theme survives them.

`themeContextResponseSchema` validates the versioned publication-reader
envelope used by server-rendered themes. `@voyant-travel/astro` owns the
Cloudflare transport; the core contract remains independent of Voyant storage.

Tour themes can validate deterministic live-selling stories with
`tourSellingFixtureMatrixSchema` and serve them locally with
`createTourFixtureAdapter`. The reference matrix is
[`fixtures/tour-selling.json`](../../fixtures/tour-selling.json); it stays
outside immutable page fixtures so commercial state never becomes published
content.

`bookingSessionActionRequestSchema` types and validates the closed
`booking.session.v1` PATCH lifecycle union. It requires the theme-visible
session `revision` and an `idempotencyKey` for update, quote, hold, commit,
abandon, and renew actions while rejecting runtime aliases and provider paths.

`shoppingRequestedScopeSchema` validates the only managed-shopping preferences
a browser may choose: `marketId`, `locale`, and uppercase `currency`. Shopping
capability routes remain same-origin and provider-neutral; customer ownership,
booking-engine choice, payments, and FX stay server-owned.
`shoppingTripBookingRequestSchema` closes the separate itinerary-booking input
to an opaque selection reference, its expected revision, and an idempotency
key; its managed Booking Session continues through `booking.session.v1`.

`createSitemap` builds the `/sitemap.xml` handler a theme mounts once it owns
its own URL inventory. It groups entries by a stable `id` across locales — not
by path, since the paths are what differ — and emits reciprocal `xhtml:link`
alternates plus `x-default`, absolutized against the origin the request arrived
on. See [the runtime contract](../../docs/runtime.md#sitemap).

Themes declare alternate context-compatible renderers in `manifest.templates`.
The platform validates and resolves its vertical, resource-type, taxonomy, and
individual-resource assignments with `checkThemeTemplateAssignments` and
`resolveThemeTemplate`; published contexts carry only the resolved
`templateId`.
