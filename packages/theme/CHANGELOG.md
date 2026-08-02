# @voyant-travel/theme

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
