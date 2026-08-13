# @voyant-travel/theme

## 1.2.0

### Minor Changes

- dfd20dc: Represent product categories, and publish the locale alternates a theme needs
  for `hreflang`.

  Operators sell in families — pilgrimages, city breaks, packages — and those
  families are usually the addresses customers already know. A theme had no way
  to render one: the only catalog pages were `tourIndex` at `/tours` and
  `tourDetail` at `/tours/[slug]`. `categoryDetail` is a new context carrying one
  category and the products filed under it, and unlike `tourIndex` its path is
  the operator's own translated slug rather than a fixed one.

  Contexts now carry `alternates`, this page's address in every locale that
  publishes it. A theme cannot derive these: slugs are localized, so the same
  category is `/pelerinaje` in one locale and `/en/pilgrimages` in another and
  the two share no path component.

  Route validation now flags genuine ambiguity rather than any overlap. A literal
  segment beats a parameter and a parameter beats a rest, which is how Astro
  already resolves the file tree a theme builds, so `/[category]` and a root
  catch-all can finally sit beside `/tours`. Patterns of the same shape, such as
  `/tours/[id]` against `/tours/[slug]`, are still rejected.

  Content routes no longer have to contain a parameter, so a static top-level
  page like `/despre-noi` can be declared. Voyant already published content at
  any path; only the theme could not address it.

## 1.1.0

### Minor Changes

- 5051b0f: Give every published record a lead image under one name.

  Only `catalogProduct`, `cruise` and `cruiseShip` declared a `coverMedia`.
  Everything else a theme puts on a page had an ambiguous `media[]` or nothing at
  all, so a sailing detail page had no hero, cabin and port grids had to guess at
  `media[0]`, and a destination or category grid could not be built from the
  catalog at all.

  `coverMedia` is now declared on `cruiseSailing` (with `media[]`),
  `cruiseCabinCategory`, `cruisePort`, `cruiseItinerary.days[]`,
  `catalogProductDestination`, `catalogProductCategory` and
  `catalogProductItinerary.days[]`, and every declaration is
  `.nullable().optional()` so one null check reads them all — `cruise.coverMedia`
  and `cruiseShip.coverMedia` previously accepted `undefined` but not `null`.

  Tour itinerary days keep `thumbnailUrl`, now deprecated in favor of
  `coverMedia`: a bare URL carries no dimensions and no alt text, so a theme can
  neither size the image nor describe it.

  All fields are additive and optional. Existing publications and themes parse
  unchanged.

## 1.0.0

### Major Changes

- 6061535: Declare the stable `v1` theme contract after the tour, cruise, template,
  managed-shopping, opaque Trip, and Book-all conformance gates passed across two
  substantially different first-party themes. The stable wire shape is identical
  to `v1alpha5`; readers retain backwards compatibility with all v1 alpha
  publication envelopes.

### Minor Changes

- 919506b: Carry a theme's content bindings through the build metadata.

  `manifest.contentBindings` was validated and then went nowhere: the build
  artifact metadata is assembled field by field and never included it, so the
  platform stored `null` for every release and its check that an operator's
  mapping satisfies the theme ran against an empty declaration. A theme could
  declare a required slot and publishing a site that never mapped it succeeded.

  The key sits between `settings` and `outputDirectory`. That position is part of
  what the digest commits to — it is taken over `JSON.stringify` of the metadata
  — and the platform rebuilds the object in the same order to verify it. Moving
  it would fail verification with identical content.

  Requires a platform that already accepts the key, which shipped first for
  exactly that reason.

- 6946d44: Carry the settings a theme declares into its build metadata.

  `manifest.settings` was validated and then went nowhere: the build metadata
  recorded routes but not settings, so a host had no way to learn which controls a
  theme wanted rendered. A theme could declare a setting, read it from
  `context.settings`, and no operator could ever supply a value for it.

  The field is now part of `voyant.theme.build.v2`, in declaration order rather
  than sorted by id — a theme orders its settings the way it wants them presented,
  and sorting would scatter a deliberate grouping. Themes that declare none get an
  empty list.

  This changes the artifact digest for any theme with declared settings, which is
  expected: the metadata genuinely describes more than it did.

