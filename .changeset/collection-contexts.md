---
"@voyant-travel/theme": minor
---

Add the collection context kinds, at contract version v1alpha3.

`collectionIndex` and `collectionEntry` carry the content types an operator
defines for themselves: a listing page and one page per entry. Entry values are
keyed by the field ids the operator declared, so a theme reads the keys it knows
and ignores the rest, exactly as it does with settings.

This needs a new contract version rather than riding on v1alpha2. Unknown
context FIELDS are already tolerated, but a `kind` is not a field: the page
context is a union discriminated on it, so a kind a release has never heard of
fails the whole response instead of being ignored. v1alpha2 stays readable, so a
theme on this release still renders publications made for the previous one.

`entry.path` is absent for a type with no pages of its own. Themes must check it
before linking rather than assuming it is there.
