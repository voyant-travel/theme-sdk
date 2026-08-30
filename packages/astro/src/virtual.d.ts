declare module "virtual:voyant-theme" {
  import type {
    ParsedThemeDefinition,
    ThemePageContext,
  } from "@voyant-travel/theme";
  export const theme: ParsedThemeDefinition;
  export const manifest: ParsedThemeDefinition["manifest"];
  export function resolveThemeContext(
    input: string | URL,
  ): Promise<ThemePageContext>;
  export function resolveThemePublicApiRoute(
    request: Request,
  ): Promise<Response | undefined>;
  export function resolveThemeConsentConfiguration(
    request: Request,
  ): Promise<import("./consent.js").ThemeConsentConfiguration | null>;
  export function resolveThemeConsentProofRoute(
    request: Request,
  ): Promise<Response | undefined>;
  export function resolvePublicationSystemRoute(
    request: Request,
  ): Promise<Response | undefined>;
  export const contentFetch: typeof globalThis.fetch;
}
