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

After a successful build, tooling writes `.voyant/theme-build.json`. It records
the contract and theme versions, sorted routes, relative output path, and sorted
SHA-256 file digests. Its aggregate digest excludes timestamps and absolute
paths, making identical artifacts reproducible across machines.

`loadThemeProject`, `checkTheme`, and `devTheme` are additive SDK helpers. The
CLI should use the three stable names above.