- ad99b9e: Add the v1alpha5 provider-neutral cruise publication contract, canonical cruise
  resource routes, live cruise capabilities, fixtures, and recursive rejection of
  commercial, privacy, provider, source, and provenance data.
- 19c1c13: Add the collection context kinds, at contract version v1alpha3.

  `collectionIndex` and `collectionEntry` carry the content types an operator
  defines for themselves: a listing page and one page per entry. Entry values are
  keyed by the field ids the operator declared, so a theme reads the keys it knows
  and ignores the rest, exactly as it does with settings.

  This needs a new contract version rather than riding on v1alpha2. Unknown
  context FIELDS are already tolerated, but a `kind` is not a field: the page
  context is a union discriminated on it, so a kind a release has never heard of
  fails the whole response instead of being ignored. v1alpha2 stays readable, so a
  theme on this release still renders publications made for the previous one.

  `entry.path` is absent for a type with no pages of its own. Themes must check it
  before linking rather than assuming it is there.

- 0be949b: Publish the operator's collection field definitions with a collection context.

  An entry's `values` is a record, so it carries neither the operator's wording
  for a field nor the order they arranged the fields in. A theme given only the
  record has to invent both, and an operator who labels a field "Written by" and
  puts it second sees "Author" first with no way to say otherwise.

  `collection.fields` now carries `{ id, label, type }` in declaration order.
  `type` is included so a theme can pick a presentation from what the field is
  rather than guessing from the shape of one value, which misreads a blank field
  and a reference whose target has no translation in this locale.

  Additive and optional: context objects are open, so a theme built before this
  ignores it, and a theme built after it falls back to the keys of `values` while
  a publication materialized before it is still live. No contract version change.

- 4a6df7a: Add a `color` setting type.

  A theme wanting an operator-chosen colour had to declare it as `text`, which
  gets a plain input: the operator types a hex code and finds out whether it was
  valid by looking at the published site. Declaring `color` lets a host render a
  swatch picker instead.

  The optional `default` is constrained to `#rgb` or `#rrggbb` rather than any CSS
  colour. Named colours and `oklch()` would each need a host to parse them before
  it could render a picker, and a theme that wants that expressiveness can declare
  a `select` over its own palette.

- 1684138: Let a theme declare the collection shape it needs, and read it back by slot.

  A shared theme cannot know what an operator called their fields. One site's
  guides carry `abstract`, another's carry `intro`, and a theme reading either id
  directly works on exactly one site.

  `manifest.contentBindings` inverts that. The theme declares the slots it
  renders — `summary`, `hero`, `author` — with a type and an optional `required`
  flag, and the operator maps their own fields onto them once at installation.
  Published entries then carry `entry.binding`, the operator's values projected
  onto those slots, so the theme reads `entry.binding.summary` and never learns
  the field id behind it. `values` stays present for a theme rendering its own
  collections rather than a bound one.

  Additive and optional: `contentBindings` defaults to empty and `binding` is
  absent on an unbound collection, so nothing changes for a theme that declares
  none. No contract version change.

- a91b2bb: Introduce the experimental v1alpha1 theme contract, project tooling, fixture router, and Astro integration.
- 2f33b1c: Add the strict provider-neutral `booking.session.v1` action request union for
  update, quote, hold, commit, abandon, and renew, including revision and
  idempotency semantics, action-specific fields, JSON Schema, fixtures, and docs.
- 795a7ab: Add typed alternate template declarations and deterministic platform-owned
  assignment validation and resolution across vertical, resource type, taxonomy,
  and individual-resource scopes. Build metadata v3 carries the declarations,
  while page contexts expose only the resolved template id.
