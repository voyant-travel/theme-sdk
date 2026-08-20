import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CONTRACT_VERSION,
  catalogProductCategorySchema,
  categoryDetailContextSchema,
  collectionEntryContextSchema,
  collectionEntrySchema,
  collectionIndexContextSchema,
  contentContextSchema,
  homeContextSchema,
  READABLE_CONTRACT_VERSIONS,
  THEME_CAPABILITY_IDS,
  THEME_CAPABILITY_METHODS,
  themeContextResponseSchema,
  themeManifestSchema,
  themePageContextSchema,
  tourDetailContextSchema,
  tourIndexContextSchema,
  upgradeThemeContextResponse,
} from "../src/index.js";

function homeContext(extra: Record<string, unknown> = {}) {
  return {
    kind: "home",
    path: "/",
    locale: "en",
    site: { name: "Northstar" },
    navigation: [],
    menus: {},
    seo: { title: "Home" },
    settings: {},
    title: "Home",
    sections: [],
    ...extra,
  };
}

describe("published context forward compatibility", () => {
  it("carries only the resolved template id as modeled assignment state", () => {
    const parsed = homeContextSchema.parse(
      homeContext({ templateId: "home-campaign" }),
    );
    expect(parsed.templateId).toBe("home-campaign");
    expect("templateAssignments" in parsed).toBe(false);
  });

  it("accepts a context field this SDK release has never heard of", () => {
    const future = homeContext({
      // Whatever Voyant adds next. A deployed theme must render the fields it
      // knows and ignore the rest.
      breadcrumbs: [{ label: "Home", href: "/" }],
      seo: { title: "Home", canonical: "https://northstar.example/" },
    });

    const parsed = themeContextResponseSchema.parse({
      contractVersion: CONTRACT_VERSION,
      context: future,
    });

    expect(parsed.context.kind).toBe("home");
    // Unknown keys survive parsing, so a theme can opt into a field before the
    // SDK types it.
    expect(parsed.context).toMatchObject({
      breadcrumbs: [{ label: "Home", href: "/" }],
      seo: { canonical: "https://northstar.example/" },
    });
  });

  it("would have failed under the closed context schema it replaces", () => {
    // The v1alpha1 shape, reconstructed: identical fields, strict object.
    const closed = z.strictObject(homeContextSchema.shape);
    const future = homeContext({ breadcrumbs: [] });

    expect(closed.safeParse(future).success).toBe(false);
    expect(homeContextSchema.safeParse(future).success).toBe(true);
  });

  it("reads the previous envelope so a release and a publication can cross over", () => {
    // Exactly what a v1alpha1 publication object contains: no seo, no menus,
    // the document title carried on context.title.
    const { menus: _menus, seo: _seo, ...published } = homeContext();
    const parsed = themeContextResponseSchema.parse(
      upgradeThemeContextResponse({
        contractVersion: "v1alpha1",
        context: published,
      }),
    );

    expect(parsed.contractVersion).toBe("v1alpha1");
    expect(parsed.context.seo).toEqual({ title: "Home", noIndex: false });
    expect(parsed.context.menus).toEqual({});
  });

  it.each([
    "v1alpha2",
    "v1alpha3",
    "v1alpha4",
    "v1alpha5",
  ] as const)("reads an unchanged %s publication envelope", (contractVersion) => {
    const parsed = themeContextResponseSchema.parse({
      contractVersion,
      context: homeContext(),
    });
    expect(parsed.contractVersion).toBe(contractVersion);
    expect(parsed.context.kind).toBe("home");
  });

  it("does not forgive a missing seo at the current version", () => {
    const { seo: _seo, ...withoutSeo } = homeContext();
    const response = { contractVersion: CONTRACT_VERSION, context: withoutSeo };

    expect(upgradeThemeContextResponse(response)).toBe(response);
    expect(themeContextResponseSchema.safeParse(response).success).toBe(false);
  });

  it("leaves an envelope it cannot upgrade alone rather than guessing", () => {
    const { seo: _seo, ...withoutSeo } = homeContext();
    const untitled = {
      contractVersion: "v1alpha1",
      context: { ...withoutSeo, title: 7 },
    };

    expect(upgradeThemeContextResponse(untitled)).toBe(untitled);
    expect(themeContextResponseSchema.safeParse(untitled).success).toBe(false);
  });

  it("keeps the response envelope closed so a reader cannot change the frame", () => {
    expect(
      themeContextResponseSchema.safeParse({
        contractVersion: CONTRACT_VERSION,
        context: homeContext(),
        cacheHint: "public",
      }).success,
    ).toBe(false);
    // Readable versions are an explicit list, not "anything that parses". This
    // names a version that does not exist yet on purpose, so it has to be
    // bumped past whatever the current one becomes.
    expect(
      themeContextResponseSchema.safeParse({
        contractVersion: "v1alpha6",
        context: homeContext(),
      }).success,
    ).toBe(false);
    expect(READABLE_CONTRACT_VERSIONS).toContain(CONTRACT_VERSION);
  });

  it("still rejects a context whose known fields are wrong", () => {
    expect(
      themePageContextSchema.safeParse(homeContext({ locale: "en_us" }))
        .success,
    ).toBe(false);
    expect(
      themePageContextSchema.safeParse(homeContext({ seo: {} })).success,
    ).toBe(false);
    expect(
      themePageContextSchema.safeParse(homeContext({ kind: "post" })).success,
    ).toBe(false);
  });
});

