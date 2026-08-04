import { z } from "zod";

/** The version a theme built against this release declares and requests. */
export const CONTRACT_VERSION = "v1alpha2" as const;

/**
 * Envelope versions this release can read, newest last.
 *
 * A publication and a theme release are separately versioned artifacts with
 * independent lifecycles — an operator publishes content far more often than
 * they redeploy a theme — so a reader pinned to a single literal forces both to
 * move in the same instant, and the storefront is down in between whichever
 * order you pick. A theme therefore declares `CONTRACT_VERSION` when it asks
 * and accepts any of these when it reads.
 *
 * This covers only the direction the SDK controls: a newer theme reading an
 * older publication. A theme already deployed on an older SDK cannot be taught
 * anything after the fact, so the platform must materialize each publication at
 * the contract version of the release it is bound to rather than at whatever
 * version the materializer was last shipped with.
 */
export const READABLE_CONTRACT_VERSIONS = [
  "v1alpha1",
  CONTRACT_VERSION,
] as const;

/*
 * Context value objects are open; authoring objects are closed.
 *
 * Voyant owns the published context and grows it as the product grows, while a
 * theme is an immutable release that may have been built months earlier. A
 * closed context therefore makes every additive platform field a breaking
 * change: the deployed theme rejects the whole response and the page fails. So
 * anything Voyant emits parses permissively and keeps unknown keys, and a theme
 * that ignores them still renders. Everything the theme author writes —
 * manifest, routes, fields, tooling — stays strict, because there a stray key
 * is a typo worth failing on.
 *
 * The envelope in `themeContextResponseSchema` is strict in shape for the same
 * reason: it is the protocol frame, and a reader that changes it must be
 * rejected rather than half-understood. Its version is the one field that
 * admits a set, so that a release and a publication can cross over.
 */

export const localeSchema = z
  .string()
  .min(2)
  .refine(
    (value) => {
      try {
        const canonical = Intl.getCanonicalLocales(value);
        return canonical.length === 1 && canonical[0] === value;
      } catch {
        return false;
      }
    },
    { message: "Use a canonical BCP-47 locale tag." },
  );

const identifier = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens.");

export const imageSchema = z.looseObject({
  src: z.string().min(1),
  alt: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const linkSchema = z.looseObject({
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

export const siteSchema = z.looseObject({
  name: z.string().min(1),
  logo: imageSchema.optional(),
});

const navigationSchema = z.array(linkSchema);

export interface ThemeMenuItem {
  label: string;
  href: string;
  items?: ThemeMenuItem[];
  [key: string]: unknown;
}

export const menuItemSchema: z.ZodType<ThemeMenuItem> = z.looseObject({
  label: z.string().min(1),
  href: z.string().min(1),
  get items() {
    return z.array(menuItemSchema).optional();
  },
});

/**
 * Menus are keyed by operator-chosen name — `primary` and `footer` are the
 * conventional ones — so a new menu is content, not a contract change. The key
 * space is deliberately unconstrained here; Voyant bounds menu count, item
 * count, and nesting depth at publication time.
 */
export const menusSchema = z.record(z.string().min(1), z.array(menuItemSchema));

export const seoSchema = z.looseObject({
  title: z.string().min(1),
  description: z.string().optional(),
  noIndex: z.boolean().default(false),
});

export const openGraphSchema = z.looseObject({
  title: z.string().optional(),
  description: z.string().optional(),
  image: imageSchema.optional(),
});

/**
 * Operator-supplied markup, verbatim. Voyant sanitizes and bounds it before it
 * reaches a context; a theme's only job is to place each slot in the document
 * where it belongs. Themes must not re-sanitize or re-encode it — escaping this
 * is the same bug as trusting it, and both silently break analytics and consent
 * tags operators depend on.
 */
export const codeInjectionSchema = z.looseObject({
  head: z.string().optional(),
  bodyStart: z.string().optional(),
  bodyEnd: z.string().optional(),
});

const contextBase = {
  locale: localeSchema,
  site: siteSchema,
  /** The primary menu flattened to one level, for themes that need no nesting. */
  navigation: navigationSchema.default([]),
  menus: menusSchema.default({}),
  seo: seoSchema,
  openGraph: openGraphSchema.optional(),
  codeInjection: codeInjectionSchema.optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
};

export const homeContextSchema = z.looseObject({
  ...contextBase,
  kind: z.literal("home"),
  path: z.literal("/"),
  title: z.string().min(1),
  sections: z
    .array(
      z.looseObject({
        type: identifier,
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .default([]),
});

export const contentContextSchema = z.looseObject({
  ...contextBase,
  kind: z.literal("content"),
  path: z.string().startsWith("/"),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string(),
});

export const notFoundContextSchema = z.looseObject({
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

/**
 * Wire response returned by the Voyant publication reader to a theme Worker.
 * Strict in shape on purpose: the frame is the version negotiation itself.
 *
 * Run `upgradeThemeContextResponse` over the raw body first. An older envelope
 * is readable but not yet shaped like this one.
 */
export const themeContextResponseSchema = z.strictObject({
  contractVersion: z.enum(READABLE_CONTRACT_VERSIONS),
  context: themePageContextSchema,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Brings an older envelope up to the current context shape.
 *
 * v1alpha1 had no `seo` object; a page's document title travelled as
 * `context.title` and everything else it carried is already valid at v1alpha2.
 * The fill is conditioned on the envelope version rather than on `seo` merely
 * being absent, because at v1alpha2 a context without `seo` is a platform bug
 * and still has to fail closed. Delete this when v1alpha1 is retired.
 */
export function upgradeThemeContextResponse(value: unknown): unknown {
  if (!isRecord(value) || value.contractVersion !== "v1alpha1") return value;
  const context = value.context;
  if (!isRecord(context) || "seo" in context) return value;
  if (typeof context.title !== "string") return value;
  // The version is left as it arrived. Callers that log or meter publications
  // should be able to see that a release read an older one.
  return { ...value, context: { ...context, seo: { title: context.title } } };
}

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

export type ThemeImage = z.infer<typeof imageSchema>;
export type ThemeLink = z.infer<typeof linkSchema>;
export type ThemeSite = z.infer<typeof siteSchema>;
export type ThemeMenus = z.infer<typeof menusSchema>;
export type ThemeSeo = z.infer<typeof seoSchema>;
export type ThemeOpenGraph = z.infer<typeof openGraphSchema>;
export type ThemeCodeInjection = z.infer<typeof codeInjectionSchema>;
export type ThemeField = z.infer<typeof themeFieldSchema>;
export type ThemeSection = z.infer<typeof themeSectionSchema>;
export type ThemeRoute = z.infer<typeof themeRouteSchema>;
export type ThemeManifest = z.infer<typeof themeManifestSchema>;
export type HomeContext = z.infer<typeof homeContextSchema>;
export type ContentContext = z.infer<typeof contentContextSchema>;
export type NotFoundContext = z.infer<typeof notFoundContextSchema>;
export type ThemePageContext = z.infer<typeof themePageContextSchema>;
export type ThemeContextResponse = z.infer<typeof themeContextResponseSchema>;
export type ThemeDefinition = z.input<typeof themeDefinitionSchema>;
export type ParsedThemeDefinition = z.output<typeof themeDefinitionSchema>;

/** Provides contextual typing without hiding validation failures at tooling time. */
export function defineTheme<const T extends ThemeDefinition>(theme: T): T {
  return theme;
}
