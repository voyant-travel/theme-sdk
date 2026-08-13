import { z } from "zod";

/** The version a theme built against this release declares and requests. */
export const CONTRACT_VERSION = "v1" as const;

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
  "v1alpha2",
  "v1alpha3",
  "v1alpha4",
  "v1alpha5",
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

function settingBase<const T extends string>(type: T) {
  return {
    id: identifier,
    label: z.string().min(1),
    info: z.string().min(1).optional(),
    required: z.boolean().optional(),
    type: z.literal(type),
  };
}
const stringDefault = z.string().optional();
const settingOptionSchema = z.strictObject({
  value: z.string().min(1),
  label: z.string().min(1),
});
const choiceSettingFields = {
  options: z.array(settingOptionSchema).min(1).max(50),
  default: stringDefault,
};
const colorDefault = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use #rgb or #rrggbb.")
  .optional();

function textSetting<const T extends string>(type: T) {
  return z.strictObject({
    ...settingBase(type),
    placeholder: z.string().optional(),
    default: stringDefault,
  });
}

function choiceSetting<const T extends string>(type: T) {
  return z.strictObject({
    ...settingBase(type),
    ...choiceSettingFields,
  });
}

function pickerSetting<const T extends string>(type: T) {
  return z.strictObject({
    ...settingBase(type),
    default: stringDefault,
  });
}

/**
 * The editor control vocabulary. Declarations are intentionally closed: a new
 * runtime context field is forward compatible, but a misspelled authoring key
 * would otherwise silently produce a control that cannot edit its value.
 *
 * `boolean` and `image` are retained aliases from the first SDK contract.
 */
export const themeFieldSchema = z.discriminatedUnion("type", [
  textSetting("text"),
  textSetting("textarea"),
  textSetting("richtext"),
  textSetting("inline_richtext"),
  textSetting("html"),
  z.strictObject({
    ...settingBase("checkbox"),
    default: z.boolean().optional(),
  }),
  z.strictObject({
    ...settingBase("boolean"),
    default: z.boolean().optional(),
  }),
  choiceSetting("radio"),
  choiceSetting("select"),
  choiceSetting("text_alignment"),
  z.strictObject({
    ...settingBase("number"),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    default: z.number().optional(),
  }),
  z.strictObject({
    ...settingBase("range"),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    unit: z.string().max(12).optional(),
    default: z.number().optional(),
  }),
  z.strictObject({
    ...settingBase("color"),
    default: colorDefault,
  }),
  pickerSetting("color_scheme"),
  pickerSetting("font_picker"),
  pickerSetting("image_picker"),
  pickerSetting("video"),
  pickerSetting("image"),
  z.strictObject({
    ...settingBase("video_url"),
    accept: z
      .array(z.enum(["youtube", "vimeo"]))
      .min(1)
      .max(2),
    placeholder: z.string().optional(),
    default: stringDefault,
  }),
  pickerSetting("tour"),
  pickerSetting("departure"),
  pickerSetting("supplier"),
  pickerSetting("media"),
  pickerSetting("page"),
  z.strictObject({
    ...settingBase("content_entry"),
    content_type: identifier,
    default: stringDefault,
  }),
]);

export const themeBlockSchema = z.strictObject({
  type: identifier,
  name: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
  settings: z.array(themeFieldSchema).max(200).default([]),
});

export const themeSectionPresetSchema = z.strictObject({
  name: z.string().min(1),
  settings: z.record(z.string(), z.json()).default({}),
  blocks: z
    .array(
      z.strictObject({
        type: identifier,
        settings: z.record(z.string(), z.json()).default({}),
      }),
    )
    .max(50)
    .default([]),
});

export const themeSectionSchema = z.strictObject({
  id: identifier,
  name: z.string().min(1),
  description: z.string().optional(),
  settings: z.array(themeFieldSchema).max(200).default([]),
  blocks: z.array(themeBlockSchema).max(50).default([]),
  max_blocks: z.number().int().nonnegative().max(50).optional(),
  limit: z.number().int().positive().max(50).optional(),
  presets: z.array(themeSectionPresetSchema).max(20).default([]),
  /** Empty means every declared route/template. Declaration order is UI order. */
  templates: z.array(identifier).max(50).default([]),
});