describe("published context fields", () => {
  it("carries the full seo projection, not just a title", () => {
    const parsed = homeContextSchema.parse(
      homeContext({
        seo: {
          title: "Home",
          description: "Trips worth taking",
          noIndex: true,
        },
      }),
    );

    expect(parsed.seo).toEqual({
      title: "Home",
      description: "Trips worth taking",
      noIndex: true,
    });
  });

  it("defaults noIndex so a theme never has to test for undefined", () => {
    expect(homeContextSchema.parse(homeContext()).seo.noIndex).toBe(false);
  });

  it("accepts named menus nested to arbitrary depth", () => {
    const parsed = homeContextSchema.parse(
      homeContext({
        menus: {
          primary: [
            {
              label: "Trips",
              href: "/trips",
              items: [
                {
                  label: "Antarctica",
                  href: "/trips/antarctica",
                  items: [{ label: "January", href: "/trips/antarctica/jan" }],
                },
              ],
            },
          ],
          footer: [{ label: "Terms", href: "/terms" }],
        },
      }),
    );

    expect(parsed.menus.primary?.[0]?.items?.[0]?.items?.[0]?.label).toBe(
      "January",
    );
    expect(parsed.menus.footer).toHaveLength(1);
  });

  it("defaults menus so a theme can read context.menus unconditionally", () => {
    const { menus, ...withoutMenus } = homeContext();
    expect(menus).toEqual({});
    expect(homeContextSchema.parse(withoutMenus).menus).toEqual({});
  });

  it("passes operator code injection through verbatim", () => {
    const head = '<script src="https://tags.example/a.js"></script>';
    const parsed = contentContextSchema.parse({
      ...homeContext(),
      kind: "content",
      path: "/journal/one",
      slug: "one",
      body: "Body",
      codeInjection: { head, bodyEnd: "<!-- end -->" },
    });

    expect(parsed.codeInjection).toEqual({ head, bodyEnd: "<!-- end -->" });
  });

  it("carries visual-builder sections on an ordinary content page", () => {
    const parsed = contentContextSchema.parse({
      ...homeContext(),
      kind: "content",
      path: "/campaign",
      slug: "campaign",
      body: "",
      sections: [
        {
          type: "hero",
          data: { settings: { heading: "Summer escapes" }, blocks: [] },
        },
      ],
    });

    expect(parsed.sections).toEqual([
      {
        type: "hero",
        data: { settings: { heading: "Summer escapes" }, blocks: [] },
      },
    ]);
  });

  it("defaults legacy prose-only content pages to no sections", () => {
    const parsed = contentContextSchema.parse({
      ...homeContext(),
      kind: "content",
      path: "/about",
      slug: "about",
      body: "About us",
    });

    expect(parsed.sections).toEqual([]);
  });

  it("treats openGraph as optional", () => {
    expect(homeContextSchema.parse(homeContext()).openGraph).toBeUndefined();
    expect(
      homeContextSchema.parse(
        homeContext({
          openGraph: {
            title: "Northstar",
            image: { src: "/social.png", alt: "" },
          },
        }),
      ).openGraph?.image?.src,
    ).toBe("/social.png");
  });
});

