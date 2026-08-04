# @voyant-travel/astro

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
