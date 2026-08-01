import { describe, expect, it } from "vitest";
import { checkThemeDefinition } from "../src/index.js";
import { validTheme } from "./helpers.js";

describe("checkThemeDefinition", () => {
  it.each([
    "/stories/[entry]",
    "/stories/[slug]",
    "/stories/[...path]",
  ])("accepts an arbitrary Astro dynamic content route: %s", (pattern) => {
    const theme = validTheme();
    theme.manifest.routes[1] = { id: "entry", pattern, context: "content" };
    expect(checkThemeDefinition(theme).diagnostics).toEqual([]);
  });

  it("requires at least one content route while allowing multiple", () => {
    const withoutContent = validTheme();
    withoutContent.manifest.routes = withoutContent.manifest.routes.filter(
      (route) => route.context !== "content",
    );
    expect(checkThemeDefinition(withoutContent).diagnostics).toEqual([
      expect.objectContaining({
        code: "THEME_ROUTE_REQUIRED",
        message: "At least one content route is required.",
        source: { file: "theme.config.ts", path: ["manifest", "routes"] },
      }),
    ]);

    const withMultipleContentRoutes = validTheme();
    withMultipleContentRoutes.manifest.routes.push({
      id: "guide",
      pattern: "/guides/[guide]",
      context: "content",
    });
    expect(checkThemeDefinition(withMultipleContentRoutes).diagnostics).toEqual(
      [],
    );
  });

  it("returns sorted diagnostics with stable codes and paths", () => {
    const theme = validTheme();
    theme.manifest.routes = [
      { id: "entry", pattern: "/stories/static", context: "content" },
      { id: "entry", pattern: "/stories/static", context: "content" },
    ];
    const result = checkThemeDefinition(theme, "/project/theme.config.ts");
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.map(({ code, path }) => ({ code, path })),
    ).toMatchInlineSnapshot(`
      [
        {
          "code": "THEME_IDENTIFIER_DUPLICATE",
          "path": "$.manifest.routes",
        },
        {
          "code": "THEME_ROUTE_REQUIRED",
          "path": "$.manifest.routes",
        },
        {
          "code": "THEME_ROUTE_REQUIRED",
          "path": "$.manifest.routes",
        },
        {
          "code": "THEME_CONTENT_ROUTE_PARAMETER_MISSING",
          "path": "$.manifest.routes[0].pattern",
        },
        {
          "code": "THEME_CONTENT_ROUTE_PARAMETER_MISSING",
          "path": "$.manifest.routes[1].pattern",
        },
        {
          "code": "THEME_ROUTE_PATTERN_DUPLICATE",
          "path": "$.manifest.routes[1].pattern",
        },
      ]
    `);
  });
});
