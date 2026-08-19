# `@voyant-travel/astro`

Add the official Cloudflare adapter and `voyantTheme({ theme })` to
`astro.config.ts`, set `output: "server"`, then import `theme`, `manifest`, and
`resolveThemeContext` from `virtual:voyant-theme`:

```astro
---
import { resolveThemeContext } from "virtual:voyant-theme";

const context = await resolveThemeContext(Astro.url);
if (context.kind === "notFound") Astro.response.status = 404;
---
```

When no Voyant publication bindings exist, the resolver uses fixtures. When the
dispatcher injects any production binding, all five are required and errors
fail closed. Theme code always receives the validated `v1alpha2` context.

The same call supports connected local development when the Voyant CLI starts
Astro with a validated development descriptor, the exact `voyant-platform`
Adapter, and a private `VOYANT_THEME_DEVELOPMENT_CAPABILITY`. The runtime sends
a fresh server-side request to the descriptor's Content endpoint for every
resolution. Partial, expired, or malformed connected configuration fails
closed; it never falls back to fixtures. Capabilities must not be placed in
`PUBLIC_*`, `VITE_*`, URLs, project files, or query parameters.

Connected development also serves canonical same-origin `/v1/public/*`
requests through the Platform relay. Theme browser code can use
`@voyant-travel/public-api-client` with `managed: true` without receiving an
API key. Outside connected development the middleware leaves those routes
alone: externally hosted Themes use their own `vpk_`/`vsk_`, while the Voyant
production hosting Adapter remains responsible for its Public API transport.

Add `/// <reference types="@voyant-travel/astro/virtual" />` to `src/env.d.ts`
for editor and type-checker support. The types subpath is owned and published by
this package.

The build integration writes `.voyant/theme-runtime.json`; theme tooling folds
that descriptor into `voyant.theme.build.v3`. Voyant publishes the adapter's
built `server/entry.mjs` with the archived `client` directory on an `ASSETS`
binding. See the repository runtime contract for the exact bindings.