export const themeContextKindSchema = z.enum([
  "home",
  "content",
  "notFound",
  "collectionIndex",
  "collectionEntry",
  "tourIndex",
  "tourDetail",
  "categoryDetail",
  "cruiseIndex",
  "cruiseDetail",
  "shipDetail",
  "sailingDetail",
]);

export const themeRouteSchema = z.strictObject({
  id: identifier,
  pattern: z.string().startsWith("/"),
  context: themeContextKindSchema,
});

/**
 * An alternate renderer for a page context.
 *
 * Route ids are the default templates selected after routing. Additional
 * templates deliberately have no path: the platform resolves one for the
 * routed context from operator-owned assignment rules and publishes only its
 * id to the theme.
 */
export const themeTemplateSchema = z.strictObject({
  id: identifier,
  name: z.string().min(1),
  context: themeContextKindSchema,
});

/**
 * Stable, theme-facing operations. Implementations and provider identities are
 * private.
 *
 * These are a curated projection of the platform's public API, not the API
 * itself: Voyant maps each id onto an upstream path it is free to move, and
 * allowlists the methods and parameters that reach it. A theme therefore reads
 * an endpoint off `context.live.capabilities` and never hardcodes a path.
 *
 * Everything here is a read except the pricing, quote, shopping, booking and
 * checkout operations that were already here. Public writes — lead capture,
 * newsletter signup — and anything returning customer data are deliberately
 * absent: they need abuse controls and a privacy review that a capability id
 * does not provide on its own.
 */
export const THEME_CAPABILITY_IDS = [
  "catalog.search.v1",
  "catalog.product-detail.v1",
  "catalog.pricing.v1",
  "catalog.availability.v1",
  "catalog.requirements.v1",
  "catalog.markets.v1",
  "catalog.categories.v1",
  "catalog.destinations.v1",
  "catalog.tags.v1",
  "catalog.product-by-slug.v1",
  "catalog.departures.v1",
  "catalog.departure-pricing.v1",
  "catalog.offers.v1",
  "catalog.extensions.v1",
  "operator.profile.v1",
  "operator.settings.v1",
  "legal.policy.v1",
  "legal.terms.v1",
  "cruise.search.v1",
  "cruise.sailing.v1",
  "cruise.pricing.v1",
  "cruise.quote.v1",
  "shopping.search.v1",
  "shopping.trip-selections.v1",
  "shopping.trip-booking.v1",
  "booking.session.v1",
  "checkout.v1",
] as const;

export const themeCapabilityIdSchema = z.enum(THEME_CAPABILITY_IDS);

/** A theme declares what it uses; the platform alone chooses where it is served. */
export const themeCapabilityDeclarationSchema = z.strictObject({
  id: themeCapabilityIdSchema,
  required: z.boolean().default(true),
});

export const THEME_CAPABILITY_METHODS = {
  "catalog.search.v1": ["GET"],
  "catalog.product-detail.v1": ["GET"],
  "catalog.pricing.v1": ["POST"],
  "catalog.availability.v1": ["POST"],
  "catalog.requirements.v1": ["POST"],
  "catalog.markets.v1": ["GET"],
  "catalog.categories.v1": ["GET"],
  "catalog.destinations.v1": ["GET"],
  "catalog.tags.v1": ["GET"],
  "catalog.product-by-slug.v1": ["GET"],
  "catalog.departures.v1": ["GET"],
  "catalog.departure-pricing.v1": ["POST"],
  "catalog.offers.v1": ["GET"],
  "catalog.extensions.v1": ["GET"],
  "operator.profile.v1": ["GET"],
  "operator.settings.v1": ["GET"],
  "legal.policy.v1": ["GET"],
  "legal.terms.v1": ["GET"],
  "cruise.search.v1": ["GET"],
  "cruise.sailing.v1": ["GET"],
  "cruise.pricing.v1": ["POST"],
  "cruise.quote.v1": ["POST"],
  "shopping.search.v1": ["POST"],
  "shopping.trip-selections.v1": ["POST", "PATCH"],
  "shopping.trip-booking.v1": ["POST"],
  "booking.session.v1": ["POST", "PATCH"],
  "checkout.v1": ["POST"],
} as const satisfies Record<
  (typeof THEME_CAPABILITY_IDS)[number],
  readonly ("GET" | "POST" | "PATCH")[]
