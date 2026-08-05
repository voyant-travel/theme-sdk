---
"@voyant-travel/theme": minor
---

Publish the operator's collection field definitions with a collection context.

An entry's `values` is a record, so it carries neither the operator's wording
for a field nor the order they arranged the fields in. A theme given only the
record has to invent both, and an operator who labels a field "Written by" and
puts it second sees "Author" first with no way to say otherwise.

`collection.fields` now carries `{ id, label, type }` in declaration order.
`type` is included so a theme can pick a presentation from what the field is
rather than guessing from the shape of one value, which misreads a blank field
and a reference whose target has no translation in this locale.

Additive and optional: context objects are open, so a theme built before this
ignores it, and a theme built after it falls back to the keys of `values` while
a publication materialized before it is still live. No contract version change.
