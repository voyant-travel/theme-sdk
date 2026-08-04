# @voyant-travel/astro

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

### Patch Changes

- Updated dependencies [f8cc458]
  - @voyant-travel/theme@0.1.0-alpha.4

## 0.1.0-alpha.2

### Patch Changes

- 4ac8356: Add the immutable Astro/Cloudflare server runtime seam for fixture-backed local development and scoped Voyant publication contexts.
- Updated dependencies [4ac8356]
  - @voyant-travel/theme@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- 0618c04: Run the project-installed Astro CLI directly so theme builds and development do not require a globally available package manager binary.
- Updated dependencies [0618c04]
  - @voyant-travel/theme@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- a91b2bb: Introduce the experimental v1alpha1 theme contract, project tooling, fixture router, and Astro integration.

### Patch Changes

- Updated dependencies [a91b2bb]
  - @voyant-travel/theme@0.1.0-alpha.0
