import {
  type ParsedThemeDefinition,
  type ThemeDefinition,
  themeDefinitionSchema,
} from "./contract.js";
import {
  compareDiagnostics,
  diagnosticsFromZod,
  type ThemeDiagnostic,
} from "./diagnostics.js";

export interface ThemeValidationResult {
  ok: boolean;
  diagnostics: ThemeDiagnostic[];
  theme?: ParsedThemeDefinition;
}

function duplicateDiagnostics(
  values: string[],
  path: string,
  label: string,
  file: string,
): ThemeDiagnostic[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort().map((value) => ({
    code: "THEME_IDENTIFIER_DUPLICATE",
    message: `${label} identifier '${value}' is declared more than once.`,
    severity: "error",
    path,
    source: {
      file,
      path:
        path === "$.manifest.routes" ? ["manifest", "routes"] : ["manifest"],
    },
  }));
}

function settingDiagnostics(
  settings: ParsedThemeDefinition["manifest"]["settings"],
  path: string,
  file: string,
): ThemeDiagnostic[] {
  const diagnostics: ThemeDiagnostic[] = [];
  settings.forEach((setting, index) => {
    if ("options" in setting) {
      diagnostics.push(
        ...duplicateDiagnostics(
          setting.options.map((option) => option.value),
          `${path}[${index}].options`,
          `Option in setting '${setting.id}'`,
          file,
        ),
      );
      if (
        setting.default !== undefined &&
        !setting.options.some((option) => option.value === setting.default)
      ) {
        diagnostics.push({
          code: "THEME_SETTING_DEFAULT_INVALID",
          message: `Setting '${setting.id}' default is not one of its options.`,
          severity: "error",
          path: `${path}[${index}].default`,
          source: { file, path: ["manifest"] },
        });
      }
    }
    if (
      (setting.type === "number" || setting.type === "range") &&
      setting.min !== undefined &&
      setting.max !== undefined &&
      setting.max < setting.min
    ) {
      diagnostics.push({
        code: "THEME_SETTING_LIMIT_INVALID",
        message: `Setting '${setting.id}' max must be greater than or equal to min.`,
        severity: "error",
        path: `${path}[${index}].max`,
        source: { file, path: ["manifest"] },
      });
    }
    if (
      (setting.type === "number" || setting.type === "range") &&
      setting.default !== undefined &&
      ((setting.min !== undefined && setting.default < setting.min) ||
        (setting.max !== undefined && setting.default > setting.max))
    ) {
      diagnostics.push({
        code: "THEME_SETTING_DEFAULT_INVALID",
        message: `Setting '${setting.id}' default must be within its limits.`,
        severity: "error",
        path: `${path}[${index}].default`,
        source: { file, path: ["manifest"] },
      });
    }
  });
  return diagnostics;
}

function routeSegments(pattern: string): string[] {
  return pattern.split("/").filter(Boolean);
}

function isDynamicSegment(segment: string): boolean {
  return /^\[[A-Za-z][A-Za-z0-9_]*\]$/.test(segment);
}

function isRestSegment(segment: string): boolean {
  return /^\[\.\.\.[A-Za-z][A-Za-z0-9_]*\]$/.test(segment);
}

/** Whether two Astro patterns can resolve the same public path. */
function routePatternsOverlap(left: string, right: string): boolean {
  const a = routeSegments(left);
  const b = routeSegments(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a[index];
    const bPart = b[index];
    if (aPart === undefined || bPart === undefined) {
      const remaining = aPart ?? bPart;
      return remaining !== undefined && isRestSegment(remaining);
    }
    if (isRestSegment(aPart) || isRestSegment(bPart)) return true;
    if (isDynamicSegment(aPart) || isDynamicSegment(bPart)) continue;
    if (aPart !== bPart) return false;
  }
  return true;
}

