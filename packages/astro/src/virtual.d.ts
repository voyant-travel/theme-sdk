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
  export function resolvePublicationSystemRoute(
    request: Request,
  ): Promise<Response | undefined>;
}
