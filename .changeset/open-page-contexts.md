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
