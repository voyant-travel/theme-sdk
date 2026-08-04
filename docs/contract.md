# v1alpha2 theme contract

A `theme.config.ts` default-exports the result of `defineTheme`. It contains:

- a package-like identity and semantic version;
- routes mapped to `home`, `content`, or `notFound` contexts;
- a minimal alpha settings and section-field vocabulary;
- local fixtures for every context;
- optional argv arrays used by local build and development tooling.

Route patterns use Astro notation. Content routes may use any named dynamic or
rest parameter (`/[entry]`, `/journal/[...path]`); the SDK does not prescribe a
public URL hierarchy.

The context is the rendering boundary. A production publication can provide the
same context shape as local fixtures, so theme code remains independent of data
storage and delivery internals.

## Open contexts, closed authoring

A theme is an immutable release; the publication it reads is not. Voyant grows
the context as the product grows, and a theme built months earlier still has to
serve the page. So the two halves of the contract are validated differently:

- **Contexts are open.** Every object Voyant emits accepts and preserves
  properties this SDK release does not know about. Adding a context field is a
  content change, not a contract version change, and a deployed theme that
  ignores the field renders exactly as before.
- **Authoring is closed.** The manifest, routes, fields, and tooling block stay
  strict, because there an unrecognized key is a typo in `theme.config.ts` and
  failing on it is the whole point of `voyant theme check`.
- **The envelope is closed.** The production reader returns
  `{ contractVersion: "v1alpha2", context }`. That frame carries the version
  negotiation itself, so an unexpected envelope property, a different contract
  version, a mismatched path, or an invalid context fails closed rather than
  falling back to fixture content.

Open contexts do not mean unvalidated ones. Known fields keep their
constraints: a malformed locale, a missing `seo.title`, or an unknown `kind`
still fails closed.

## Context fields

Every context carries:

| Field           | Shape                                             |
| --------------- | ------------------------------------------------- |
| `locale`        | canonical BCP-47 tag                              |
| `site`          | `{ name, logo? }`                                 |
| `seo`           | `{ title, description?, noIndex }`                |
| `openGraph?`    | `{ title?, description?, image? }`                |
| `menus`         | `Record<string, MenuItem[]>`, `MenuItem` nestable |
| `navigation`    | flat `{ label, href }[]`                          |
| `codeInjection?`| `{ head?, bodyStart?, bodyEnd? }`                  |
| `settings`      | open record of theme setting values                |

`seo.title` is the document title; `title` remains the page's own heading text.
They are often the same string and are not required to be.

`menus` is keyed by operator-chosen name — `primary` and `footer` are the
conventional ones — so operators can add a menu without an SDK release. Items
nest through `items`. `navigation` is the primary menu flattened to one level,
for themes that do not render nested navigation.

`codeInjection` is raw operator markup. Voyant sanitizes and bounds it before
it reaches a context; the theme's only job is to place each slot in the right
part of the document (`head`, immediately after `<body>`, immediately before
`</body>`) and render it verbatim. Escaping it is the same bug as trusting it:
both silently break the analytics and consent tags operators depend on.

The context is a theme-facing projection, not Voyant's internal model. It says
what a page needs to render and nothing about how content is stored.

Schemas live under `schemas/v1alpha2`. Breaking experiments require a new
contract version; additive context fields do not. Stable diagnostic codes can
be consumed by CI and agents.
