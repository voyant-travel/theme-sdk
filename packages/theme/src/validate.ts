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

export function checkThemeDefinition(
  input: unknown,
  sourceFile = "voyant.theme.ts",
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

  const patterns = new Map<string, number>();
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

  for (const [sectionIndex, section] of manifest.sections.entries()) {
    diagnostics.push(
      ...duplicateDiagnostics(
        section.fields.map((field) => field.id),
        `$.manifest.sections[${sectionIndex}].fields`,
        `Field in section '${section.id}'`,
        sourceFile,
      ),
    );
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