function collectionEntry(extra: Record<string, unknown> = {}) {
  return {
    id: "transylvania",
    slug: "transylvania",
    path: "/guides/transylvania",
    title: "Transylvania in autumn",
    values: { author: { id: "ana", title: "Ana Pop" } },
    ...extra,
  };
}

function collectionContextBase() {
  return {
    locale: "en",
    site: { name: "Northstar" },
    navigation: [],
    menus: {},
    seo: { title: "Travel guides" },
    settings: {},
    collection: { id: "guides", name: "Travel guides" },
  };
}

describe("collection contexts", () => {
  it("carries a resolved item-page template without exposing assignments", () => {
    const context = collectionEntryContextSchema.parse({
      ...collectionContextBase(),
      kind: "collectionEntry",
      path: "/guides/transylvania",
      title: "Transylvania",
      templateId: "editorial-guide",
      entry: collectionEntry(),
    });

    expect(context.templateId).toBe("editorial-guide");
  });
  it("parses an index and an entry through the page union", () => {
    const index = themePageContextSchema.parse({
      ...collectionContextBase(),
      kind: "collectionIndex",
      path: "/guides",
      title: "Travel guides",
      entries: [collectionEntry()],
    });
    expect(index.kind).toBe("collectionIndex");

    const entry = themePageContextSchema.parse({
      ...collectionContextBase(),
      kind: "collectionEntry",
      path: "/guides/transylvania",
      title: "Transylvania in autumn",
      entry: collectionEntry(),
    });
    expect(entry.kind).toBe("collectionEntry");
  });

  it("keeps operator-declared values verbatim, whatever their shape", () => {
    const parsed = collectionEntrySchema.parse(
      collectionEntry({
        values: {
          published: "2026-08-04",
          rating: 5,
          featured: true,
          cover: { src: "https://cdn.example/a.jpg", alt: "A ridge" },
        },
      }),
    );

    expect(parsed.values).toEqual({
      published: "2026-08-04",
      rating: 5,
      featured: true,
      cover: { src: "https://cdn.example/a.jpg", alt: "A ridge" },
    });
  });

  it("leaves path absent for an entry whose type has no pages", () => {
    const author = collectionEntrySchema.parse({
      id: "ana",
      slug: "ana",
      title: "Ana Pop",
      values: {},
    });

    // A theme has to check this rather than assume it: linking to an entry with
    // no page of its own would produce a 404 that reads as deliberate.
    expect(author.path).toBeUndefined();
  });

  it("defaults an index with no entries rather than failing the page", () => {
    const empty = collectionIndexContextSchema.parse({
      ...collectionContextBase(),
      kind: "collectionIndex",
      path: "/guides",
      title: "Travel guides",
    });

    expect(empty.entries).toEqual([]);
  });

  it("carries the operator's field labels in the order they declared them", () => {
    const index = collectionIndexContextSchema.parse({
      ...collectionContextBase(),
      kind: "collectionIndex",
      path: "/guides",
      title: "Travel guides",
      collection: {
        id: "guides",
        name: "Travel guides",
        fields: [
          { id: "summary", label: "Summary", type: "text" },
          { id: "author", label: "Written by", type: "reference" },
        ],
      },
      entries: [collectionEntry()],
    });

    // Order is the operator's, not alphabetical: `summary` sorts after
    // `author` and must still come first.
    expect(index.collection.fields?.map((field) => field.label)).toEqual([
      "Summary",
      "Written by",
    ]);
  });

  it("reads a publication that predates field definitions", () => {
    const index = collectionIndexContextSchema.parse({
      ...collectionContextBase(),
      kind: "collectionIndex",
      path: "/guides",
      title: "Travel guides",
      entries: [collectionEntry()],
    });

    // Absent rather than empty, so a theme can tell "no definitions were
    // published" from "this collection declares no fields" and fall back.
    expect(index.collection.fields).toBeUndefined();
  });
});

