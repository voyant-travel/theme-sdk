# @voyant-travel/astro

## 1.9.1

### Patch Changes

- 3880a20: Refresh managed page contexts on every request so publishing Site content is visible without republishing the Theme.

## 1.8.1

### Patch Changes

- fb6c2ff: Accept structured, multi-reference, and resource-reference collection field
  metadata in published collection contexts.
- Updated dependencies [fb6c2ff]
  - @voyant-travel/theme@1.8.1

## 1.8.0

### Minor Changes

- 7cee28a: Expose the server-only managed Content Fetch transport for Site-scoped current-generation reads.

### Patch Changes

- Updated dependencies [4f965da]
- Updated dependencies [d89ac3d]
- Updated dependencies [4d929b2]
  - @voyant-travel/theme@1.8.0

## 1.7.0

### Minor Changes

- b0b4de2: Add the server-only `voyant-platform` connected-development runtime. Astro can
  now resolve real Site content through a short-lived private capability while
  preserving managed publication precedence, fixture behavior, response
  validation, and fail-closed configuration boundaries.
  Canonical same-origin Public API requests are also relayed server-side during
  connected development, so browser code can use the generated managed client
  without receiving the private development capability or a fake API key.

### Patch Changes

- Updated dependencies [b0b4de2]
  - @voyant-travel/theme@1.7.0

## 1.0.2

### Patch Changes

- e713e36: Run publication system-route interception in dedicated pre middleware so theme
  middleware cannot replace or mutate platform-owned robots and sitemap output.

## 1.0.1

### Patch Changes

- d2e7b7a: Proxy platform-owned `robots.txt` and `sitemap.xml` responses through the
  scoped publication binding before Astro catch-all routes resolve page context.

## 1.0.0

### Major Changes

- 6061535: Declare the stable `v1` theme contract after the tour, cruise, template,
  managed-shopping, opaque Trip, and Book-all conformance gates passed across two
  substantially different first-party themes. The stable wire shape is identical
  to `v1alpha5`; readers retain backwards compatibility with all v1 alpha
  publication envelopes.

### Minor Changes

- a91b2bb: Introduce the experimental v1alpha1 theme contract, project tooling, fixture router, and Astro integration.
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

- e41c384: Render operator code injection, and resolve each page's context once.

  `codeInjection` reached the page context and stopped there. Nothing rendered it,
  so an operator's analytics, consent and verification tags were carried all the
  way to the theme and dropped. The field was live in the contract and inert in
  practice.

  The integration now registers its own middleware, so injection works for every
  theme — including ones written before the field existed — rather than depending
  on each author remembering to render it. Forgetting would have failed silently,
  which is the worst property a tag like this can have. `head` goes last in the
  head, `bodyStart` immediately after the body tag, and `bodyEnd` last in the
  body; anchors are matched case-insensitively and each is optional, so a document
  missing one simply does not get that placement instead of having markup appended
  somewhere arbitrary.

  Injection never fails a page. A context that cannot be resolved during injection
  leaves the response exactly as the theme rendered it, because an analytics tag is
  not worth a blank storefront.

  The middleware runs after the page so it splices the finished document, which
  would otherwise mean resolving the same context twice per request. Resolved
  contexts are now memoized per publication and release. A publication is an
  immutable snapshot, so its id changing is precisely what makes an entry stale,
  and keying on it is safe across requests. Failures are never memoized, or one
  unreachable fetch would keep failing for every later request on that isolate.

- 773ddfa: Declare visual-editor sections, blocks, presets and controls in theme build
  metadata, and add draft-only stega provenance helpers plus the origin-pinned
  Astro editor bridge.

### Patch Changes

