# Tooling API

The CLI dynamically imports `@voyant-travel/theme/tooling` from the theme
project. The stable machine boundary is:

```ts
validateTheme({ projectRoot, configFile? })
buildTheme({ projectRoot, configFile? })
developTheme({ projectRoot, configFile?, host?, port? })
```

Validation and build return a JSON-serializable report with schema version
`voyant.theme.tooling.v1`, `ok`, and sorted diagnostics. Diagnostic `code` and
`path` are stable machine fields; `message` and `hint` are for people.

Development resolves to `{ url, wait(), close() }`. `wait()` observes early
spawn failures and process exits as a numeric exit code; `close()` is idempotent.
Build and dev commands default to `pnpm exec astro build|dev`, and a theme can
provide shell-free argv arrays in `tooling.build` and `tooling.dev`.

`buildTheme({ output: "silent" })` suppresses build stdout while retaining
stderr, allowing the CLI to keep `--json` output machine-readable.

After a successful build, tooling writes `.voyant/theme-build.json` with schema
`voyant.theme.build.v3`. It records the contract and theme versions, sorted
routes, alternate template declarations, relative output path, runtime descriptor, and sorted SHA-256 file
digests. Its aggregate digest excludes timestamps and absolute paths, making
identical artifacts reproducible across machines.

The Astro integration writes `.voyant/theme-runtime.json` during its build. The
tooling validates that its entrypoint and assets directory are safe relative
paths present inside the artifact output before including it in the aggregate
digest. A theme without a runtime descriptor records `runtime: null`; such an
artifact is not a deployable Voyant server theme.

`loadThemeProject`, `checkTheme`, and `devTheme` are additive SDK helpers. The
CLI should use the three stable names above.
