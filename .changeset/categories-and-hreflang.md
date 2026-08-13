---
"@voyant-travel/theme": minor
---

Represent product categories, and publish the locale alternates a theme needs
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
