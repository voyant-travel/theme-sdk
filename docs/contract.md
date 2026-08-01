# v1alpha1 theme contract

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

Schemas live under `schemas/v1alpha1`. Breaking experiments require a new
contract version; stable diagnostic codes can be consumed by CI and agents.