export function checkThemeDefinition(
  input: unknown,
  sourceFile = "theme.config.ts",
): ThemeValidationResult {
  const parsed = themeDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: diagnosticsFromZod(parsed.error, sourceFile),
    };
  }

  const { manifest } = parsed.data;
  const diagnostics: ThemeDiagnostic[] = [
    ...duplicateDiagnostics(
      manifest.routes.map((route) => route.id),
      "$.manifest.routes",
      "Route",
      sourceFile,
    ),
    ...duplicateDiagnostics(
      manifest.sections.map((section) => section.id),
      "$.manifest.sections",
      "Section",
      sourceFile,
    ),
    ...duplicateDiagnostics(
      manifest.settings.map((field) => field.id),
      "$.manifest.settings",
      "Setting",
      sourceFile,
    ),
    ...duplicateDiagnostics(
      manifest.capabilities.map((capability) => capability.id),
      "$.manifest.capabilities",
      "Capability",
      sourceFile,
    ),
    ...settingDiagnostics(manifest.settings, "$.manifest.settings", sourceFile),
  ];

  for (const kind of ["home", "notFound"] as const) {
    const matches = manifest.routes.filter((route) => route.context === kind);
    if (matches.length !== 1) {
      diagnostics.push({
        code: "THEME_ROUTE_REQUIRED",
        message: `Exactly one ${kind} route is required; found ${matches.length}.`,
        severity: "error",
        path: "$.manifest.routes",
        hint: `Declare one route with context '${kind}'.`,
        source: { file: sourceFile, path: ["manifest", "routes"] },
      });
    }
  }

  if (!manifest.routes.some((route) => route.context === "content")) {
    diagnostics.push({
      code: "THEME_ROUTE_REQUIRED",
      message: "At least one content route is required.",
      severity: "error",
      path: "$.manifest.routes",
      hint: "Declare a route with context 'content'. Multiple content routes are allowed.",
      source: { file: sourceFile, path: ["manifest", "routes"] },
    });
  }

  const patterns = new Map<string, number>();
  const canonicalPatterns: Partial<
    Record<
      ParsedThemeDefinition["manifest"]["routes"][number]["context"],
      string
    >
  > = {
    tourIndex: "/tours",
    tourDetail: "/tours/[slug]",
    cruiseIndex: "/cruises",
    cruiseDetail: "/cruises/[slug]",
    shipDetail: "/ships/[slug]",
    sailingDetail: "/sailings/[slug]",
  };
  manifest.routes.forEach((route, index) => {
    const previous = patterns.get(route.pattern);
    if (previous !== undefined) {
      diagnostics.push({
        code: "THEME_ROUTE_PATTERN_DUPLICATE",
        message: `Route pattern '${route.pattern}' is also used by route ${previous}.`,
        severity: "error",
        path: `$.manifest.routes[${index}].pattern`,
        source: {
          file: sourceFile,
          path: ["manifest", "routes", index, "pattern"],
        },
      });
    } else patterns.set(route.pattern, index);

    const canonicalPattern = canonicalPatterns[route.context];
    if (canonicalPattern && route.pattern !== canonicalPattern) {
      diagnostics.push({
        code: route.context.startsWith("tour")
          ? "THEME_TOUR_ROUTE_NON_CANONICAL"
          : "THEME_CRUISE_ROUTE_NON_CANONICAL",
        message: `${route.context} must use the canonical route '${canonicalPattern}'.`,
        severity: "error",
        path: `$.manifest.routes[${index}].pattern`,
        hint: `Use '${canonicalPattern}' exactly.`,
        source: {
          file: sourceFile,
          path: ["manifest", "routes", index, "pattern"],
        },
      });
    }

    if (
      route.context === "content" &&
      !/\[(?:\.\.\.)?[A-Za-z][A-Za-z0-9_]*\]/.test(route.pattern)
    ) {
      diagnostics.push({
        code: "THEME_CONTENT_ROUTE_PARAMETER_MISSING",
        message: "A content route pattern must contain a dynamic parameter.",
        severity: "error",
        path: `$.manifest.routes[${index}].pattern`,
        hint: "Use any Astro-style parameter, such as /guides/[entry] or /stories/[...path].",
        source: {
          file: sourceFile,
          path: ["manifest", "routes", index, "pattern"],
        },
      });
    }
  });

  const tourRoutes = manifest.routes.filter(
    (route) => route.context === "tourIndex" || route.context === "tourDetail",
  );
  if (tourRoutes.length > 0) {
    for (const kind of ["tourIndex", "tourDetail"] as const) {
      const matches = tourRoutes.filter((route) => route.context === kind);
      if (matches.length !== 1) {
        diagnostics.push({
          code: "THEME_TOUR_ROUTE_REQUIRED",
          message: `Exactly one ${kind} route is required when a tour route is declared; found ${matches.length}.`,
          severity: "error",
          path: "$.manifest.routes",
          source: { file: sourceFile, path: ["manifest", "routes"] },
        });
      }
    }

    for (const [index, route] of manifest.routes.entries()) {
      for (const [, other] of manifest.routes.slice(0, index).entries()) {
        if (
          route.pattern !== other.pattern &&
          routePatternsOverlap(route.pattern, other.pattern) &&
          (route.context === "tourIndex" ||
            route.context === "tourDetail" ||
            other.context === "tourIndex" ||
            other.context === "tourDetail")
        ) {
          diagnostics.push({
            code: "THEME_TOUR_ROUTE_COLLISION",
            message: `Route pattern '${route.pattern}' overlaps tour route '${other.pattern}'.`,
            severity: "error",
            path: `$.manifest.routes[${index}].pattern`,
            hint: "Reserve /tours and /tours/[slug] for their canonical tour contexts.",
            source: {
              file: sourceFile,
              path: ["manifest", "routes", index, "pattern"],
            },
          });
        }
      }
    }
  }

  const cruiseKinds = [
    "cruiseIndex",
    "cruiseDetail",
    "shipDetail",
    "sailingDetail",
  ] as const;
  const cruiseRoutes = manifest.routes.filter((route) =>
    cruiseKinds.includes(route.context as (typeof cruiseKinds)[number]),
  );
  if (cruiseRoutes.length > 0) {
    for (const kind of cruiseKinds) {
      const matches = cruiseRoutes.filter((route) => route.context === kind);
      if (matches.length !== 1) {
        diagnostics.push({
          code: "THEME_CRUISE_ROUTE_REQUIRED",
          message: `Exactly one ${kind} route is required when a cruise route is declared; found ${matches.length}.`,
          severity: "error",
          path: "$.manifest.routes",
          source: { file: sourceFile, path: ["manifest", "routes"] },
        });
      }
    }

    for (const [index, route] of manifest.routes.entries()) {
      for (const other of manifest.routes.slice(0, index)) {
        if (
          route.pattern !== other.pattern &&
          routePatternsOverlap(route.pattern, other.pattern) &&
          (cruiseKinds.includes(
            route.context as (typeof cruiseKinds)[number],
          ) ||
            cruiseKinds.includes(other.context as (typeof cruiseKinds)[number]))
        ) {
          diagnostics.push({
            code: "THEME_CRUISE_ROUTE_COLLISION",
            message: `Route pattern '${route.pattern}' overlaps cruise route '${other.pattern}'.`,
            severity: "error",
            path: `$.manifest.routes[${index}].pattern`,
            hint: "Reserve /cruises, /cruises/[slug], /ships/[slug], and /sailings/[slug] for their canonical cruise contexts.",
            source: {
              file: sourceFile,
              path: ["manifest", "routes", index, "pattern"],
            },
          });
        }
      }
    }
  }

  for (const [sectionIndex, section] of manifest.sections.entries()) {
    diagnostics.push(
      ...duplicateDiagnostics(
        section.settings.map((field) => field.id),
        `$.manifest.sections[${sectionIndex}].settings`,
        `Setting in section '${section.id}'`,
        sourceFile,
      ),
      ...settingDiagnostics(
        section.settings,
        `$.manifest.sections[${sectionIndex}].settings`,
        sourceFile,
      ),
      ...duplicateDiagnostics(
        section.blocks.map((block) => block.type),
        `$.manifest.sections[${sectionIndex}].blocks`,
        `Block type in section '${section.id}'`,
        sourceFile,
      ),
      ...duplicateDiagnostics(
        section.templates,
        `$.manifest.sections[${sectionIndex}].templates`,
        `Template in section '${section.id}'`,
        sourceFile,
      ),
    );

    const routeIds = new Set(manifest.routes.map((route) => route.id));
    for (const [templateIndex, template] of section.templates.entries()) {
      if (!routeIds.has(template)) {
        diagnostics.push({
          code: "THEME_SECTION_TEMPLATE_UNKNOWN",
          message: `Section '${section.id}' allows unknown template '${template}'.`,
          severity: "error",
          path: `$.manifest.sections[${sectionIndex}].templates[${templateIndex}]`,
          hint: "Use the id of a route declared in manifest.routes.",
          source: { file: sourceFile, path: ["manifest", "sections"] },
        });
      }
    }

    for (const [blockIndex, block] of section.blocks.entries()) {
      diagnostics.push(
        ...duplicateDiagnostics(
          block.settings.map((field) => field.id),
          `$.manifest.sections[${sectionIndex}].blocks[${blockIndex}].settings`,
          `Setting in block '${block.type}'`,
          sourceFile,
        ),
        ...settingDiagnostics(
          block.settings,
          `$.manifest.sections[${sectionIndex}].blocks[${blockIndex}].settings`,
          sourceFile,
        ),
      );
      if (
        section.max_blocks !== undefined &&
        block.limit !== undefined &&
        block.limit > section.max_blocks
      ) {
        diagnostics.push({
          code: "THEME_SECTION_BLOCK_LIMIT_INVALID",
          message: `Block '${block.type}' limit ${block.limit} exceeds section '${section.id}' max_blocks ${section.max_blocks}.`,
          severity: "error",
          path: `$.manifest.sections[${sectionIndex}].blocks[${blockIndex}].limit`,
          source: { file: sourceFile, path: ["manifest", "sections"] },
        });
      }
    }

    const blockByType = new Map(
      section.blocks.map((block) => [block.type, block]),
    );
    const settingIds = new Set(section.settings.map((setting) => setting.id));
    for (const [presetIndex, preset] of section.presets.entries()) {
      for (const key of Object.keys(preset.settings)) {
        if (!settingIds.has(key)) {
          diagnostics.push({
            code: "THEME_SECTION_PRESET_SETTING_UNKNOWN",
            message: `Preset '${preset.name}' supplies unknown section setting '${key}'.`,
            severity: "error",
            path: `$.manifest.sections[${sectionIndex}].presets[${presetIndex}].settings`,
            source: { file: sourceFile, path: ["manifest", "sections"] },
          });
        }
      }
      if (
        section.max_blocks !== undefined &&
        preset.blocks.length > section.max_blocks
      ) {
        diagnostics.push({
          code: "THEME_SECTION_PRESET_BLOCK_LIMIT_INVALID",
          message: `Preset '${preset.name}' has ${preset.blocks.length} blocks but section '${section.id}' allows ${section.max_blocks}.`,
          severity: "error",
          path: `$.manifest.sections[${sectionIndex}].presets[${presetIndex}].blocks`,
          source: { file: sourceFile, path: ["manifest", "sections"] },
        });
      }
      const counts = new Map<string, number>();
      for (const [presetBlockIndex, presetBlock] of preset.blocks.entries()) {
        const block = blockByType.get(presetBlock.type);
        if (!block) {
          diagnostics.push({
            code: "THEME_SECTION_PRESET_BLOCK_UNKNOWN",
            message: `Preset '${preset.name}' uses unknown block type '${presetBlock.type}'.`,
            severity: "error",
            path: `$.manifest.sections[${sectionIndex}].presets[${presetIndex}].blocks[${presetBlockIndex}].type`,
            source: { file: sourceFile, path: ["manifest", "sections"] },
          });
          continue;
        }
        const count = (counts.get(block.type) ?? 0) + 1;
        counts.set(block.type, count);
        if (block.limit !== undefined && count > block.limit) {
          diagnostics.push({
            code: "THEME_SECTION_PRESET_BLOCK_LIMIT_INVALID",
            message: `Preset '${preset.name}' exceeds block '${block.type}' limit ${block.limit}.`,
            severity: "error",
            path: `$.manifest.sections[${sectionIndex}].presets[${presetIndex}].blocks`,
            source: { file: sourceFile, path: ["manifest", "sections"] },
          });
        }
        const blockSettingIds = new Set(
          block.settings.map((setting) => setting.id),
        );
        for (const key of Object.keys(presetBlock.settings)) {
          if (!blockSettingIds.has(key)) {
            diagnostics.push({
              code: "THEME_SECTION_PRESET_SETTING_UNKNOWN",
              message: `Preset '${preset.name}' supplies unknown '${block.type}' setting '${key}'.`,
              severity: "error",
              path: `$.manifest.sections[${sectionIndex}].presets[${presetIndex}].blocks[${presetBlockIndex}].settings`,
              source: { file: sourceFile, path: ["manifest", "sections"] },
            });
          }
        }
      }
    }
  }

  diagnostics.sort(compareDiagnostics);
  return {
    ok: diagnostics.every((item) => item.severity !== "error"),
    diagnostics,
    theme: parsed.data,
  };
}

/** @deprecated Prefer checkThemeDefinition; retained as an intuitive programmatic alias. */
export function validateThemeDefinition(
  theme: ThemeDefinition,
  sourceFile?: string,
): ThemeValidationResult {
  return checkThemeDefinition(theme, sourceFile);
}
