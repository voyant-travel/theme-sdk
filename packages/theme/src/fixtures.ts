import type { ParsedThemeDefinition, ThemePageContext } from "./contract.js";

function normalizePath(input: string): string {
  const pathname = new URL(input, "https://theme.local").pathname;
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

export interface FixtureRouter {
  resolve(input: string | URL): ThemePageContext;
}

export function createFixtureRouter(
  theme: ParsedThemeDefinition,
): FixtureRouter {
  const contentByPath = new Map(
    theme.fixtures.content.map((context) => [
      normalizePath(context.path),
      context,
    ]),
  );
  return {
    resolve(input) {
      const path = normalizePath(String(input));
      if (path === "/") return theme.fixtures.home;
      return contentByPath.get(path) ?? { ...theme.fixtures.notFound, path };
    },
  };
}
