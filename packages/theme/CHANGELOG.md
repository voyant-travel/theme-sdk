# @voyant-travel/theme

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
