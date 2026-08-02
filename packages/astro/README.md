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
fail closed. Theme code always receives the validated `v1alpha1` context.

Add `/// <reference types="@voyant-travel/astro/virtual" />` to `src/env.d.ts`
for editor and type-checker support. The types subpath is owned and published by
this package.

The build integration writes `.voyant/theme-runtime.json`; theme tooling folds
that descriptor into `voyant.theme.build.v2`. Voyant publishes the adapter's
built `server/entry.mjs` with the archived `client` directory on an `ASSETS`
binding. See the repository runtime contract for the exact bindings.
