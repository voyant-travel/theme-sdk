---
"@voyant-travel/theme": minor
---

Give every published record a lead image under one name.

Only `catalogProduct`, `cruise` and `cruiseShip` declared a `coverMedia`.
Everything else a theme puts on a page had an ambiguous `media[]` or nothing at
all, so a sailing detail page had no hero, cabin and port grids had to guess at
`media[0]`, and a destination or category grid could not be built from the
catalog at all.

`coverMedia` is now declared on `cruiseSailing` (with `media[]`),
`cruiseCabinCategory`, `cruisePort`, `cruiseItinerary.days[]`,
`catalogProductDestination`, `catalogProductCategory` and
`catalogProductItinerary.days[]`, and every declaration is
`.nullable().optional()` so one null check reads them all — `cruise.coverMedia`
and `cruiseShip.coverMedia` previously accepted `undefined` but not `null`.

Tour itinerary days keep `thumbnailUrl`, now deprecated in favor of
`coverMedia`: a bare URL carries no dimensions and no alt text, so a theme can
neither size the image nor describe it.

All fields are additive and optional. Existing publications and themes parse
unchanged.
