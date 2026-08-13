# v1 theme contract

A `theme.config.ts` default-exports the result of `defineTheme`. It contains:

- a package-like identity and semantic version;
- routes mapped to page contexts, including canonical `tourIndex` and
  `tourDetail` contexts and the canonical cruise resource set;
- alternate templates typed by the page context they can render;
- a minimal alpha settings and section-field vocabulary;
- local fixtures for every context;
- optional argv arrays used by local build and development tooling.

Route patterns use Astro notation. Content routes may use any named dynamic or
rest parameter (`/[entry]`, `/journal/[...path]`); the SDK does not prescribe a
public URL hierarchy.

The context is the rendering boundary. A production publication can provide the
same context shape as local fixtures, so theme code remains independent of data
storage and delivery internals.

## Collections

Collections are operator-defined content sets — news, guides, staff — with
fields the operator declared, so their shape is theirs rather than Voyant's.
A routable collection publishes a `collectionIndex` at the base path the
operator chose and one `collectionEntry` per entry beneath it. Both are
path-addressed: there is no canonical prefix, because `/blog` and `/stiri` are
the same collection in two operators' words.

`entry.values` is keyed by the operator's field ids. `collection.fields` gives
the label, type, and declaration order for those ids, which is what lets a
theme render an entry the way it was authored instead of humanizing keys and
sorting them alphabetically. `entry.path` is present only when the entry's
collection is routable; linking to an entry without one produces a 404 that
looks deliberate, so check for it.

## Tours and live capabilities

Tour pages use the canonical `/tours` (`tourIndex`) and `/tours/[slug]`
(`tourDetail`) routes. Declaring either requires the pair. The validator rejects
non-canonical patterns and any dynamic or rest route that can also match those
paths, so a publication has one unambiguous owner for each tour URL.

Immutable tour contexts carry `CatalogProduct`, the stable public catalog
projection: identity, slug, name, editorial copy, booking/capacity modes,
product type, taxonomy, destinations, locations, media, features, FAQs, and an
optional itinerary. They never carry price, departures, availability, requirements,
quote, booking, checkout, or payment snapshots. Those values change without a
publication and must stay live.

A theme declares the operations it uses in `manifest.capabilities`:

| Capability id | Methods | Purpose |
| --- | --- | --- |
| `catalog.search.v1` | `GET` | Search the public catalog |
| `catalog.product-detail.v1` | `GET` | Refresh a public product projection |
| `catalog.pricing.v1` | `POST` | Resolve current pricing |
| `catalog.availability.v1` | `POST` | Resolve current availability/departures |
| `catalog.requirements.v1` | `POST` | Resolve current participant requirements |
| `catalog.markets.v1` | `GET` | Discover supported selling markets |
| `shopping.search.v1` | `POST` | Run provider-neutral, cross-vertical shopping search |
| `shopping.trip-selections.v1` | `POST`, `PATCH` | Create and revise an opaque Trip selection |
| `shopping.trip-booking.v1` | `POST` | Freeze an opaque Trip revision into a managed Booking Session |
| `booking.session.v1` | `POST`, `PATCH` | Start and continue a scoped booking session |
| `checkout.v1` | `POST` | Hand off to checkout |

Declarations contain only `{ id, required? }` and are closed to catch typos.
At runtime, `context.live.capabilities` reports
`{ id, available, methods, endpoint? }`. Each capability has a fixed method
allowlist (`GET`, `POST`, and/or `PATCH` as appropriate). Endpoints are
platform-generated, same-origin paths beginning with `/v1/public/`;
absolute and protocol-relative origins are invalid. The envelope contains no
provider names, credentials, tokens, internal bindings, or implementation
configuration.

`bookingSessionActionRequestSchema` is the closed request body for every
`booking.session.v1` `PATCH`. Its discriminated `action` union covers `update`,
`quote`, `hold`, `commit`, `abandon`, and `renew`, with the fields required by
each action. Every request carries the last observed positive integer `revision`
and an 8–128 character `idempotencyKey`. The theme sends that key in the body; the
platform binds the same value to its private upstream `Idempotency-Key` header
and maps `revision` to the runtime concurrency precondition. Themes never send
`expectedRevision`, a provider route, or provider selection fields.

