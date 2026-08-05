---
"@voyant-travel/theme": minor
---

Let a theme declare the collection shape it needs, and read it back by slot.

A shared theme cannot know what an operator called their fields. One site's
guides carry `abstract`, another's carry `intro`, and a theme reading either id
directly works on exactly one site.

`manifest.contentBindings` inverts that. The theme declares the slots it
renders — `summary`, `hero`, `author` — with a type and an optional `required`
flag, and the operator maps their own fields onto them once at installation.
Published entries then carry `entry.binding`, the operator's values projected
onto those slots, so the theme reads `entry.binding.summary` and never learns
the field id behind it. `values` stays present for a theme rendering its own
collections rather than a bound one.

Additive and optional: `contentBindings` defaults to empty and `binding` is
absent on an unbound collection, so nothing changes for a theme that declares
none. No contract version change.
