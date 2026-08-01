# `@voyant-travel/astro`

Add `voyantTheme({ theme })` to `astro.config.ts`, then import `theme`,
`manifest`, and `resolveThemeContext` from `virtual:voyant-theme`. Local pages
render the same context boundary that published Voyant sites will provide.

Add `/// <reference types="@voyant-travel/astro/virtual" />` to `src/env.d.ts`
for editor and type-checker support. The types subpath is owned and published by
this package.
