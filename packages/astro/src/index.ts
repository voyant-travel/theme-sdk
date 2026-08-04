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
        config,
        updateConfig,
        logger,
      }) => {
        projectRoot = config.root;
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
        updateConfig({
          vite: {
            plugins: [
              {
                name: "voyant-theme-virtual-module",
                resolveId(id) {
                  return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : undefined;
                },
                load(id) {
                  if (id !== RESOLVED_VIRTUAL_ID) return undefined;
                  return [
                    'import { createThemeContextResolver } from "@voyant-travel/astro/runtime";',
                    'import { env } from "cloudflare:workers";',
                    `export const theme = ${serialized};`,
                    "export const manifest = theme.manifest;",
                    "const resolveContext = createThemeContextResolver(theme);",
                    "export const resolveThemeContext = (input) => resolveContext(input, env);",
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

export { CLOUDFLARE_THEME_RUNTIME } from "./deployment.js";

export {
  createThemeContextResolver,
  PUBLICATION_BINDING_NAMES,
  PUBLICATION_REQUEST_HEADERS,
  PUBLICATION_RESPONSE_HEADERS,
  type PublicationFetcher,
  readPublicationBindings,
  type ThemeContextResolver,
  ThemeRuntimeError,
  type ThemeRuntimeErrorCode,
  type VoyantPublicationBindings,
} from "./runtime.js";
