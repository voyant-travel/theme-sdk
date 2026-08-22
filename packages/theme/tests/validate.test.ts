import { describe, expect, it } from "vitest";
import {
  checkThemeDefinition,
  localeSchema,
  THEME_CAPABILITY_IDS,
  themeManifestSchema,
} from "../src/index.js";
import { validTheme } from "./helpers.js";

describe("checkThemeDefinition", () => {
  it("requires canonical BCP-47 locale tags", () => {
    expect(localeSchema.safeParse("en").success).toBe(true);
    expect(localeSchema.safeParse("en-US").success).toBe(true);
    expect(localeSchema.safeParse("zh-Hant-TW").success).toBe(true);
    expect(localeSchema.safeParse("en_us").success).toBe(false);
    expect(localeSchema.safeParse("en-us").success).toBe(false);
    expect(localeSchema.safeParse("not a locale").success).toBe(false);
  });

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
          "code": "THEME_ROUTE_PATTERN_DUPLICATE",
          "path": "$.manifest.routes[1].pattern",
        },
      ]
    `);
  });

  it("validates section, block, preset and template identifiers and limits", () => {
    const theme = validTheme();
    theme.manifest.sections = [
      {
        id: "hero",
        name: "Hero",
        settings: [
          { id: "heading", label: "Heading", type: "inline_richtext" },
          { id: "heading", label: "Heading again", type: "text" },
        ],
        blocks: [
          {
            type: "button",
            name: "Button",
            limit: 2,
            settings: [
              { id: "label", label: "Label", type: "text" },
              { id: "label", label: "Label again", type: "textarea" },
            ],
          },
          { type: "button", name: "Duplicate", settings: [] },
        ],
        max_blocks: 1,
        presets: [
          {
            name: "Invalid",
            settings: { missing: "value" },
            blocks: [
              { type: "button", settings: { missing: "value" } },
              { type: "unknown", settings: {} },
            ],
          },
        ],
        templates: ["missing", "missing"],
      },
    ];

    const codes = checkThemeDefinition(theme).diagnostics.map(
      (diagnostic) => diagnostic.code,
    );
    expect(codes).toContain("THEME_IDENTIFIER_DUPLICATE");
    expect(codes).toContain("THEME_SECTION_TEMPLATE_UNKNOWN");
    expect(codes).toContain("THEME_SECTION_BLOCK_LIMIT_INVALID");
    expect(codes).toContain("THEME_SECTION_PRESET_BLOCK_LIMIT_INVALID");
    expect(codes).toContain("THEME_SECTION_PRESET_BLOCK_UNKNOWN");
    expect(codes).toContain("THEME_SECTION_PRESET_SETTING_UNKNOWN");
  });

  it("declares alternate templates by compatible context with globally unique ids", () => {
    const theme = validTheme();
    theme.manifest.templates = [
      { id: "story-feature", name: "Feature story", context: "content" },
    ];
    theme.manifest.sections = [
      {
        id: "feature-hero",
        name: "Feature hero",
        templates: ["story-feature"],
      },
    ];
    expect(checkThemeDefinition(theme).diagnostics).toEqual([]);

    theme.manifest.templates.push({
      id: "home",
      name: "Duplicate home",
      context: "home",
    });
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "THEME_IDENTIFIER_DUPLICATE",
        path: "$.manifest.templates[1].id",
      }),
    );
  });

  it("accepts every editor input and resource picker type", () => {
    const theme = validTheme();
    theme.manifest.sections = [
      {
        id: "inputs",
        name: "Inputs",
        settings: [
          ...["text", "textarea", "richtext", "inline_richtext", "html"].map(
            (type, index) => ({ id: `text-${index}`, label: type, type }),
          ),
          { id: "checkbox", label: "Checkbox", type: "checkbox" },
          ...["radio", "select", "text_alignment"].map((type, index) => ({
            id: `choice-${index}`,
            label: type,
            type,
            options: [{ value: "left", label: "Left" }],
          })),
          { id: "number", label: "Number", type: "number" },
          {
            id: "range",
            label: "Range",
            type: "range",
            min: 0,
            max: 10,
            step: 1,
          },
          ...[
            "color",
            "color_scheme",
            "font_picker",
            "image_picker",
            "video",
            "tour",
            "departure",
            "supplier",
            "media",
            "page",
          ].map((type, index) => ({
            id: `picker-${index}`,
            label: type,
            type,
          })),
          {
            id: "video-url",
            label: "Video URL",
            type: "video_url",
            accept: ["youtube"],
          },
          {
            id: "entry",
            label: "Entry",
            type: "content_entry",
            content_type: "guides",
          },
        ],
      },
    ] as typeof theme.manifest.sections;
    expect(checkThemeDefinition(theme).ok).toBe(true);
  });

  it("accepts every stable capability id and defaults declarations to required", () => {
    const manifest = themeManifestSchema.parse({
      id: "selling-theme",
      name: "Selling theme",
      version: "1.0.0",
      routes: [{ id: "home", pattern: "/", context: "home" }],
      capabilities: THEME_CAPABILITY_IDS.map((id) => ({ id })),
    });

    expect(manifest.capabilities).toEqual(
      THEME_CAPABILITY_IDS.map((id) => ({ id, required: true })),
    );
  });

  it("keeps capability authoring strict", () => {
    const base = {
      id: "selling-theme",
      name: "Selling theme",
      version: "1.0.0",
      routes: [{ id: "home", pattern: "/", context: "home" }],
    };
    expect(
      themeManifestSchema.safeParse({
        ...base,
        capabilities: [{ id: "catalog.unknown.v1" }],
      }).success,
    ).toBe(false);
    expect(
      themeManifestSchema.safeParse({
        ...base,
        capabilities: [
          { id: "catalog.search.v1", endpoint: "https://example.test" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate capability declarations", () => {
    const theme = validTheme();
    theme.manifest.capabilities = [
      { id: "catalog.search.v1" },
      { id: "catalog.search.v1", required: false },
    ];
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "THEME_IDENTIFIER_DUPLICATE",
        path: "$.manifest.capabilities",
      }),
    );
  });

  it("accepts the paired canonical tour routes", () => {
    const theme = validTheme();
    theme.manifest.routes.push(
      { id: "tours", pattern: "/tours", context: "tourIndex" },
      {
        id: "tour-detail",
        pattern: "/tours/[slug]",
        context: "tourDetail",
      },
    );
    expect(checkThemeDefinition(theme).diagnostics).toEqual([]);
  });

  it.each([
    {
      route: { id: "tours", pattern: "/trips", context: "tourIndex" },
      code: "THEME_TOUR_ROUTE_NON_CANONICAL",
    },
    {
      route: {
        id: "tour-detail",
        pattern: "/tours/[tour]",
        context: "tourDetail",
      },
      code: "THEME_TOUR_DETAIL_ROUTE_PARAMETERS_INVALID",
    },
  ] as const)("rejects an invalid $route.context route", ({ route, code }) => {
    const theme = validTheme();
    theme.manifest.routes.push(route);
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({ code }),
    );
  });

  it("accepts a category-qualified tour detail route", () => {
    const theme = validTheme();
    theme.manifest.routes.push(
      { id: "tours", pattern: "/tours", context: "tourIndex" },
      {
        id: "tour-detail",
        pattern: "/[category]/[slug]",
        context: "tourDetail",
      },
    );
    expect(checkThemeDefinition(theme).diagnostics).toEqual([]);
  });

  it.each([
    "/[slug]/[slug]",
    "/[category]/[other]/[slug]",
    "/tours",
  ])("rejects an unresolved tour detail pattern %s", (pattern) => {
    const theme = validTheme();
    theme.manifest.routes.push(
      { id: "tours", pattern: "/tours", context: "tourIndex" },
      { id: "tour-detail", pattern, context: "tourDetail" },
    );
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "THEME_TOUR_DETAIL_ROUTE_PARAMETERS_INVALID",
      }),
    );
  });

  it("requires tour index and detail routes as a pair", () => {
    const theme = validTheme();
    theme.manifest.routes.push({
      id: "tours",
      pattern: "/tours",
      context: "tourIndex",
    });
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "THEME_TOUR_ROUTE_REQUIRED",
        message: expect.stringContaining("tourDetail"),
      }),
    );
  });

  it("rejects a route ambiguous with the canonical tour routes", () => {
    const theme = validTheme();
    theme.manifest.routes.push(
      { id: "tours", pattern: "/tours", context: "tourIndex" },
      {
        id: "tour-detail",
        pattern: "/tours/[slug]",
        context: "tourDetail",
      },
      // Same shape as /tours/[slug]: two parameters in the same position, so
      // nothing distinguishes them and a request really could match either.
      { id: "collision", pattern: "/tours/[id]", context: "content" },
    );
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({ code: "THEME_TOUR_ROUTE_COLLISION" }),
    );
  });

  it.each([
    ["a root catch-all", "/[...path]"],
    ["a root parameter an operator's namespace needs", "/[category]"],
    ["a deeper catch-all under the tour namespace", "/tours/[...rest]"],
  ])("admits %s beside the canonical tour routes", (_label, pattern) => {
    const theme = validTheme();
    theme.manifest.routes.push(
      { id: "tours", pattern: "/tours", context: "tourIndex" },
      { id: "tour-detail", pattern: "/tours/[slug]", context: "tourDetail" },
      { id: "sibling", pattern, context: "content" },
    );
    const result = checkThemeDefinition(theme);
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "THEME_TOUR_ROUTE_COLLISION",
      ),
    ).toEqual([]);
  });

  it("admits a static top-level content route", () => {
    const theme = validTheme();
    theme.manifest.routes.push({
      id: "about",
      pattern: "/despre-noi",
      context: "content",
    });
    const result = checkThemeDefinition(theme);
    expect(result.ok).toBe(true);
  });

  it("requires a category route to be able to address more than one category", () => {
    const theme = validTheme();
    theme.manifest.routes.push({
      id: "category",
      pattern: "/pelerinaje",
      context: "categoryDetail",
    });
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "THEME_CATEGORY_ROUTE_PARAMETER_MISSING",
      }),
    );
  });

  it("admits a root-level category route beside the canonical tour routes", () => {
    const theme = validTheme();
    theme.manifest.routes.push(
      { id: "tours", pattern: "/tours", context: "tourIndex" },
      { id: "tour-detail", pattern: "/tours/[slug]", context: "tourDetail" },
      { id: "category", pattern: "/[category]", context: "categoryDetail" },
      { id: "about", pattern: "/despre-noi", context: "content" },
    );
    expect(checkThemeDefinition(theme).ok).toBe(true);
  });

  function addCruiseRoutes(theme: ReturnType<typeof validTheme>) {
    theme.manifest.routes.push(
      { id: "cruises", pattern: "/cruises", context: "cruiseIndex" },
      {
        id: "cruise-detail",
        pattern: "/cruises/[slug]",
        context: "cruiseDetail",
      },
      { id: "ship-detail", pattern: "/ships/[slug]", context: "shipDetail" },
      {
        id: "sailing-detail",
        pattern: "/sailings/[slug]",
        context: "sailingDetail",
      },
    );
  }

  it("accepts the complete canonical cruise route set", () => {
    const theme = validTheme();
    addCruiseRoutes(theme);
    expect(checkThemeDefinition(theme).diagnostics).toEqual([]);
  });

  it("requires every cruise resource route when any one is declared", () => {
    const theme = validTheme();
    theme.manifest.routes.push({
      id: "cruises",
      pattern: "/cruises",
      context: "cruiseIndex",
    });
    const diagnostics = checkThemeDefinition(theme).diagnostics;
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "THEME_CRUISE_ROUTE_REQUIRED",
          message: expect.stringContaining("cruiseDetail"),
        }),
        expect.objectContaining({
          code: "THEME_CRUISE_ROUTE_REQUIRED",
          message: expect.stringContaining("shipDetail"),
        }),
        expect.objectContaining({
          code: "THEME_CRUISE_ROUTE_REQUIRED",
          message: expect.stringContaining("sailingDetail"),
        }),
      ]),
    );
  });

  it("rejects non-canonical cruise resource routes", () => {
    const theme = validTheme();
    addCruiseRoutes(theme);
    const detail = theme.manifest.routes.find(
      (route) => route.context === "shipDetail",
    );
    if (detail) detail.pattern = "/vessels/[slug]";
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({ code: "THEME_CRUISE_ROUTE_NON_CANONICAL" }),
    );
  });

  it.each([
    "/cruises/[id]",
    "/ships/[other]",
  ])("rejects content routes ambiguous with canonical cruise paths: %s", (pattern) => {
    const theme = validTheme();
    addCruiseRoutes(theme);
    theme.manifest.routes.push({
      id: "collision",
      pattern,
      context: "content",
    });
    expect(checkThemeDefinition(theme).diagnostics).toContainEqual(
      expect.objectContaining({ code: "THEME_CRUISE_ROUTE_COLLISION" }),
    );
  });
});
