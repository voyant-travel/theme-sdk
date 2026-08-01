import { z } from "zod";

export const CONTRACT_VERSION = "v1alpha1" as const;

const identifier = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens.");

export const imageSchema = z.strictObject({
  src: z.string().min(1),
  alt: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const linkSchema = z.strictObject({
  label: z.string().min(1),
  href: z.string().min(1),
});

export const themeFieldSchema = z.discriminatedUnion("type", [
  z.strictObject({
    id: identifier,
    label: z.string().min(1),
    type: z.literal("text"),
    required: z.boolean().optional(),
    default: z.string().optional(),
  }),
  z.strictObject({
    id: identifier,
    label: z.string().min(1),
    type: z.literal("number"),
    required: z.boolean().optional(),
    default: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.strictObject({
    id: identifier,
    label: z.string().min(1),
    type: z.literal("boolean"),
    default: z.boolean().optional(),
  }),
  z.strictObject({
    id: identifier,
    label: z.string().min(1),
    type: z.literal("select"),
    required: z.boolean().optional(),
    default: z.string().optional(),
    options: z
      .array(
        z.strictObject({ label: z.string().min(1), value: z.string().min(1) }),
      )
      .min(1),
  }),
  z.strictObject({
    id: identifier,
    label: z.string().min(1),
    type: z.literal("image"),
    required: z.boolean().optional(),
  }),
]);

export const themeSectionSchema = z.strictObject({
  id: identifier,
  name: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(themeFieldSchema),
});

export const themeContextKindSchema = z.enum(["home", "content", "notFound"]);

export const themeRouteSchema = z.strictObject({
  id: identifier,
  pattern: z.string().startsWith("/"),
  context: themeContextKindSchema,
});

export const themeManifestSchema = z.strictObject({
  id: identifier,
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Use a semantic version."),
  description: z.string().optional(),
  routes: z.array(themeRouteSchema).min(1),
  settings: z.array(themeFieldSchema).default([]),
  sections: z.array(themeSectionSchema).default([]),
});

const siteSchema = z.strictObject({
  name: z.string().min(1),
  logo: imageSchema.optional(),
});

const navigationSchema = z.array(linkSchema);

const contextBase = {
  locale: z.string().min(2),
  site: siteSchema,
  navigation: navigationSchema.default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
};

export const homeContextSchema = z.strictObject({
  ...contextBase,
  kind: z.literal("home"),
  path: z.literal("/"),
  title: z.string().min(1),
  sections: z
    .array(
      z.strictObject({
        type: identifier,
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .default([]),
});

export const contentContextSchema = z.strictObject({
  ...contextBase,
  kind: z.literal("content"),
  path: z.string().startsWith("/"),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string(),
});

export const notFoundContextSchema = z.strictObject({
  ...contextBase,
  kind: z.literal("notFound"),
  path: z.string().startsWith("/"),
  title: z.string().min(1),
  message: z.string().optional(),
});

export const themePageContextSchema = z.discriminatedUnion("kind", [
  homeContextSchema,
  contentContextSchema,
  notFoundContextSchema,
]);

export const themeFixturesSchema = z.strictObject({
  home: homeContextSchema,
  content: z.array(contentContextSchema).default([]),
  notFound: notFoundContextSchema,
});

export const themeDefinitionSchema = z.strictObject({
  contractVersion: z.literal(CONTRACT_VERSION),
  manifest: themeManifestSchema,
  fixtures: themeFixturesSchema,
  tooling: z
    .strictObject({
      build: z.array(z.string().min(1)).min(1).optional(),
      dev: z.array(z.string().min(1)).min(1).optional(),
      outputDirectory: z.string().min(1).optional(),
    })
    .optional(),
});

export type ThemeField = z.infer<typeof themeFieldSchema>;
export type ThemeSection = z.infer<typeof themeSectionSchema>;
export type ThemeRoute = z.infer<typeof themeRouteSchema>;
export type ThemeManifest = z.infer<typeof themeManifestSchema>;
export type HomeContext = z.infer<typeof homeContextSchema>;
export type ContentContext = z.infer<typeof contentContextSchema>;
export type NotFoundContext = z.infer<typeof notFoundContextSchema>;
export type ThemePageContext = z.infer<typeof themePageContextSchema>;
export type ThemeDefinition = z.input<typeof themeDefinitionSchema>;
export type ParsedThemeDefinition = z.output<typeof themeDefinitionSchema>;

/** Provides contextual typing without hiding validation failures at tooling time. */
export function defineTheme<const T extends ThemeDefinition>(theme: T): T {
  return theme;
}
