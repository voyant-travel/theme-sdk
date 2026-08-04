---
"@voyant-travel/theme": minor
"@voyant-travel/astro": minor
---

Make published page contexts forward compatible and raise the contract to `v1alpha2`.

Every context schema was a strict object, so any field Voyant added to a
published context was rejected wholesale by already-deployed themes and the page
failed with `THEME_CONTEXT_RESPONSE_INVALID`. Additive platform changes were
therefore breaking changes that required an SDK release and a rebuild of every
theme.

Context objects now parse permissively and preserve unknown properties, while
the response envelope stays strict because it carries the version negotiation
itself, and the theme-authored manifest stays strict because there an unknown
key is a typo. Known fields keep their constraints.

Contexts also carry the fields the platform already authored or needs:
`seo` (`title`, `description?`, `noIndex`), optional `openGraph`, named and
optionally nested `menus`, and optional `codeInjection` of raw operator markup
that Voyant sanitizes and themes place verbatim.
