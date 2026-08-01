import {
  checkThemeDefinition,
  type ParsedThemeDefinition,
  type ThemeDefinition,
} from "@voyant-travel/theme";
import type { AstroIntegration } from "astro";

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
  ): import("@voyant-travel/theme").ThemePageContext;
}

/**
 * Makes the validated theme and its fixture context resolver available through
 * `virtual:voyant-theme`. Fixture data is a development input, never a cloud API.
 */
export function voyantTheme(options: VoyantThemeOptions): AstroIntegration {
  return {
    name: "@voyant-travel/astro",
    hooks: {
      "astro:config:setup": ({ updateConfig, logger }) => {
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
                    `export const theme = ${serialized};`,
                    "export const manifest = theme.manifest;",
                    "export const resolveThemeContext = createThemeContextResolver(theme);",
                  ].join("\n");
                },
              },
            ],
          },
        });
      },
    },
  };
}

export {
  createThemeContextResolver,
  type ThemeContextResolver,
} from "./runtime.js";
