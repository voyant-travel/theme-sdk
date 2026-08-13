---
"@voyant-travel/theme": minor
---

Let a theme hold a category fixture, so category pages can be built locally.

The v1 contract already carries `categoryDetail`: the schema is published, the
context is in the page union, and the validator admits a `/[category]` route.
Voyant materializes one page per catalog category from it. But `themeFixturesSchema`
never grew a matching slot, and because it is strict a theme author could not add
one by hand — `defineTheme` rejected the whole definition. The only way to see a
category page render was to publish and look at production, which is the opposite
of what fixtures are for.

`fixtures.categoryDetail` is now an array of `categoryDetail` contexts, and
`createFixtureRouter` resolves them by path alongside tour, cruise, ship, and
sailing detail fixtures. Category addresses are the operator's own translated
slugs — `/pelerinaje`, `/sejururi` — so they are path-addressed rather than
hung off a canonical prefix like `/tours`.

The slot defaults to empty. Existing themes stay valid with no migration, and a
theme that declares no category fixtures still falls through to `notFound`.