>;

export const themeLiveCapabilitySchema = z
  .strictObject({
    id: themeCapabilityIdSchema,
    available: z.boolean(),
    methods: z.array(z.enum(["GET", "POST", "PATCH"])).min(1),
    /** Same-origin URL generated by the platform, never authored by a theme. */
    endpoint: z
      .string()
      .startsWith("/v1/public/")
      .refine(
        (value) =>
          !value.startsWith("//") &&
          !value.includes("://") &&
          !value.includes("?") &&
          !value.includes("#"),
        {
          message: "Use a platform-generated /v1/public/... endpoint.",
        },
      )
      .optional(),
  })
  .superRefine((capability, context) => {
    const allowed = THEME_CAPABILITY_METHODS[capability.id];
    for (const method of capability.methods) {
      if (!(allowed as readonly string[]).includes(method)) {
        context.addIssue({
          code: "custom",
          message: `${method} is not allowed for ${capability.id}.`,
          path: ["methods"],
        });
      }
    }
    if (capability.available !== (capability.endpoint !== undefined)) {
      context.addIssue({
        code: "custom",
        message: capability.available
          ? "An available capability must provide its platform endpoint."
          : "An unavailable capability must not expose an endpoint.",
        path: ["endpoint"],
      });
    }
  });

/** Closed because any extra field risks exposing platform implementation data. */
export const themeLiveSchema = z.strictObject({
  capabilities: z.array(themeLiveCapabilitySchema).default([]),
});

/**
 * A collection shape a theme needs, named by the theme rather than by the site.
 *
 * A shared theme cannot know what an operator called their fields. One site's
 * guides carry `abstract`, another's carry `intro`, and a theme that read either
 * id directly would work on exactly one site. A binding inverts that: the theme
 * declares the slots it renders — `summary`, `hero`, `author` — and the operator
 * maps their own fields onto them once, at installation. The theme then reads
 * `entry.binding.summary` and never learns the field id behind it.
 *
 * `required` marks a slot the theme cannot render without. Publishing a site
 * whose mapping leaves one unfilled is rejected, because the alternative is a
 * page that renders blank where its content should be.
 */
export const themeContentBindingSchema = z.strictObject({
  id: identifier,
  /** Operator-facing, shown beside the mapping controls. */
  name: z.string().min(1),
  description: z.string().optional(),
  fields: z
    .array(
      z.strictObject({
        id: identifier,
        label: z.string().min(1),
        type: z.enum([
          "text",
          "richText",
          "number",
          "boolean",
          "date",
          "image",
          "select",
          "reference",
        ]),
        required: z.boolean().optional(),
      }),
    )
    .max(50)
    .default([]),
});

