---
"@voyant-travel/theme": minor
---

Let a theme hold collection fixtures, so collection pages can be built locally.

The v1 contract already carries `collectionIndex` and `collectionEntry`: both
kinds are in `themeContextKindSchema`, both have published context schemas, both
are in the page-context union, and Voyant materializes an index and one entry
page per routable collection. But `themeFixturesSchema` never grew matching
slots, and because it is strict a theme author could not add them by hand —
`defineTheme` rejected the whole definition. The only way to see a collection
page render was to publish and look at production, which is the opposite of what
fixtures are for. It is the same gap `categoryDetail` had before 1.5.0.

`fixtures.collectionIndex` and `fixtures.collectionEntry` are now arrays of
their contexts, and `createFixtureRouter` resolves both by path alongside the
other path-addressed fixtures. A collection lives at the base path the operator
chose — `/blog`, `/stiri` — with entries beneath it, so neither is hung off a
canonical prefix the way `/tours` and `/cruises` are, and an index is not a
singleton: a site has as many as the operator declared.

Both slots default to empty. Existing themes stay valid with no migration, and a
theme that declares no collection fixtures still falls through to `notFound`.