Reuse an `idempotencyKey` only when retrying the same logical action with the
same body; choose a new key when the action or its inputs change. After an
accepted action, continue with the revision returned by the new session state.
A revision conflict means the theme must re-read current state before deciding
whether to retry. The body key is authoritative; themes do not set the private
upstream header themselves.

| Action | Action-specific fields |
| --- | --- |
| `update` | `selection` |
| `quote` | none |
| `hold` | `quoteId`; optional positive `quantity` (defaults upstream to 1) |
| `commit` | `quoteId`, `requirementsFingerprint`; optional `holdId`, `paymentIntent`, `payment` |
| `abandon` | none |
| `renew` | positive integer `extendBySeconds` |

```ts
const request = bookingSessionActionRequestSchema.parse({
  sessionId: session.sessionId,
  revision: session.revision,
  idempotencyKey: "hold-cart-42-revision-3",
  action: "hold",
  quoteId: quote.id,
  quantity: 2,
});

await fetch(capability.endpoint, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request),
});
```

The platform continues to understand the earlier actionless update spelling
for already-published themes. New themes should always use the explicit
`action: "update"` member of this union.

### Managed shopping

The shopping capabilities are part of v1 and do not change the
page-context version. Voyant Platform exposes them only at the same-origin
theme routes below and maps them to the corresponding public Storefront routes:

| Capability id | Theme route | Storefront route |
| --- | --- | --- |
| `shopping.search.v1` | `POST /v1/public/theme/shopping/search` | `POST /v1/public/shopping/search` |
| `shopping.trip-selections.v1` | `POST`, `PATCH /v1/public/theme/shopping/trip-selections` | `POST`, `PATCH /v1/public/shopping/trip-selections` |
| `shopping.trip-booking.v1` | `POST /v1/public/theme/shopping/trip-selections/book` | `POST /v1/public/shopping/trip-selections/book` |

Use `shoppingRequestedScopeSchema` for the only values a browser may choose:
an optional `marketId`, BCP 47 `locale`, and uppercase ISO 4217 `currency`.
The schema is closed. Customer or buyer account identity, booking engine,
provider, source, channel, booking, payment, native money, and FX selectors are
not theme inputs. The platform and active Storefront runtime resolve ownership
and supply; the server validates a requested presentation currency and owns all
conversion and FX provenance.

Trip selections are opaque, revisioned live state. A theme passes the request
body to the declared capability endpoint and uses the returned revision; it
does not persist provider payloads or reconstruct booking state in a page
context. Platform and Storefront enforce same-origin proof for both Trip
selection methods.

To book the complete itinerary, validate the closed body with
`shoppingTripBookingRequestSchema` and post it to `shopping.trip-booking.v1`.
It contains only `selectionRef`, `expectedRevision`, and `idempotencyKey`.
The response preserves Storefront's Booking Session outcome and, for an
anonymous shopper, its `bookingSessionCapability`; subsequent lifecycle
actions continue through `booking.session.v1`. The theme never receives a Trip
snapshot id and never chooses a provider, account, payment implementation, or
FX rate.

### Deterministic selling fixtures

`fixtures/tour-selling.json` is the reference matrix for UI stories, theme
previews, and contract tests. Validate custom matrices with
`tourSellingFixtureMatrixSchema`, then use `createTourFixtureAdapter(matrix)`
to select a scenario by its explicit id. `adapter.respond(id)` returns an HTTP
`Response`, preserves deliberately malformed bodies verbatim, or throws
`TourFixtureNetworkError` for a transport failure. It never interprets a magic
query parameter or forwards a fixture selector to a live provider.

The matrix covers:

- populated, empty, and failed indexes;
- rich, minimal, not-found, and unavailable details;
- priced/unpriced offers and available/sold-out inventory;
- invalid requests and provider failures for pricing and availability;
- booking creation, hold, commit, missing/expired sessions, revision conflicts,
  and idempotency conflicts;
