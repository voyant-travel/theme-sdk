---
"@voyant-travel/theme": minor
---

Widen the live surface a theme can build on.

A theme could reach twelve operations out of roughly ninety public ones, and
the missing reads were the ones a storefront needs to be more than a brochure.
There was no way to enumerate categories, destinations or tags, no way to
resolve a product by the slug a theme is addressed by, and no way to show a
product's departures, offers or extensions.

New capability ids, all reads:

- `catalog.categories.v1`, `catalog.destinations.v1`, `catalog.tags.v1` —
  enumerate the taxonomy, so a theme can build browse and filter UI instead of
  filtering a list it was handed.
- `catalog.product-by-slug.v1` — resolve by slug. Themes are addressed by slug
  and the only product read took an id.
- `catalog.departures.v1`, `catalog.departure-pricing.v1`,
  `catalog.offers.v1`, `catalog.extensions.v1` — real departures, prices and
  promotions on a product page.
- `operator.profile.v1`, `operator.settings.v1`, `legal.policy.v1`,
  `legal.terms.v1` — render trust and policy pages from the operator record
  rather than hand-authored copy kept in sync by hand.

Public writes and anything returning customer data are deliberately excluded.
Lead capture and newsletter signup need abuse controls, and booking lookups
need a privacy review; neither is something a capability id provides.

These are declarations. A capability is only callable once the platform maps it
and an operator's publication reports it `available`.
