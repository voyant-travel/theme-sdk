import {
  checkThemeDefinition,
  createFixtureRouter,
  type ParsedThemeDefinition,
  type ThemeDefinition,
  type ThemePageContext,
} from "@voyant-travel/theme";

export type ThemeContextResolver = (input: string | URL) => ThemePageContext;

export function createThemeContextResolver(
  theme: ThemeDefinition | ParsedThemeDefinition,
): ThemeContextResolver {
  const checked = checkThemeDefinition(theme);
  if (!checked.ok || !checked.theme) {
    const summary = checked.diagnostics
      .map((item) => `${item.code}: ${item.message}`)
      .join("\n");
    throw new Error(`Invalid Voyant theme:\n${summary}`);
  }
  const router = createFixtureRouter(checked.theme);
  return (input) => router.resolve(input);
}