- b2b4ec5: Add the provider-neutral `shopping.search.v1` and
  `shopping.trip-selections.v1` capability vocabulary, exact live method
  allowlists, strict browser-requested market scope validation, JSON Schemas,
  canonical metadata coverage, tests, and same-origin route documentation.

  Add the distinct `shopping.trip-booking.v1` capability and strict opaque Trip
  booking request/managed Booking Session response contract.

- f8cc458: Make published page contexts forward compatible and raise the contract to `v1alpha2`.

  Every context schema was a strict object, so any field Voyant added to a
  published context was rejected wholesale by already-deployed themes and the page
  failed with `THEME_CONTEXT_RESPONSE_INVALID`. Additive platform changes were
  therefore breaking changes that required an SDK release and a rebuild of every
  theme.

  Context objects now parse permissively and preserve unknown properties, while
  the response envelope stays strict because it carries the version negotiation
  itself, and the theme-authored manifest stays strict because there an unknown
  key is a typo. Known fields keep their constraints.

  The reader also accepts more than one envelope version. A publication and a
  theme release are separately versioned artifacts, so a theme now declares
  `CONTRACT_VERSION` when it asks and accepts any of `READABLE_CONTRACT_VERSIONS`
  when it reads, upgrading an older envelope through
  `upgradeThemeContextResponse`. Without that, a release and a publication would
  have to move in the same instant and the storefront would fail in between.

  Contexts also carry the fields the platform already authored or needs:
  `seo` (`title`, `description?`, `noIndex`), optional `openGraph`, named and
  optionally nested `menus`, and optional `codeInjection` of raw operator markup
  placed verbatim. That markup is not sanitized and cannot be: executing it is
  the entire point of the field, since it carries the analytics, consent and
  verification tags an operator needs. It is constrained instead — bounded in
  size and rejected if it contains control characters — and confined to the
  operator's own document.

- 4c71b14: Add the v1alpha4 tour index/detail context contract, immutable public catalog
  product projection, canonical route validation, and secret-free live capability
  declarations.
- 7683165: Add strict, provider-neutral tour selling fixture schemas and a deterministic
  adapter covering page, offer, availability, booking, checkout, payment,
  network, and malformed-response states without embedding live commerce data in
  immutable page contexts.
- 773ddfa: Declare visual-editor sections, blocks, presets and controls in theme build
  metadata, and add draft-only stega provenance helpers plus the origin-pinned
  Astro editor bridge.

### Patch Changes

- 0618c04: Run the project-installed Astro CLI directly so theme builds and development do not require a globally available package manager binary.
- 4ac8356: Add the immutable Astro/Cloudflare server runtime seam for fixture-backed local development and scoped Voyant publication contexts.
- d4878a3: Order build metadata paths by code unit instead of locale collation.

  `collectBuildFiles` sorted with `localeCompare`, which reorders punctuation and
  varies with the host locale, so `client/_headers` was emitted before
  `client/.assetsignore` even though `.` (U+002E) precedes `_` (U+005F). Build
  metadata is provenance for a reproducible build and is verified downstream with
  a plain relational comparison, so an unsorted manifest is rejected and the same
  output directory could serialize differently on two machines.

## 0.1.0-alpha.16

### Minor Changes

- b2b4ec5: Add the provider-neutral `shopping.search.v1` and
  `shopping.trip-selections.v1` capability vocabulary, exact live method
  allowlists, strict browser-requested market scope validation, JSON Schemas,
  canonical metadata coverage, tests, and same-origin route documentation.

  Add the distinct `shopping.trip-booking.v1` capability and strict opaque Trip
  booking request/managed Booking Session response contract.

## 0.1.0-alpha.15

### Minor Changes

- ad99b9e: Add the v1alpha5 provider-neutral cruise publication contract, canonical cruise
  resource routes, live cruise capabilities, fixtures, and recursive rejection of
  commercial, privacy, provider, source, and provenance data.