function catalogProduct(extra: Record<string, unknown> = {}) {
  return {
    id: "tour-transylvania",
    slug: "transylvania-by-train",
    name: "Transylvania by train",
    shortDescription: "A slow journey through the Carpathians.",
    bookingMode: "itinerary",
    capacityMode: "limited",
    categories: [{ id: "rail", name: "Rail", slug: "rail", parentId: null }],
    tags: [{ id: "small-group", name: "Small group" }],
    destinations: [
      { id: "brasov", slug: "brasov", name: "Brașov", parentId: null },
    ],
    locations: [],
    coverMedia: {
      id: "cover",
      mediaType: "image",
      name: "Mountain train",
      url: "/media/transylvania.jpg",
      altText: "A mountain train",
    },
    media: [],
    features: [],
    faqs: [],
    ...extra,
  };
}

function tourContextBase() {
  return {
    locale: "en",
    site: { name: "Northstar" },
    navigation: [],
    menus: {},
    seo: { title: "Tours" },
    settings: {},
  };
}

describe("tour contexts", () => {
  it("parses canonical index and detail contexts through the page union", () => {
    const index = themePageContextSchema.parse({
      ...tourContextBase(),
      kind: "tourIndex",
      path: "/tours",
      title: "Tours",
      products: [catalogProduct()],
    });
    const detail = themePageContextSchema.parse({
      ...tourContextBase(),
      kind: "tourDetail",
      path: "/tours/transylvania-by-train",
      slug: "transylvania-by-train",
      title: "Transylvania by train",
      product: catalogProduct(),
    });

    expect(index.kind).toBe("tourIndex");
    expect(detail.kind).toBe("tourDetail");
  });

  it("keeps the immutable public catalog projection free of commercial snapshots", () => {
    for (const forbidden of [
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
    ]) {
      expect(
        tourDetailContextSchema.safeParse({
          ...tourContextBase(),
          kind: "tourDetail",
          path: "/tours/transylvania-by-train",
          slug: "transylvania-by-train",
          title: "Transylvania by train",
          product: catalogProduct({ [forbidden]: { stale: true } }),
        }).success,
        forbidden,
      ).toBe(false);
    }
  });

  it("gives catalog taxonomy and itinerary days a lead image of their own", () => {
    const image = {
      id: "cover-brasov",
      mediaType: "image",
      name: "Brașov rooftops",
      url: "/media/brasov.jpg",
      altText: "Red rooftops under a wooded ridge",
    };
    const detail = tourDetailContextSchema.parse({
      ...tourContextBase(),
      kind: "tourDetail",
      path: "/tours/transylvania-by-train",
      slug: "transylvania-by-train",
      title: "Transylvania by train",
      product: catalogProduct({
        categories: [
          { id: "rail", name: "Rail", slug: "rail", coverMedia: image },
        ],
        destinations: [
          { id: "brasov", slug: "brasov", name: "Brașov", coverMedia: image },
        ],
        itinerary: {
          id: "itin",
          name: "Seven days",
          days: [{ id: "d1", dayNumber: 1, coverMedia: image }],
        },
      }),
    });

    expect(detail.product.categories[0]?.coverMedia?.url).toBe(image.url);
    expect(detail.product.destinations[0]?.coverMedia?.altText).toBe(
      image.altText,
    );
    expect(detail.product.itinerary?.days[0]?.coverMedia?.url).toBe(image.url);
  });

  it("publishes a category at the operator's own translated address", () => {
    const pilgrimages = {
      id: "cat_pilgrimages",
      name: "Pelerinaje",
      slug: "pelerinaje",
      coverMedia: {
        id: "cover",
        mediaType: "image",
        name: "Monastery at dawn",
        url: "/media/pelerinaje.jpg",
        altText: "A painted monastery at dawn",
      },
    };
    const context = categoryDetailContextSchema.parse({
      ...tourContextBase(),
      kind: "categoryDetail",
      path: "/pelerinaje",
      slug: "pelerinaje",
      title: "Pelerinaje",
      category: pilgrimages,
      products: [catalogProduct()],
      alternates: [
        { locale: "ro-RO", path: "/pelerinaje" },
        { locale: "en", path: "/en/pilgrimages" },
      ],
    });

    // The address is the operator's, not /tours, and the two locales share no
    // path component — which is exactly why a theme cannot derive one from the
    // other and why alternates has to be published.
    expect(context.path).toBe("/pelerinaje");
    expect(context.category.id).toBe("cat_pilgrimages");
    expect(context.products).toHaveLength(1);
    expect(catalogProductCategorySchema.parse(pilgrimages).id).toBe(
      "cat_pilgrimages",
    );
    expect(context.alternates.map(({ path }) => path)).toEqual([
      "/pelerinaje",
      "/en/pilgrimages",
    ]);
  });

  it("leaves membership to the catalog capability rather than the publication", () => {
    const context = categoryDetailContextSchema.parse({
      ...tourContextBase(),
      kind: "categoryDetail",
      path: "/pelerinaje",
      slug: "pelerinaje",
      title: "Pelerinaje",
      category: {
        id: "cat_pilgrimages",
        name: "Pelerinaje",
        slug: "pelerinaje",
      },
    });

    // Absent rather than empty. A theme can tell "this publication carries no
    // listing, ask catalog.search.v1?categoryId=" from "this category is
    // genuinely empty", which an empty array would have collapsed together.
    expect(context.products).toBeUndefined();
  });

  it("routes a category through the public page union", () => {
    expect(
      themePageContextSchema.parse({
        ...tourContextBase(),
        kind: "categoryDetail",
        path: "/city-break",
        slug: "city-break",
        title: "City break",
        category: { id: "cat_city", name: "City break", slug: "city-break" },
        products: [],
      }).kind,
    ).toBe("categoryDetail");
  });

  it("keeps a category free of commercial snapshots like any other catalog page", () => {
    expect(
      categoryDetailContextSchema.safeParse({
        ...tourContextBase(),
        kind: "categoryDetail",
        path: "/pelerinaje",
        slug: "pelerinaje",
        title: "Pelerinaje",
        category: { id: "c", name: "P", slug: "pelerinaje" },
        products: [],
        pricing: { from: 1200 },
      }).success,
    ).toBe(false);
  });

  it("defaults alternates to empty so a single-locale theme needs no guard", () => {
    expect(
      tourIndexContextSchema.parse({
        ...tourContextBase(),
        kind: "tourIndex",
        path: "/tours",
        title: "Tours",
        products: [],
      }).alternates,
    ).toEqual([]);
  });

  it("rejects commercial state attached to the immutable page itself", () => {
    expect(
      tourIndexContextSchema.safeParse({
        ...tourContextBase(),
        kind: "tourIndex",
        path: "/tours",
        title: "Tours",
        products: [],
        availability: [],
      }).success,
    ).toBe(false);
  });

  it("accepts a secret-free live capability envelope with relative endpoints", () => {
    const parsed = tourIndexContextSchema.parse({
      ...tourContextBase(),
      kind: "tourIndex",
      path: "/tours",
      title: "Tours",
      products: [],
      live: {
        capabilities: [
          {
            id: "catalog.search.v1",
            available: true,
            methods: ["GET"],
            endpoint: "/v1/public/theme/catalog-search",
          },
          { id: "checkout.v1", available: false, methods: ["POST"] },
        ],
      },
    });

    expect(parsed.live?.capabilities).toHaveLength(2);
  });

  it("adds no write to the catalog, operator or legal surface", () => {
    // Everything a theme can call to browse, describe or explain the operator
    // is a read. Writes stay confined to the pricing/quote/booking/checkout
    // operations that existed before, so widening what a theme can render
    // never widens what an anonymous visitor can cause.
    const readOnly = THEME_CAPABILITY_IDS.filter(
      (id) =>
        id.startsWith("operator.") ||
        id.startsWith("legal.") ||
        [
          "catalog.search.v1",
          "catalog.product-detail.v1",
          "catalog.markets.v1",
          "catalog.categories.v1",
          "catalog.destinations.v1",
          "catalog.tags.v1",
          "catalog.product-by-slug.v1",
          "catalog.departures.v1",
          "catalog.offers.v1",
          "catalog.extensions.v1",
        ].includes(id),
    );

    expect(readOnly.length).toBeGreaterThan(10);
    for (const id of readOnly) {
      expect(THEME_CAPABILITY_METHODS[id], id).toEqual(["GET"]);
    }
  });

  it("accepts the exact method allowlist for every stable capability", () => {
    const parsed = tourIndexContextSchema.parse({
      ...tourContextBase(),
      kind: "tourIndex",
      path: "/tours",
      title: "Tours",
      products: [],
      live: {
        capabilities: THEME_CAPABILITY_IDS.map((id) => ({
          id,
          available: true,
          methods: [...THEME_CAPABILITY_METHODS[id]],
          endpoint: `/v1/public/theme/${id}`,
        })),
      },
    });

    expect(parsed.live?.capabilities.map(({ id }) => id)).toEqual(
      THEME_CAPABILITY_IDS,
    );
  });

  it("accepts the coordinated same-origin shopping capability routes", () => {
    const parsed = tourIndexContextSchema.parse({
      ...tourContextBase(),
      kind: "tourIndex",
      path: "/tours",
      title: "Tours",
      products: [],
      live: {
        capabilities: [
          {
            id: "shopping.search.v1",
            available: true,
            methods: ["POST"],
            endpoint: "/v1/public/theme/shopping/search",
          },
          {
            id: "shopping.trip-selections.v1",
            available: true,
            methods: ["POST", "PATCH"],
            endpoint: "/v1/public/theme/shopping/trip-selections",
          },
          {
            id: "shopping.trip-booking.v1",
            available: true,
            methods: ["POST"],
            endpoint: "/v1/public/theme/shopping/trip-selections/book",
          },
        ],
      },
    });

    expect(parsed.live?.capabilities).toEqual([
      {
        id: "shopping.search.v1",
        available: true,
        methods: ["POST"],
        endpoint: "/v1/public/theme/shopping/search",
      },
      {
        id: "shopping.trip-selections.v1",
        available: true,
        methods: ["POST", "PATCH"],
        endpoint: "/v1/public/theme/shopping/trip-selections",
      },
      {
        id: "shopping.trip-booking.v1",
        available: true,
        methods: ["POST"],
        endpoint: "/v1/public/theme/shopping/trip-selections/book",
      },
    ]);
  });

  it.each([
    "https://api.example/catalog",
    "//api.example/catalog",
    "catalog/search",
    "/v1/public/catalog/search?token=secret",
  ])("rejects a non-relative capability endpoint: %s", (endpoint) => {
    expect(
      tourIndexContextSchema.safeParse({
        ...tourContextBase(),
        kind: "tourIndex",
        path: "/tours",
        title: "Tours",
        products: [],
        live: {
          capabilities: [
            {
              id: "catalog.search.v1",
              available: true,
              methods: ["GET"],
              endpoint,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects implementation detail or secrets in the live envelope", () => {
    expect(
      tourIndexContextSchema.safeParse({
        ...tourContextBase(),
        kind: "tourIndex",
        path: "/tours",
        title: "Tours",
        products: [],
        live: {
          capabilities: [],
          provider: "internal-booking-engine",
          token: "secret",
        },
      }).success,
    ).toBe(false);
    expect(
      tourIndexContextSchema.safeParse({
        ...tourContextBase(),
        kind: "tourIndex",
        path: "/tours",
        title: "Tours",
        products: [],
        live: {
          capabilities: [
            {
              id: "checkout.v1",
              available: true,
              methods: ["POST"],
              endpoint: "/v1/public/theme/checkout",
              token: "secret",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a method outside a capability's stable allowlist", () => {
    expect(
      tourIndexContextSchema.safeParse({
        ...tourContextBase(),
        kind: "tourIndex",
        path: "/tours",
        title: "Tours",
        products: [],
        live: {
          capabilities: [
            {
              id: "catalog.search.v1",
              available: true,
              methods: ["POST"],
              endpoint: "/v1/public/theme/catalog-search",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    { available: true },
    {
      available: false,
      endpoint: "/v1/public/theme/catalog-search",
    },
  ])("requires endpoints exactly when a capability is available", (state) => {
    expect(
      tourIndexContextSchema.safeParse({
        ...tourContextBase(),
        kind: "tourIndex",
        path: "/tours",
        title: "Tours",
        products: [],
        live: {
          capabilities: [
            {
              id: "catalog.search.v1",
              methods: ["GET"],
              ...state,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});

describe("content bindings", () => {
  it("declares the slots a theme renders, independent of any site's field ids", () => {
    const manifest = themeManifestSchema.parse({
      id: "bucharest",
      name: "Bucharest",
      version: "1.0.0",
      routes: [{ id: "home", pattern: "/", context: "home" }],
      contentBindings: [
        {
          id: "guides",
          name: "Travel guides",
          fields: [
            { id: "summary", label: "Summary", type: "text", required: true },
            { id: "hero", label: "Hero image", type: "image" },
          ],
        },
      ],
    });

    expect(manifest.contentBindings[0]?.fields.map((f) => f.id)).toEqual([
      "summary",
      "hero",
    ]);
    expect(manifest.contentBindings[0]?.fields[0]?.required).toBe(true);
  });

  it("defaults to no bindings so a theme that declares none still parses", () => {
    const manifest = themeManifestSchema.parse({
      id: "bucharest",
      name: "Bucharest",
      version: "1.0.0",
      routes: [{ id: "home", pattern: "/", context: "home" }],
    });
    expect(manifest.contentBindings).toEqual([]);
  });

  it("carries projected slot values on an entry, beside the operator's own", () => {
    const entry = collectionEntrySchema.parse({
      id: "delta",
      slug: "delta",
      title: "The Danube delta",
      values: { abstract: "Channels and reed beds." },
      binding: { summary: "Channels and reed beds." },
    });

    // The theme reads the slot; the operator's id stays available for a theme
    // rendering its own collections rather than a bound one.
    expect(entry.binding?.summary).toBe("Channels and reed beds.");
    expect(entry.values.abstract).toBe("Channels and reed beds.");
  });

  it("leaves binding absent for an unbound collection", () => {
    const entry = collectionEntrySchema.parse({
      id: "delta",
      slug: "delta",
      title: "The Danube delta",
      values: {},
    });
    expect(entry.binding).toBeUndefined();
  });
});
