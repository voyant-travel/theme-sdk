---
"@voyant-travel/theme": minor
---

Carry the settings a theme declares into its build metadata.

`manifest.settings` was validated and then went nowhere: the build metadata
recorded routes but not settings, so a host had no way to learn which controls a
theme wanted rendered. A theme could declare a setting, read it from
`context.settings`, and no operator could ever supply a value for it.

The field is now part of `voyant.theme.build.v2`, in declaration order rather
than sorted by id — a theme orders its settings the way it wants them presented,
and sorting would scatter a deliberate grouping. Themes that declare none get an
empty list.

This changes the artifact digest for any theme with declared settings, which is
expected: the metadata genuinely describes more than it did.
