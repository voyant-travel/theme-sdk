---
"@voyant-travel/astro": minor
---

Add the server-only `voyant-platform` connected-development runtime. Astro can
now resolve real Site content through a short-lived private capability while
preserving managed publication precedence, fixture behavior, response
validation, and fail-closed configuration boundaries.
Canonical same-origin Public API requests are also relayed server-side during
connected development, so browser code can use the generated managed client
without receiving the private development capability or a fake API key.
