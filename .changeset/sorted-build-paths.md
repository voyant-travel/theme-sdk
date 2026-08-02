---
"@voyant-travel/theme": patch
---

Order build metadata paths by code unit instead of locale collation.

`collectBuildFiles` sorted with `localeCompare`, which reorders punctuation and
varies with the host locale, so `client/_headers` was emitted before
`client/.assetsignore` even though `.` (U+002E) precedes `_` (U+005F). Build
metadata is provenance for a reproducible build and is verified downstream with
a plain relational comparison, so an unsorted manifest is rejected and the same
output directory could serialize differently on two machines.