- 0618c04: Run the project-installed Astro CLI directly so theme builds and development do not require a globally available package manager binary.
- 4ac8356: Add the immutable Astro/Cloudflare server runtime seam for fixture-backed local development and scoped Voyant publication contexts.
- 9c31d1c: Never cache a resolved context as a promise.

  `0.1.0-alpha.5` memoized the in-flight promise so that the page and the
  injection middleware would resolve a page's context with one fetch. A promise
  returned by `fetch` owns the request's I/O context, and Cloudflare Workers
  refuses to await one outside the request that created it, so the first request
  an isolate served succeeded and every request after it failed with
  "Cannot perform I/O on behalf of a different request" — a 500 with an empty
  body.

  Local development never showed it: fixtures resolve without any I/O, so the
  whole class of failure is invisible until a published site serves a second
  request.

  Only the settled context is stored now. It is plain parsed data with nothing
  attached to a request, so reusing it across requests is safe, and it is still
  sound to keep because a publication is an immutable snapshot whose id changes
  whenever its content does. Resolutions that overlap now each fetch, which is the
  cost of holding no promise; the common case, a page and then the middleware
  within one request, still costs one.

- Updated dependencies [0618c04]
- Updated dependencies [919506b]
- Updated dependencies [6946d44]
- Updated dependencies [4ac8356]
- Updated dependencies [ad99b9e]
- Updated dependencies [19c1c13]
- Updated dependencies [0be949b]
- Updated dependencies [4a6df7a]
- Updated dependencies [1684138]
- Updated dependencies [a91b2bb]
- Updated dependencies [2f33b1c]
- Updated dependencies [795a7ab]
- Updated dependencies [b2b4ec5]
- Updated dependencies [f8cc458]
- Updated dependencies [4c71b14]
- Updated dependencies [d4878a3]
- Updated dependencies [6061535]
- Updated dependencies [7683165]
- Updated dependencies [773ddfa]
  - @voyant-travel/theme@1.0.0

## 0.1.0-alpha.13

### Minor Changes

- 773ddfa: Declare visual-editor sections, blocks, presets and controls in theme build
  metadata, and add draft-only stega provenance helpers plus the origin-pinned
  Astro editor bridge.

### Patch Changes

- Updated dependencies [773ddfa]
  - @voyant-travel/theme@0.1.0-alpha.13

## 0.1.0-alpha.6

### Patch Changes

- 9c31d1c: Never cache a resolved context as a promise.

  `0.1.0-alpha.5` memoized the in-flight promise so that the page and the
  injection middleware would resolve a page's context with one fetch. A promise
  returned by `fetch` owns the request's I/O context, and Cloudflare Workers
  refuses to await one outside the request that created it, so the first request
  an isolate served succeeded and every request after it failed with
  "Cannot perform I/O on behalf of a different request" — a 500 with an empty
  body.

  Local development never showed it: fixtures resolve without any I/O, so the
  whole class of failure is invisible until a published site serves a second
  request.

  Only the settled context is stored now. It is plain parsed data with nothing
  attached to a request, so reusing it across requests is safe, and it is still
  sound to keep because a publication is an immutable snapshot whose id changes
  whenever its content does. Resolutions that overlap now each fetch, which is the
  cost of holding no promise; the common case, a page and then the middleware
  within one request, still costs one.

## 0.1.0-alpha.5

### Minor Changes

- e41c384: Render operator code injection, and resolve each page's context once.

  `codeInjection` reached the page context and stopped there. Nothing rendered it,
  so an operator's analytics, consent and verification tags were carried all the
  way to the theme and dropped. The field was live in the contract and inert in
  practice.

  The integration now registers its own middleware, so injection works for every
  theme — including ones written before the field existed — rather than depending
  on each author remembering to render it. Forgetting would have failed silently,
  which is the worst property a tag like this can have. `head` goes last in the
  head, `bodyStart` immediately after the body tag, and `bodyEnd` last in the
  body; anchors are matched case-insensitively and each is optional, so a document
  missing one simply does not get that placement instead of having markup appended
  somewhere arbitrary.

  Injection never fails a page. A context that cannot be resolved during injection
  leaves the response exactly as the theme rendered it, because an analytics tag is
  not worth a blank storefront.

  The middleware runs after the page so it splices the finished document, which
  would otherwise mean resolving the same context twice per request. Resolved
  contexts are now memoized per publication and release. A publication is an
  immutable snapshot, so its id changing is precisely what makes an entry stale,
  and keying on it is safe across requests. Failures are never memoized, or one
  unreachable fetch would keep failing for every later request on that isolate.

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