- checkout readiness, pending/succeeded/failed payment, network failure, and a
  malformed upstream response.

Fixture declarations and live result bodies are closed schemas. Success bodies
use only provider-neutral identifiers, integer minor-unit money, revisions,
statuses, and timestamps. Provider payloads must be adapted at the platform
boundary; provider names and credentials are never valid fixture fields.

Page fixtures remain ordinary immutable `tourIndex` and `tourDetail` contexts.
Commercial values live only under a fixture's `surface: "live"` response and
therefore cannot be copied into a publication object. The fixture protocol is
versioned independently as `v1`; adding it did not change the v1alpha4 page
context wire version.

## Categories

A theme declares exactly one route with `context: "categoryDetail"` and a
pattern containing one parameter: `/[category]`, or `/c/[category]` to scope
it. Unlike `tourIndex` there is no canonical pattern to validate against — the
operator's own slug is the address, so the theme owns only the namespace it
sits in and Voyant substitutes the slug, publishing one page per catalog
category. Declaring zero such routes publishes no category pages, and so does
declaring two, silently: with two candidate namespaces the platform has no
address to choose.

Categories are derived from the catalog rather than authored beside it. Every
product carries `categories[]`, each with a translated slug and an id stable
across locales, so `/pelerinaje` and `/pilgrimages` resolve from one id — key
on `category.id`, never the slug. A slug must be a single safe path segment;
the reader rejects encoded separators and dot segments, so a category whose
slug is not one is skipped rather than published at an address no request can
retrieve.

Membership is deliberately not embedded. `catalog.search.v1` already filters by
`categoryId` and returns live pricing, availability, and paging with it, where
a baked list would be a second copy of the catalog in every category in every
locale that is stale the moment the catalog moves. `products` is therefore
usually absent; treat a publication that carries one as an optimization and
fall back to the capability.

## Cruises

The v1 contract includes the second tourism graph proven during v1alpha5:
`cruiseIndex` at `/cruises`, `cruiseDetail` at `/cruises/[slug]`,
`shipDetail` at `/ships/[slug]`, and `sailingDetail` at
`/sailings/[slug]`. Declaring any one requires exactly one of all four. Dynamic
or rest routes that can also own those paths are rejected.

Immutable cruise contexts publish provider-neutral editorial projections for
cruises, ships, sailings, itineraries, calendar departures, ports, and cabin
categories. A departure identifies the public dates, duration, and embarkation
and disembarkation ports; it is not an inventory or fare snapshot.

Every key in an immutable cruise graph is inspected recursively. Price,
availability, fare, promotion, quote, booking, session, checkout, payment,
personal-information, provider, source, and provenance fields are rejected even
when nested inside an additive object. Search and all selling state remain live:

| Capability id | Methods | Purpose |
| --- | --- | --- |
| `cruise.search.v1` | `GET` | Search and filter current cruise results |
| `cruise.sailing.v1` | `GET` | Resolve current sailing choices |
| `cruise.pricing.v1` | `POST` | Price a selected sailing and cabins |
| `cruise.quote.v1` | `POST` | Create a provider-neutral quote |
| `booking.session.v1` | `POST`, `PATCH` | Start and continue booking |
| `checkout.v1` | `POST` | Hand off to checkout |

## Template assignment

A route id is the default template for the context selected by routing. A theme
may declare alternate renderers in `manifest.templates` as
`{ id, name, context }`. Template ids are globally unique across routes and
alternate templates. `sections.templates` may target either kind.

Assignments are platform-owned publication configuration, not theme authoring.
`themeTemplateAssignmentsSchema` accepts closed declarations at four scopes:
`vertical`, `resourceType`, `taxonomy`, and an individual `resource`. Platform
identifiers are opaque strings; an assignment also declares its page `context`
and a theme `templateId`. `checkThemeTemplateAssignments` rejects unknown
template ids, templates for a different context, duplicate selectors, and
unknown authoring keys.

`resolveThemeTemplate` applies one stable precedence order:

1. individual resource;
2. matching taxonomy term (highest explicit `priority`, then lexical selector
   order for a stable tie-break);