- 2f33b1c: Add the strict provider-neutral `booking.session.v1` action request union for
  update, quote, hold, commit, abandon, and renew, including revision and
  idempotency semantics, action-specific fields, JSON Schema, fixtures, and docs.
- 795a7ab: Add typed alternate template declarations and deterministic platform-owned
  assignment validation and resolution across vertical, resource type, taxonomy,
  and individual-resource scopes. Build metadata v3 carries the declarations,
  while page contexts expose only the resolved template id.

## 0.1.0-alpha.14

### Minor Changes

- 4c71b14: Add the v1alpha4 tour index/detail context contract, immutable public catalog
  product projection, canonical route validation, and secret-free live capability
  declarations.
- 7683165: Add strict, provider-neutral tour selling fixture schemas and a deterministic
  adapter covering page, offer, availability, booking, checkout, payment,
  network, and malformed-response states without embedding live commerce data in
  immutable page contexts.

## 0.1.0-alpha.13

### Minor Changes

- 773ddfa: Declare visual-editor sections, blocks, presets and controls in theme build
  metadata, and add draft-only stega provenance helpers plus the origin-pinned
  Astro editor bridge.

## 0.1.0-alpha.12

### Minor Changes

- 919506b: Carry a theme's content bindings through the build metadata.

  `manifest.contentBindings` was validated and then went nowhere: the build
  artifact metadata is assembled field by field and never included it, so the
  platform stored `null` for every release and its check that an operator's
  mapping satisfies the theme ran against an empty declaration. A theme could
  declare a required slot and publishing a site that never mapped it succeeded.

  The key sits between `settings` and `outputDirectory`. That position is part of
  what the digest commits to — it is taken over `JSON.stringify` of the metadata
  — and the platform rebuilds the object in the same order to verify it. Moving
  it would fail verification with identical content.

  Requires a platform that already accepts the key, which shipped first for
  exactly that reason.

## 0.1.0-alpha.11

### Minor Changes

- 1684138: Let a theme declare the collection shape it needs, and read it back by slot.

  A shared theme cannot know what an operator called their fields. One site's
  guides carry `abstract`, another's carry `intro`, and a theme reading either id
  directly works on exactly one site.

  `manifest.contentBindings` inverts that. The theme declares the slots it
  renders — `summary`, `hero`, `author` — with a type and an optional `required`
  flag, and the operator maps their own fields onto them once at installation.
  Published entries then carry `entry.binding`, the operator's values projected
  onto those slots, so the theme reads `entry.binding.summary` and never learns
  the field id behind it. `values` stays present for a theme rendering its own
  collections rather than a bound one.

  Additive and optional: `contentBindings` defaults to empty and `binding` is
  absent on an unbound collection, so nothing changes for a theme that declares
  none. No contract version change.

## 0.1.0-alpha.10

### Minor Changes

- 0be949b: Publish the operator's collection field definitions with a collection context.

  An entry's `values` is a record, so it carries neither the operator's wording
  for a field nor the order they arranged the fields in. A theme given only the
  record has to invent both, and an operator who labels a field "Written by" and
  puts it second sees "Author" first with no way to say otherwise.

  `collection.fields` now carries `{ id, label, type }` in declaration order.
  `type` is included so a theme can pick a presentation from what the field is
  rather than guessing from the shape of one value, which misreads a blank field
  and a reference whose target has no translation in this locale.

  Additive and optional: context objects are open, so a theme built before this
  ignores it, and a theme built after it falls back to the keys of `values` while
  a publication materialized before it is still live. No contract version change.

## 0.1.0-alpha.9

### Minor Changes

- 19c1c13: Add the collection context kinds, at contract version v1alpha3.

  `collectionIndex` and `collectionEntry` carry the content types an operator
  defines for themselves: a listing page and one page per entry. Entry values are
  keyed by the field ids the operator declared, so a theme reads the keys it knows
  and ignores the rest, exactly as it does with settings.

  This needs a new contract version rather than riding on v1alpha2. Unknown
  context FIELDS are already tolerated, but a `kind` is not a field: the page
  context is a union discriminated on it, so a kind a release has never heard of
  fails the whole response instead of being ignored. v1alpha2 stays readable, so a
  theme on this release still renders publications made for the previous one.

  `entry.path` is absent for a type with no pages of its own. Themes must check it
  before linking rather than assuming it is there.

