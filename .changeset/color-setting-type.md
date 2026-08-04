---
"@voyant-travel/theme": minor
---

Add a `color` setting type.

A theme wanting an operator-chosen colour had to declare it as `text`, which
gets a plain input: the operator types a hex code and finds out whether it was
valid by looking at the published site. Declaring `color` lets a host render a
swatch picker instead.

The optional `default` is constrained to `#rgb` or `#rrggbb` rather than any CSS
colour. Named colours and `oklch()` would each need a host to parse them before
it could render a picker, and a theme that wants that expressiveness can declare
a `select` over its own palette.
