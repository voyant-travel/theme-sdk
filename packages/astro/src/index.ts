import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkThemeDefinition,
  type ParsedThemeDefinition,
  type ThemeDefinition,
} from "@voyant-travel/theme";
import type { AstroIntegration } from "astro";
import { CLOUDFLARE_THEME_RUNTIME } from "./deployment.js";

const DEVELOPMENT_ENV_NAMES = [
  "VOYANT_THEME_DEVELOPMENT_RUNTIME",
  "VOYANT_THEME_DEVELOPMENT_RUNTIME_ADAPTER",
  "VOYANT_THEME_DEVELOPMENT_CAPABILITY",
] as const;

const DEVELOPMENT_SSR_ENTRIES = [
  "@voyant-travel/astro/runtime",
  "@voyant-travel/astro/middleware",
  "@voyant-travel/astro/system-middleware",
] as const;

const VIRTUAL_ID = "virtual:voyant-theme";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

export interface VoyantThemeOptions {
  theme: ThemeDefinition | ParsedThemeDefinition;
}

export interface VirtualVoyantThemeModule {
  theme: ParsedThemeDefinition;
  manifest: ParsedThemeDefinition["manifest"];
  resolveThemeContext(
    input: string | URL,
  ): Promise<import("@voyant-travel/theme").ThemePageContext>;
  resolveThemePublicApiRoute(request: Request): Promise<Response | undefined>;
  resolveThemeConsentConfiguration(
    request: Request,
  ): Promise<import("./consent.js").ThemeConsentConfiguration | null>;
  resolveThemeConsentProofRoute(
    request: Request,
  ): Promise<Response | undefined>;
  contentFetch: import("./runtime.js").ThemeContentFetch;
}

/**
 * Makes the validated theme and its fixture context resolver available through
 * `virtual:voyant-theme`. Fixture data is a development input, never a cloud API.
 */
export function voyantTheme(options: VoyantThemeOptions): AstroIntegration {
  let projectRoot: URL | undefined;
  return {
    name: "@voyant-travel/astro",
    hooks: {
      "astro:config:setup": ({
        addMiddleware,
        command,
        config,
        updateConfig,
        logger,
      }) => {
        projectRoot = config.root;
        // Platform-owned discovery documents must run before theme middleware.
        // A theme may redirect or short-circuit without calling `next()`, and
        // it must not be able to replace or mutate robots/sitemap responses.
        addMiddleware({
          entrypoint: "@voyant-travel/astro/system-middleware",
          order: "pre",
        });
        // Operator code injection belongs to every theme, so it is wired here
        // rather than left for a theme author to remember. `post` so it runs
        // after the theme's own middleware and splices the finished document.
        addMiddleware({
          entrypoint: "@voyant-travel/astro/middleware",
          order: "post",
        });
        const checked = checkThemeDefinition(options.theme);
        if (!checked.ok || !checked.theme) {
          for (const diagnostic of checked.diagnostics)
            logger.error(`${diagnostic.code}: ${diagnostic.message}`);
          throw new Error("The Voyant theme contract is invalid.");
        }

        const serialized = JSON.stringify(checked.theme).replaceAll(
          "<",
          "\\u003c",
        );
        const developmentEnvironment =
          command === "dev"
            ? Object.fromEntries(
                DEVELOPMENT_ENV_NAMES.flatMap((name) => {
                  const value = process.env[name];
                  return value === undefined ? [] : [[name, value]];
                }),
              )
            : {};
        updateConfig({
          vite: {
            ...(command === "dev"
              ? {
                  ssr: {
                    optimizeDeps: { include: [...DEVELOPMENT_SSR_ENTRIES] },
                  },
                }
              : {}),
            plugins: [
              {
                name: "voyant-theme-virtual-module",
                resolveId(id) {
                  return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : undefined;
                },
                load(id, loadOptions) {
                  if (id !== RESOLVED_VIRTUAL_ID) return undefined;
                  const privateEnvironment =
                    loadOptions?.ssr &&
                    Object.keys(developmentEnvironment).length > 0
                      ? JSON.stringify(developmentEnvironment).replaceAll(
                          "<",
                          "\\u003c",
                        )
                      : "undefined";
                  return [
                    'import { createThemeContentFetch, createThemeContextResolver, resolveThemeConsentConfiguration as resolveConsentConfiguration, resolveThemeConsentProofRoute as resolveConsentProofRoute, resolveThemePublicApiRoute as resolvePublicApiRoute } from "@voyant-travel/astro/runtime";',
                    'import { resolvePublicationSystemRoute as resolveSystemRoute } from "@voyant-travel/astro/runtime";',
                    'import { env } from "cloudflare:workers";',
                    `export const theme = ${serialized};`,
                    "export const manifest = theme.manifest;",
                    "const resolveContext = createThemeContextResolver(theme);",
                    `const privateEnvironment = ${privateEnvironment};`,
                    "export const resolveThemeContext = (input) => resolveContext(input, env, privateEnvironment);",
                    "export const resolveThemePublicApiRoute = (request) => resolvePublicApiRoute(request, privateEnvironment);",
                    "export const resolveThemeConsentConfiguration = (request) => resolveConsentConfiguration(request, env);",
                    "export const resolveThemeConsentProofRoute = (request) => resolveConsentProofRoute(request, env);",
                    "export const contentFetch = createThemeContentFetch(env);",
                    "export const resolvePublicationSystemRoute = (request) => resolveSystemRoute(request, env);",
                  ].join("\n");
                },
              },
            ],
          },
        });
      },
      "astro:build:done": async () => {
        if (!projectRoot) {
          throw new Error("The Voyant theme project root was not configured.");
        }
        const metadataDirectory = new URL(".voyant/", projectRoot);
        await mkdir(fileURLToPath(metadataDirectory), { recursive: true });
        await writeFile(
          path.join(fileURLToPath(metadataDirectory), "theme-runtime.json"),
          `${JSON.stringify(CLOUDFLARE_THEME_RUNTIME, null, 2)}\n`,
        );
      },
    },
  };
}

export {
  injectConsentBootstrap,
  parseThemeConsentConfiguration,
  renderConsentBootstrap,
  THEME_CONSENT_PATH,
  type ThemeConsentConfiguration,
} from "./consent.js";
export { CLOUDFLARE_THEME_RUNTIME } from "./deployment.js";
export {
  injectThemeEditorBridge,
  themeEditorBridgeScript,
} from "./editor-bridge.js";
export {
  CONNECTED_CONTEXT_TIMEOUT_MS,
  CONNECTED_PUBLIC_API_PATH,
  createThemeContentFetch,
  createThemeContextResolver,
  MANAGED_CONTENT_ORIGIN,
  PUBLICATION_BINDING_NAMES,
  PUBLICATION_REQUEST_HEADERS,
  PUBLICATION_RESPONSE_HEADERS,
  type PublicationFetcher,
  readPublicationBindings,
  readThemeDevelopmentRuntime,
  resolvePublicationSystemRoute,
  resolveThemeConsentConfiguration,
  resolveThemeConsentProofRoute,
  resolveThemePublicApiRoute,
  THEME_DEVELOPMENT_RUNTIME_ADAPTER_ID,
  THEME_DEVELOPMENT_RUNTIME_ENV_NAMES,
  type ThemeContentFetch,
  type ThemeContextResolver,
  ThemeRuntimeError,
  type ThemeRuntimeErrorCode,
  type VoyantPublicationBindings,
  type VoyantThemeDevelopmentRuntime,
} from "./runtime.js";
