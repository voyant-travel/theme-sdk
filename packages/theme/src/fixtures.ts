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
    [...theme.fixtures.content, ...theme.fixtures.tourDetail].map((context) => [
      normalizePath(context.path),
      context,
    ]),
  );
  return {
    resolve(input) {
      const path = normalizePath(String(input));
      if (path === "/") return theme.fixtures.home;
      if (path === "/tours" && theme.fixtures.tourIndex) {
        return theme.fixtures.tourIndex;
      }
      return contentByPath.get(path) ?? { ...theme.fixtures.notFound, path };
    },
  };
}
