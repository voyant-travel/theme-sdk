# Tooling API

The CLI dynamically imports `@voyant-travel/theme/tooling` from the theme
project. The stable machine boundary is:

```ts
validateTheme({ projectRoot, configFile? })
buildTheme({ projectRoot, configFile? })
developTheme({ projectRoot, configFile?, host?, port?, runtime? })
```

Validation and build return a JSON-serializable report with schema version
`voyant.theme.tooling.v1`, `ok`, and sorted diagnostics. Diagnostic `code` and
`path` are stable machine fields; `message` and `hint` are for people.

Development resolves to `{ url, wait(), close() }`. `wait()` observes early
spawn failures and process exits as a numeric exit code; `close()` is idempotent.
Build and dev commands default to `pnpm exec astro build|dev`, and a theme can
provide shell-free argv arrays in `tooling.build` and `tooling.dev`.

When `runtime` is omitted, development remains fixture-backed and makes no
connected-runtime assumptions. For connected development, the proprietary
Voyant CLI passes a `ThemeDevelopmentRuntimeReference`: a validated,
host-neutral `voyant.theme-development-runtime.v1` descriptor and an Adapter.
The descriptor identifies the session, Theme, Site, installation, local
manifest digest, content perspective, remote endpoints, editor protocol, and
expiry. It cannot contain capability secrets.

`editor.baseUrl` is stable, non-secret routing metadata. A one-time editor
handoff code is obtained and consumed separately by the proprietary CLI and is
never part of the descriptor. No endpoint may place a credential in its query,
fragment, user information, or path segments; every complete descriptor URL
must be safe to persist and log.

An Adapter can close over an opaque short-lived capability and return private
child environment values from `prepare()`. Tooling forwards those values only
to the Astro child process: it never places them in argv, descriptor JSON,
stdout, or `.voyant` build/runtime metadata. Public `VITE_*` and `PUBLIC_*`
names are rejected. Adapter teardown runs when the development process exits.

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
