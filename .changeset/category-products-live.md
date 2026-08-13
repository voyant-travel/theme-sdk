---
"@voyant-travel/theme": minor
---

Leave category membership to the catalog capability.

`categoryDetail.products` is now optional and usually absent, rather than an
array defaulting to empty. `catalog.search.v1` already filters by `categoryId`,
so asking it gets live pricing, availability and paging, where a baked list is
a second copy of the same membership that grows the publication by every
product in every category in every locale and is stale as soon as the catalog
moves.

Absent is distinguishable from empty, so a theme can tell "this publication
carries no listing, ask the capability" from "this category has no products",
which a defaulted empty array collapsed together.

A publication may still carry a listing when a theme needs one rendered
without a live call. Treat it as an optimization and fall back to
`catalog.search.v1?categoryId=`.

Nothing consumes `categoryDetail` yet — no publication emits it and no theme
reads it — so the narrower type has no migration.