## 0.1.0-alpha.8

### Minor Changes

- 4a6df7a: Add a `color` setting type.

  A theme wanting an operator-chosen colour had to declare it as `text`, which
  gets a plain input: the operator types a hex code and finds out whether it was
  valid by looking at the published site. Declaring `color` lets a host render a
  swatch picker instead.

  The optional `default` is constrained to `#rgb` or `#rrggbb` rather than any CSS
  colour. Named colours and `oklch()` would each need a host to parse them before
  it could render a picker, and a theme that wants that expressiveness can declare
  a `select` over its own palette.

## 0.1.0-alpha.7

### Minor Changes

- 6946d44: Carry the settings a theme declares into its build metadata.

  `manifest.settings` was validated and then went nowhere: the build metadata
  recorded routes but not settings, so a host had no way to learn which controls a
  theme wanted rendered. A theme could declare a setting, read it from
  `context.settings`, and no operator could ever supply a value for it.

  The field is now part of `voyant.theme.build.v2`, in declaration order rather
  than sorted by id — a theme orders its settings the way it wants them presented,
  and sorting would scatter a deliberate grouping. Themes that declare none get an
  empty list.

  This changes the artifact digest for any theme with declared settings, which is
  expected: the metadata genuinely describes more than it did.

## 0.1.0-alpha.4

### Minor Changes

- f8cc458: Make published page contexts forward compatible and raise the contract to `v1alpha2`.

  Every context schema was a strict object, so any field Voyant added to a
  published context was rejected wholesale by already-deployed themes and the page
  failed with `THEME_CONTEXT_RESPONSE_INVALID`. Additive platform changes were
  therefore breaking changes that required an SDK release and a rebuild of every
  theme.

  Context objects now parse permissively and preserve unknown properties, while
  the response envelope stays strict because it carries the version negotiation
  itself, and the theme-authored manifest stays strict because there an unknown
  key is a typo. Known fields keep their constraints.

  The reader also accepts more than one envelope version. A publication and a
  theme release are separately versioned artifacts, so a theme now declares
  `CONTRACT_VERSION` when it asks and accepts any of `READABLE_CONTRACT_VERSIONS`
  when it reads, upgrading an older envelope through
  `upgradeThemeContextResponse`. Without that, a release and a publication would
  have to move in the same instant and the storefront would fail in between.

  Contexts also carry the fields the platform already authored or needs:
  `seo` (`title`, `description?`, `noIndex`), optional `openGraph`, named and
  optionally nested `menus`, and optional `codeInjection` of raw operator markup
  that Voyant sanitizes and themes place verbatim.

## 0.1.0-alpha.3

### Patch Changes

- d4878a3: Order build metadata paths by code unit instead of locale collation.

  `collectBuildFiles` sorted with `localeCompare`, which reorders punctuation and
  varies with the host locale, so `client/_headers` was emitted before
  `client/.assetsignore` even though `.` (U+002E) precedes `_` (U+005F). Build
  metadata is provenance for a reproducible build and is verified downstream with
  a plain relational comparison, so an unsorted manifest is rejected and the same
  output directory could serialize differently on two machines.

## 0.1.0-alpha.2

### Patch Changes

- 4ac8356: Add the immutable Astro/Cloudflare server runtime seam for fixture-backed local development and scoped Voyant publication contexts.

## 0.1.0-alpha.1

### Patch Changes

- 0618c04: Run the project-installed Astro CLI directly so theme builds and development do not require a globally available package manager binary.

## 0.1.0-alpha.0

### Minor Changes

- a91b2bb: Introduce the experimental v1alpha1 theme contract, project tooling, fixture router, and Astro integration.