3. resource type;
4. vertical;
5. the routed context's default template.

The resolver validates that the default is declared for the requested context.
A materialized context exposes only the resulting `templateId`. It never
contains assignment rules, taxonomy selectors, resource ids, or resolution
provenance. `templateId` is optional to keep older readable publications valid.

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
- **The envelope is closed in shape.** The production reader returns
  `{ contractVersion, context }`. That frame carries the version negotiation
  itself, so an unexpected envelope property, an unreadable contract version, a
  mismatched path, or an invalid context fails closed rather than falling back
  to fixture content.

Open contexts do not mean unvalidated ones. Known fields keep their
constraints: a malformed locale, a missing `seo.title`, or an unknown `kind`
still fails closed.

## Sections and blocks

Themes declare the controls the visual editor may render; operators supply the
values later. A section has `settings`, repeatable `blocks`, `max_blocks`, an
optional per-template `limit`, starter `presets`, and `templates` containing
route ids (`[]` means every route). Declaration order is editor order.

```ts
{
  id: "hero",
  name: "Hero",
  settings: [{ id: "heading", label: "Heading", type: "inline_richtext" }],
  blocks: [{
    type: "button",
    name: "Button",
    limit: 2,
    settings: [{ id: "label", label: "Label", type: "text" }],
  }],
  max_blocks: 2,
  limit: 1,
  presets: [{
    name: "Hero",
    settings: { heading: "Travel further" },
    blocks: [{ type: "button", settings: { label: "Explore" } }],
  }],
  templates: ["home"],
}
```

Settings support `text`, `textarea`, `richtext`, `inline_richtext`, `html`,
`checkbox`, `radio`, `select`, `number`, `range`, `text_alignment`, `color`,
`color_scheme`, `font_picker`, `image_picker`, `video`, and `video_url`.
Voyant resource pickers are `tour`, `departure`, `supplier`, `media`, `page`,
and `content_entry`; the last requires `content_type`. The legacy `boolean` and
`image` literals remain readable.

The build digest commits to declaration order with keys in the position
`routes`, `templates`, `settings`, `sections`, `contentBindings`, `capabilities`,
`outputDirectory`. Preset
setting maps are JSON and are canonicalized recursively: array order is kept,
while every object is rebuilt with keys in ascending UTF-16 code-unit order.

## The overlap window

A publication and a theme release are separately versioned artifacts with
independent lifecycles. An operator publishes content far more often than they
redeploy a theme, so the two cannot be required to move in the same instant —
whichever order you pick, a hard cutover leaves the storefront failing in
between.

A theme therefore **declares one version and reads several**. It sends
`CONTRACT_VERSION` on `X-Voyant-Theme-Contract-Version`, and accepts any
envelope in `READABLE_CONTRACT_VERSIONS` on the way back. Reading an older
envelope runs `upgradeThemeContextResponse` first, which fills what the older
shape did not carry — for v1alpha1, `seo` from the document title that
travelled as `context.title`. The fill is conditioned on the envelope version,
not on the field merely being absent, so a v1alpha2 context without `seo` is
still the platform bug it is and still fails closed.

This covers only the direction the SDK controls: a **newer theme reading an
older publication**. The reverse — an older deployed theme meeting a newer
publication — cannot be fixed here, because that theme is running an SDK that
shipped before the new version existed. The platform must therefore materialize
each publication at the contract version of the theme release it is bound to.
Publication objects are already stored per release
(`themes/publications/{siteId}/{publicationId}/{releaseId}`) and every release
record already carries its own `contractVersion`, so two releases of one site
can legitimately hold different-version objects side by side.

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

Schemas live under `schemas/v1`; alpha schemas remain published for existing
theme releases. Within v1, Voyant may add optional context fields and new
capability identifiers; existing fields, discriminants, routes, authoring
semantics, and diagnostic meanings are not removed or reinterpreted. A breaking
wire or authoring change requires `v2`. Readers retain all v1 alpha envelope
versions so immutable themes and publications can cross a rollout safely.
Stable diagnostic codes can be consumed by CI and agents.
