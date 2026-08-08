# Astro and Cloudflare runtime contract

One theme source commit produces one immutable Astro server release. Local
development renders `theme.config.ts` fixtures. A Voyant deployment renders the
same `v1alpha5` context types from the selected publication without rebuilding
theme source when operators publish content.

This contract follows the current official Astro Cloudflare adapter:

- server output uses `output: "server"` and `@astrojs/cloudflare`;
- bindings are read from `env` in `cloudflare:workers` (Astro 6 removed
  `Astro.locals.runtime`);
- source builds use Wrangler's `@astrojs/cloudflare/entrypoints/server` main;
- the adapter emits a self-contained `dist/server/entry.mjs` plus
  `dist/client` static assets for artifact publication.

References: [Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/),
[Astro on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/),
and [Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).

## Injected bindings

Voyant injects exactly these release-scoped capabilities:

```ts
type VoyantPublicationBindings = {
  PUBLICATION: Fetcher
  VOYANT_PUBLICATION_TOKEN: string
  VOYANT_SITE_ID: string
  VOYANT_PUBLICATION_ID: string
  VOYANT_THEME_RELEASE_ID: string
}
```

The dispatcher is responsible for minting a token bound to the site,
publication, release, locale, and normalized path. If none of the five bindings
exist, the resolver uses fixtures. If only some exist, resolution fails closed.

## Reader request

`resolveThemeContext(Astro.url)` calls `PUBLICATION.fetch()` with a new `GET`
request. Its URL is the incoming absolute URL with the fragment removed; its
normalized path and locale query are therefore preserved. No visitor cookies,
authorization, or arbitrary request headers are forwarded.

The public locale prefix is not part of a stored context path. After validating
the response locale against the trusted reader's
`X-Voyant-Publication-Locale` header, the resolver maps `/{locale}` to `/` and
`/{locale}/somewhere` to `/somewhere` for path and not-found-header checks. A
public path without that exact locale prefix is compared unchanged.

The request contains:

- `Authorization: Bearer <VOYANT_PUBLICATION_TOKEN>`;
- `X-Voyant-Site-Id`;
- `X-Voyant-Publication-Id`;
- `X-Voyant-Theme-Release-Id`;
- `X-Voyant-Theme-Contract-Version: v1alpha5`, the version the theme declares.

The server-owned reader maps that scope to
`themes/publications/{siteId}/{publicationId}/{releaseId}` and resolves context
objects under `contexts/{locale}/{path-key}.json`. The theme cannot choose an R2
key or storage prefix.

Successful reads return JSON shaped as
`{ contractVersion, context: ThemePageContext }` and include
`X-Voyant-Publication-Locale: <canonical BCP-47 locale>`. Context locales must
be canonical BCP-47 tags, such as `en`, `en-US`, or `zh-Hant-TW`. The resolver
caps the buffered response at 2 MiB, upgrades a readable older envelope,
validates the strict envelope shape and the open context, requires the header to
exactly equal `context.locale`, and only then verifies that the context path
equals the requested path. Context fields the theme's SDK release predates are
carried through rather than rejected, and an envelope from an older readable
contract version still resolves, so a release and a publication do not have to
move together; see [the contract](contract.md).

### Draft editor bridge and provenance

The platform opts a loose page context into editing with
`_voyant: { mode: "draft", editorOrigin: "https://…" }`. This signal belongs to
the open context, never the strict response envelope or a request header. The
Astro middleware then injects the platform-owned bridge. It posts
`voyant:edit:load` to that exact origin and remains inert until the parent sends
`voyant:edit:ready` from the same window and origin. The channel carries only
RFC-6901 selection pointers and setting updates.

Draft strings may use the SDK stega helpers to carry an invisible pointer.
Encoding is allowlist-only. Root `settings`, `path`, `locale`, identifiers,
routing fields, URLs, resource locations, and code injection are never encoded;
non-draft contexts are returned unchanged by reference, preserving production
output byte-for-byte. An older theme or host that never completes the handshake
continues rendering normally without editor behavior.

For an unknown path, the reader may return a typed `notFound` envelope with HTTP
404, `X-Voyant-Publication-Locale`,
`X-Voyant-Publication-Context-Path: /404`, and
`X-Voyant-Requested-Path: <normalized path>`. The resolver accepts only that
exact combination; the Astro page then sets its response status to 404. All
other non-success responses and response/header/schema mismatches fail closed.

## Publication and caching

Theme source is built once. A content publication creates new immutable context
objects and advances a publication pointer; it does not rebuild the theme.

The SDK deliberately does not set public, private, draft, or preview cache
headers. The trusted edge knows the publication visibility and is responsible
for cache policy. Draft and private preview responses must be
`Cache-Control: private, no-store`; public immutable publication reads can use
the platform's publication-aware edge caching and invalidation policy.

## Build metadata

The integration emits this runtime descriptor, which tooling includes in the
digest of `voyant.theme.build.v3`:

```json
{
  "schemaVersion": "voyant.theme.runtime.v1",
  "platform": "cloudflare-workers",
  "entrypoint": "server/entry.mjs",
  "assetsDirectory": "client",
  "assetsBinding": "ASSETS",
  "compatibilityFlags": ["nodejs_compat"],
  "requiredBindings": [
    "PUBLICATION",
    "VOYANT_PUBLICATION_TOKEN",
    "VOYANT_SITE_ID",
    "VOYANT_PUBLICATION_ID",
    "VOYANT_THEME_RELEASE_ID"
  ]
}
```

The trusted publisher must allowlist these values, deploy the archived
`server/entry.mjs`, bind `ASSETS` to the archived `client` directory, and inject
only the five declared runtime bindings. It does not rebuild or resolve theme
source. The release archive remains immutable across content publications.

Voyant Themes v1 does not provide a durable Astro session capability. Templates
should configure a binding-free session driver only to prevent the Cloudflare
adapter from auto-provisioning its default `SESSION` KV binding, and must not
use it for customer state.
