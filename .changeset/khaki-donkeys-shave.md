---
"@voyant-travel/theme": minor
---

Add `createSitemap`, so a theme can own its URL inventory without reimplementing
hreflang.

Themes are moving to fetching from the Storefront API rather than reading a
catalog snapshot baked into the publication. Once the platform stops enumerating
a site's addresses it can no longer build that site's sitemap, and the theme is
the only thing left that knows what it routes.

The part worth centralizing is not the XML. It is the alternate set: a theme's
addresses differ per locale — `/pelerinaje` and `/pilgrimages` are one page with
two addresses — and hreflang is only honored when every URL in a cluster names
every other one, itself included. Emitted partially it is discarded silently,
which looks exactly like never having emitted it. Left to each theme, that would
be subtly wrong across the customer base for months before anyone noticed.

`createSitemap` takes the locales, the default locale, and an `entries` function
called once per locale, and returns a request handler. Entries are grouped by a
stable `id` across locales, exactly as the platform's `discovery` document groups
by resource id with `alternates` and an `xDefaultPath`; grouping by path cannot
express this, because the paths are the part that differs. Each group emits one
`<url>` per locale with an `xhtml:link` alternate for every locale plus
`x-default` on the default locale's path.

A resource present in some locales and not others is reported through
`onIncompleteLocaleSet` and omitted by default, because a URL missing from a
sitemap is recovered by ordinary crawling while a cluster that quietly lost its
hreflang is indistinguishable from a theme that never had any. Themes that
publish genuinely locale-specific pages opt into
`incompleteLocaleSet: "emitWithoutAlternates"`, which emits the addresses it has
with no alternates at all. Neither policy ever emits a partial cluster.

It is a handler rather than a build step because themes are SSR Workers and the
catalog moves independently of releases: a file written at build time is stale
the moment a tour is added, renamed or retired, which is the staleness removing
the baked snapshot is meant to end. `<loc>` is absolutized against the origin the
request arrived on, since one release answers on a preview host, a platform host
and a custom domain. Above `SITEMAP_URL_LIMIT` (50,000 URLs) or
`SITEMAP_BYTE_LIMIT` (50MiB) it serves a `sitemapindex` and shards on a
page-suffixed route.