export const themeManifestSchema = z.strictObject({
  id: identifier,
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Use a semantic version."),
  description: z.string().optional(),
  routes: z.array(themeRouteSchema).min(1),
  templates: z.array(themeTemplateSchema).max(200).default([]),
  settings: z.array(themeFieldSchema).max(200).default([]),
  sections: z.array(themeSectionSchema).max(200).default([]),
  contentBindings: z.array(themeContentBindingSchema).max(20).default([]),
  capabilities: z
    .array(themeCapabilityDeclarationSchema)
    .max(THEME_CAPABILITY_IDS.length)
    .default([]),
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
  /** Platform-resolved renderer id. Assignment rules and selectors stay private. */
  templateId: identifier.optional(),
  /** The primary menu flattened to one level, for themes that need no nesting. */
  navigation: navigationSchema.default([]),
  menus: menusSchema.default({}),
  seo: seoSchema,
  openGraph: openGraphSchema.optional(),
  codeInjection: codeInjectionSchema.optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
  /** Live operations available to this publication; never contains credentials. */
  live: themeLiveSchema.optional(),
  /**
   * This same page in every locale that publishes it, for `hreflang`.
   *
   * A theme cannot derive these. Slugs are localized, so the Romanian and
   * English addresses of one page share no path component — `/circuite/x` and
   * `/en/tours/y` are the same resource. Voyant resolves each locale's address
   * when it materializes the publication and puts the result here; a locale
   * that does not publish this page is absent rather than guessed at.
   */
  alternates: z
    .array(
      z.looseObject({
        locale: localeSchema,
        path: z.string().startsWith("/"),
      }),
    )
    .default([]),
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

/**
 * One entry of an operator-defined collection.
 *
 * `values` is keyed by the field ids the operator declared, so its shape is
 * theirs rather than Voyant's and cannot be typed here. A theme reads the keys
 * it knows about and ignores the rest, exactly as it does with settings.
 *
 * `path` is present only when the entry's collection is routable. Linking to an
 * entry that has no page of its own would produce a 404 that looks deliberate,
 * so a theme must check for it rather than assume it.
 */
export const collectionEntrySchema = z.looseObject({
  id: identifier,
  slug: z.string().min(1),
  path: z.string().startsWith("/").optional(),
  title: z.string().min(1),
  values: z.record(z.string(), z.unknown()).default({}),
  /**
   * The operator's values projected onto the slots a binding declares, present
   * only when this collection is mapped to one. Reading `binding.summary` is
   * what lets one theme render two sites that named the field differently;
   * `values` remains available for a theme rendering its own collections.
   */
  binding: z.record(z.string(), z.unknown()).optional(),
});

/**
 * One field an operator declared on a collection.
 *
 * `values` on an entry is a record, so it carries neither the operator's wording
 * for a field nor the order they arranged the fields in. A theme given only the
 * record has to invent both — humanize the id and sort the keys — and then an
 * operator who labels a field "Written by" and puts it second sees "Author"
 * first, with no way to tell the theme otherwise. These definitions are what
 * make an entry presentable the way it was authored.
 *
 * `type` is here so a theme can choose a presentation from what the field IS
 * rather than guessing from the shape of one value, which misreads an empty
 * collection, a blank field, and a reference whose target has no translation.
 */
export const collectionFieldSchema = z.looseObject({
  id: identifier,
  label: z.string().min(1),
  type: z.enum([
    "text",
    "richText",
    "number",
    "boolean",
    "date",
    "image",
    "select",
    "reference",
  ]),
});

const collectionIdentitySchema = z.looseObject({
  id: identifier,
  name: z.string().min(1),
  /**
   * Declaration order, which is the operator's order.
   *
   * Optional because a publication materialized before this shipped carries no
   * definitions, and those snapshots stay readable — a theme falls back to the
   * keys of `values` for as long as one is live.
   */
  fields: z.array(collectionFieldSchema).optional(),
});

export const collectionIndexContextSchema = z.looseObject({
  ...contextBase,
  kind: z.literal("collectionIndex"),
  path: z.string().startsWith("/"),
  title: z.string().min(1),
  collection: collectionIdentitySchema,
  /** Declaration order, which is the order the operator arranged them in. */
  entries: z.array(collectionEntrySchema).default([]),
});

export const collectionEntryContextSchema = z.looseObject({
  ...contextBase,
  kind: z.literal("collectionEntry"),
  path: z.string().startsWith("/"),
  title: z.string().min(1),
  collection: collectionIdentitySchema,
  entry: collectionEntrySchema,
});

/**
 * Stable public catalog projection used by immutable tour contexts.
 *
 * This deliberately contains editorial identity and presentation only. Price,
 * departure, availability, requirements, quote, booking, and payment data are
 * live state and must be obtained through a declared capability endpoint.
 */
const commercialSnapshotKeys = new Set([
  "price",
  "priceFrom",
  "pricing",
  "sellAmountCents",
  "sellCurrency",
  "departures",
  "nextDeparture",
  "availability",
  "requirements",
  "quote",
  "booking",
  "payment",
  "checkout",
]);

function rejectCommercialSnapshots(
  value: Record<string, unknown>,
  context: {
    addIssue(issue: { code: "custom"; message: string; path: string[] }): void;
  },
) {
  for (const key of commercialSnapshotKeys) {
    if (key in value) {
      context.addIssue({
        code: "custom",
        message: `'${key}' is live commercial state and cannot be embedded in an immutable tour context.`,
        path: [key],
      });
    }
  }
}

const productBookingModeSchema = z.enum([
  "date",
  "date_time",
  "open",
  "stay",
  "transfer",
  "itinerary",
  "other",
]);

const productCapacityModeSchema = z.enum([
  "free_sale",
  "limited",
  "on_request",
]);

export const catalogProductTypeSchema = z.looseObject({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});

export const catalogProductMediaSchema = z.looseObject({
  id: z.string().min(1),
  mediaType: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  altText: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * The single lead image a theme renders for a record.
 *
 * Every record a theme can put on a page declares this under the same name and
 * with the same nullability, so a component that renders a hero, a card or a
 * tile reads one field and needs one null check. A record with `media[]` but no
 * `coverMedia` leaves a theme guessing at `media[0]`; an absent value means the
 * operator has not chosen one, not that the record cannot have one.
 */
const coverMediaSchema = catalogProductMediaSchema.nullable().optional();

export const catalogProductCategorySchema = z.looseObject({
  id: z.string().min(1),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().optional(),
  coverMedia: coverMediaSchema,
  sortOrder: z.number().int().optional(),
});

export const catalogProductTagSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const catalogProductDestinationSchema = z.looseObject({
  id: z.string().min(1),
  parentId: z.string().nullable().optional(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  destinationType: z.string().min(1).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  coverMedia: coverMediaSchema,
  sortOrder: z.number().int().optional(),
});

export const catalogProductLocationSchema = z.looseObject({
  id: z.string().min(1),
  locationType: z.string().min(1),
  title: z.string().min(1),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const catalogProductFeatureSchema = z.looseObject({
  id: z.string().min(1),
  featureType: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const catalogProductFaqSchema = z.looseObject({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string(),
  sortOrder: z.number().int().optional(),
});

export const catalogProductItinerarySchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  days: z
    .array(
      z.looseObject({
        id: z.string().min(1),
        dayNumber: z.number().int().positive(),
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        /**
         * @deprecated Read `coverMedia` instead. A bare URL carries no
         * dimensions and no alt text, so a theme cannot size the image or
         * describe it. Kept because publications already carry it.
         */
        thumbnailUrl: z.string().nullable().optional(),
        coverMedia: coverMediaSchema,
        services: z
          .array(
            z.looseObject({
              id: z.string().min(1),
              serviceType: z.string().min(1),
              name: z.string().min(1),
              description: z.string().nullable().optional(),
              sortOrder: z.number().int().nullable().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export const catalogProductSchema = z
  .looseObject({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    shortDescription: z.string().nullable().optional(),
    descriptionHtml: z.string().optional(),
    bookingMode: productBookingModeSchema,
    capacityMode: productCapacityModeSchema,
    productType: catalogProductTypeSchema.nullable().optional(),
    categories: z.array(catalogProductCategorySchema).default([]),
    tags: z.array(catalogProductTagSchema).default([]),
    destinations: z.array(catalogProductDestinationSchema).default([]),
    locations: z.array(catalogProductLocationSchema).default([]),
    coverMedia: coverMediaSchema,
    media: z.array(catalogProductMediaSchema).default([]),
    features: z.array(catalogProductFeatureSchema).default([]),
    faqs: z.array(catalogProductFaqSchema).default([]),
    itinerary: catalogProductItinerarySchema.nullable().optional(),
  })
  .superRefine(rejectCommercialSnapshots);

export const tourIndexContextSchema = z
  .looseObject({
    ...contextBase,
    kind: z.literal("tourIndex"),
    path: z.literal("/tours"),
    title: z.string().min(1),
    products: z.array(catalogProductSchema).default([]),
  })
  .superRefine(rejectCommercialSnapshots);

export const tourDetailContextSchema = z
  .looseObject({
    ...contextBase,
    kind: z.literal("tourDetail"),
    path: z.string().regex(/^\/tours\/[^/]+$/),
    slug: z.string().min(1),
    title: z.string().min(1),
    product: catalogProductSchema,
  })
  .superRefine(rejectCommercialSnapshots);

/**
 * One product category, at the operator's own address.
 *
 * Operators sell in families — pilgrimages, city breaks, cruises-by-river —
 * and those families are usually the addresses customers already know and
 * search for. Unlike `tourIndex` this path is not fixed: the operator's own
 * slug is the address, and it is translated, so the same category is
 * `/pelerinaje` in one locale and `/en/pilgrimages` in another. `alternates`
 * ties them together, and `category.id` is stable across locales while the
 * slug is not — key on the id.
 *
 * What the publication carries is what only it can know: the address, the
 * category, and the locales this page exists in. The membership list is not
 * that. `catalog.search.v1` already filters by `categoryId`, and asking it
 * gets live pricing and availability and paging for free, where a baked list
 * would be a second copy that grows the publication by every product in every
 * category in every locale and is stale the moment the catalog moves.
 *
 * `products` is therefore usually absent. A publication may still carry a
 * listing when a theme needs one rendered without a live call; treat it as an
 * optimization and fall back to the capability.
 */
export const categoryDetailContextSchema = z
  .looseObject({
    ...contextBase,
    kind: z.literal("categoryDetail"),
    path: z.string().startsWith("/"),
    slug: z.string().min(1),
    title: z.string().min(1),
    category: catalogProductCategorySchema,
    products: z.array(catalogProductSchema).optional(),
  })
  .superRefine(rejectCommercialSnapshots);

/**
 * Keys that must never be materialized into an immutable cruise publication.
 *
 * Cruise search, sailing availability, pricing, quoting, booking, and checkout
 * stay live behind capabilities. Provider payloads and personal information
 * stay behind the platform boundary. Normalizing catches camelCase, snake_case,
 * and kebab-case spellings, and walking the whole value prevents a forbidden
 * snapshot from being hidden inside a future additive field.
 */
const cruisePublicationForbiddenTerms = [
  "price",
  "pricing",
  "amount",
  "currency",
  "fare",
  "promotion",
  "promo",
  "discount",
  "availability",
  "inventory",
  "quote",
  "booking",
  "checkout",
  "session",
  "payment",
  "billing",
  "card",
  "customer",
  "passenger",
  "traveler",
  "traveller",
  "email",
  "phone",
  "dateofbirth",
  "birthdate",
  "dob",
  "firstname",
  "lastname",
  "fullname",
  "contact",
  "postalcode",
  "ipaddress",
  "passport",
  "address",
  "token",
  "secret",
  "credential",
  "provider",
  "supplier",
  "source",
  "provenance",
  "rawpayload",
] as const;

function rejectCruisePublicationLeaks(
  value: Record<string, unknown>,
  context: {
    addIssue(issue: {
      code: "custom";
      message: string;
      path: (string | number)[];
    }): void;
  },
) {
  const visit = (current: unknown, path: (string | number)[]) => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        visit(item, [...path, index]);
      });
      return;
    }
    if (!isRecord(current)) return;
    for (const [key, child] of Object.entries(current)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const forbidden = cruisePublicationForbiddenTerms.find((term) =>
        term === "source"
          ? normalized === term ||
            normalized.startsWith(term) ||
            normalized.endsWith(term) ||
            normalized.endsWith("sourceid")
          : normalized.includes(term),
      );
      if (forbidden) {
        context.addIssue({
          code: "custom",
          message: `'${key}' is ${
            [
              "customer",
              "passenger",
              "traveler",
              "traveller",
              "email",
              "phone",
              "dateofbirth",
              "birthdate",
              "dob",
              "firstname",
              "lastname",
              "fullname",
              "contact",
              "postalcode",
              "ipaddress",
              "passport",
              "address",
            ].includes(forbidden)
              ? "personal information"
              : [
                    "provider",
                    "supplier",
                    "source",
                    "provenance",
                    "rawpayload",
                  ].includes(forbidden)
                ? "provider/source provenance"
                : "live commercial state"
          } and cannot be embedded in an immutable cruise context.`,
          path: [...path, key],
        });
      } else {
        visit(child, [...path, key]);
      }
    }
  };
  visit(value, []);
}

const publicationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO 8601 calendar date.");

export const cruisePortSchema = z
  .looseObject({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    countryCode: z.string().length(2).optional(),
    descriptionHtml: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    coverMedia: coverMediaSchema,
    media: z.array(catalogProductMediaSchema).default([]),
  })
  .superRefine(rejectCruisePublicationLeaks);

export const cruiseCabinCategorySchema = z
  .looseObject({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    descriptionHtml: z.string().optional(),
    maxOccupancy: z.number().int().positive().optional(),
    deckNames: z.array(z.string().min(1)).default([]),
    coverMedia: coverMediaSchema,
    media: z.array(catalogProductMediaSchema).default([]),
  })
  .superRefine(rejectCruisePublicationLeaks);

export const cruiseShipSchema = z
  .looseObject({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    descriptionHtml: z.string().optional(),
    cruiseLine: z.string().min(1).optional(),
    launchedYear: z.number().int().positive().optional(),
    deckCount: z.number().int().positive().optional(),
    coverMedia: coverMediaSchema,
    media: z.array(catalogProductMediaSchema).default([]),
    cabinCategories: z.array(cruiseCabinCategorySchema).default([]),
  })
  .superRefine(rejectCruisePublicationLeaks);

export const cruiseItinerarySchema = z
  .looseObject({
    id: z.string().min(1),
    name: z.string().min(1),
    days: z
      .array(
        z.looseObject({
          dayNumber: z.number().int().positive(),
          title: z.string().min(1),
          descriptionHtml: z.string().optional(),
          coverMedia: coverMediaSchema,
          ports: z.array(cruisePortSchema).default([]),
          atSea: z.boolean().default(false),
        }),
      )
      .min(1),
  })
  .superRefine(rejectCruisePublicationLeaks);

export const cruiseDepartureSchema = z
  .looseObject({
    startsOn: publicationDateSchema,
    endsOn: publicationDateSchema,
    durationNights: z.number().int().nonnegative(),
    embarkationPort: cruisePortSchema,
    disembarkationPort: cruisePortSchema,
  })
  .superRefine(rejectCruisePublicationLeaks);

export const cruiseSailingSchema = z
  .looseObject({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    cruiseId: z.string().min(1),
    shipId: z.string().min(1),
    departure: cruiseDepartureSchema,
    itinerary: cruiseItinerarySchema,
    coverMedia: coverMediaSchema,
    media: z.array(catalogProductMediaSchema).default([]),
    cabinCategories: z.array(cruiseCabinCategorySchema).default([]),
  })
  .superRefine(rejectCruisePublicationLeaks);

export const cruiseSchema = z
  .looseObject({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    shortDescription: z.string().optional(),
    descriptionHtml: z.string().optional(),
    coverMedia: coverMediaSchema,
    media: z.array(catalogProductMediaSchema).default([]),
    ports: z.array(cruisePortSchema).default([]),
    ships: z.array(cruiseShipSchema).default([]),
    sailings: z.array(cruiseSailingSchema).default([]),
  })
  .superRefine(rejectCruisePublicationLeaks);

export const cruiseIndexContextSchema = z
  .looseObject({
    ...contextBase,
    kind: z.literal("cruiseIndex"),
    path: z.literal("/cruises"),
    title: z.string().min(1),
    cruises: z.array(cruiseSchema).default([]),
  })
  .superRefine(rejectCruisePublicationLeaks);

export const cruiseDetailContextSchema = z
  .looseObject({
    ...contextBase,
    kind: z.literal("cruiseDetail"),
    path: z.string().regex(/^\/cruises\/[^/]+$/),
    slug: z.string().min(1),
    title: z.string().min(1),
    cruise: cruiseSchema,
  })
  .superRefine(rejectCruisePublicationLeaks);

export const shipDetailContextSchema = z
  .looseObject({
    ...contextBase,
    kind: z.literal("shipDetail"),
    path: z.string().regex(/^\/ships\/[^/]+$/),
    slug: z.string().min(1),
    title: z.string().min(1),
    ship: cruiseShipSchema,
  })
  .superRefine(rejectCruisePublicationLeaks);

export const sailingDetailContextSchema = z
  .looseObject({
    ...contextBase,
    kind: z.literal("sailingDetail"),
    path: z.string().regex(/^\/sailings\/[^/]+$/),
    slug: z.string().min(1),
    title: z.string().min(1),
    sailing: cruiseSailingSchema,
  })
  .superRefine(rejectCruisePublicationLeaks);

export const themePageContextSchema = z.discriminatedUnion("kind", [
  homeContextSchema,
  contentContextSchema,
  notFoundContextSchema,
  collectionIndexContextSchema,
  collectionEntryContextSchema,
  tourIndexContextSchema,
  tourDetailContextSchema,
  categoryDetailContextSchema,
  cruiseIndexContextSchema,
  cruiseDetailContextSchema,
  shipDetailContextSchema,
  sailingDetailContextSchema,
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
  tourIndex: tourIndexContextSchema.optional(),
  tourDetail: z.array(tourDetailContextSchema).default([]),
  categoryDetail: z.array(categoryDetailContextSchema).default([]),
  cruiseIndex: cruiseIndexContextSchema.optional(),
  cruiseDetail: z.array(cruiseDetailContextSchema).default([]),
  shipDetail: z.array(shipDetailContextSchema).default([]),
  sailingDetail: z.array(sailingDetailContextSchema).default([]),
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
export type ThemeBlock = z.infer<typeof themeBlockSchema>;
export type ThemeSectionPreset = z.infer<typeof themeSectionPresetSchema>;
export type ThemeSection = z.infer<typeof themeSectionSchema>;
export type ThemeRoute = z.infer<typeof themeRouteSchema>;
export type ThemeTemplate = z.infer<typeof themeTemplateSchema>;
export type ThemeCapabilityId = z.infer<typeof themeCapabilityIdSchema>;
export type ThemeCapabilityDeclaration = z.infer<
  typeof themeCapabilityDeclarationSchema
>;
export type ThemeLiveCapability = z.infer<typeof themeLiveCapabilitySchema>;
export type ThemeLive = z.infer<typeof themeLiveSchema>;
export type ThemeManifest = z.infer<typeof themeManifestSchema>;
export type HomeContext = z.infer<typeof homeContextSchema>;
export type ContentContext = z.infer<typeof contentContextSchema>;
export type NotFoundContext = z.infer<typeof notFoundContextSchema>;
export type ThemeCollectionEntry = z.infer<typeof collectionEntrySchema>;
export type ThemeCollectionField = z.infer<typeof collectionFieldSchema>;
export type ThemeContentBinding = z.infer<typeof themeContentBindingSchema>;
export type CollectionIndexContext = z.infer<
  typeof collectionIndexContextSchema
>;
export type CollectionEntryContext = z.infer<
  typeof collectionEntryContextSchema
>;
export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type CategoryDetailContext = z.infer<typeof categoryDetailContextSchema>;
export type CatalogProductCategory = z.infer<
  typeof catalogProductCategorySchema
>;
export type CatalogProductDestination = z.infer<
  typeof catalogProductDestinationSchema
>;
export type CatalogProductFaq = z.infer<typeof catalogProductFaqSchema>;
export type CatalogProductFeature = z.infer<typeof catalogProductFeatureSchema>;
export type CatalogProductItinerary = z.infer<
  typeof catalogProductItinerarySchema
>;
export type CatalogProductLocation = z.infer<
  typeof catalogProductLocationSchema
>;
export type CatalogProductMedia = z.infer<typeof catalogProductMediaSchema>;
export type CatalogProductTag = z.infer<typeof catalogProductTagSchema>;
export type CatalogProductType = z.infer<typeof catalogProductTypeSchema>;
export type TourIndexContext = z.infer<typeof tourIndexContextSchema>;
export type TourDetailContext = z.infer<typeof tourDetailContextSchema>;
export type CruisePort = z.infer<typeof cruisePortSchema>;
export type CruiseCabinCategory = z.infer<typeof cruiseCabinCategorySchema>;
export type CruiseShip = z.infer<typeof cruiseShipSchema>;
export type CruiseItinerary = z.infer<typeof cruiseItinerarySchema>;
export type CruiseDeparture = z.infer<typeof cruiseDepartureSchema>;
export type CruiseSailing = z.infer<typeof cruiseSailingSchema>;
export type Cruise = z.infer<typeof cruiseSchema>;
export type CruiseIndexContext = z.infer<typeof cruiseIndexContextSchema>;
export type CruiseDetailContext = z.infer<typeof cruiseDetailContextSchema>;
export type ShipDetailContext = z.infer<typeof shipDetailContextSchema>;
export type SailingDetailContext = z.infer<typeof sailingDetailContextSchema>;
export type ThemePageContext = z.infer<typeof themePageContextSchema>;
export type ThemeContextResponse = z.infer<typeof themeContextResponseSchema>;
export type ThemeDefinition = z.input<typeof themeDefinitionSchema>;
export type ParsedThemeDefinition = z.output<typeof themeDefinitionSchema>;

/** Provides contextual typing without hiding validation failures at tooling time. */
export function defineTheme<const T extends ThemeDefinition>(theme: T): T {
  return theme;
}
