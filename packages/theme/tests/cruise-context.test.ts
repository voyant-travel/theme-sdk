import { describe, expect, it } from "vitest";
import {
  CONTRACT_VERSION,
  cruiseDetailContextSchema,
  cruiseIndexContextSchema,
  cruiseSailingSchema,
  sailingDetailContextSchema,
  shipDetailContextSchema,
  THEME_CAPABILITY_METHODS,
  themeContextResponseSchema,
  themePageContextSchema,
} from "../src/index.js";

function contextBase() {
  return {
    locale: "en",
    site: { name: "Northstar" },
    navigation: [],
    menus: {},
    seo: { title: "Cruises" },
    settings: {},
  };
}

function port(extra: Record<string, unknown> = {}) {
  return { id: "athens", slug: "athens", name: "Athens", ...extra };
}

function cabin(extra: Record<string, unknown> = {}) {
  return { id: "balcony", slug: "balcony", name: "Balcony", ...extra };
}

function sailing(extra: Record<string, unknown> = {}) {
  return {
    id: "aurora-2027-05-08",
    slug: "aurora-2027-05-08",
    name: "Mediterranean light — 8 May 2027",
    cruiseId: "mediterranean-light",
    shipId: "aurora",
    departure: {
      startsOn: "2027-05-08",
      endsOn: "2027-05-15",
      durationNights: 7,
      embarkationPort: port(),
      disembarkationPort: port(),
    },
    itinerary: {
      id: "mediterranean-light-7n",
      name: "Mediterranean light",
      days: [{ dayNumber: 1, title: "Athens", ports: [port()] }],
    },
    cabinCategories: [cabin()],
    ...extra,
  };
}

function cruise(extra: Record<string, unknown> = {}) {
  return {
    id: "mediterranean-light",
    slug: "mediterranean-light",
    name: "Mediterranean light",
    ports: [port()],
    ships: [
      {
        id: "aurora",
        slug: "aurora",
        name: "Aurora",
        cabinCategories: [cabin()],
      },
    ],
    sailings: [sailing()],
    ...extra,
  };
}

describe("cruise publication contexts", () => {
  it("parses the four canonical page contexts through the public union", () => {
    const contexts = [
      {
        ...contextBase(),
        kind: "cruiseIndex",
        path: "/cruises",
        title: "Cruises",
        cruises: [cruise()],
      },
      {
        ...contextBase(),
        kind: "cruiseDetail",
        path: "/cruises/mediterranean-light",
        slug: "mediterranean-light",
        title: "Mediterranean light",
        cruise: cruise(),
      },
      {
        ...contextBase(),
        kind: "shipDetail",
        path: "/ships/aurora",
        slug: "aurora",
        title: "Aurora",
        ship: { id: "aurora", slug: "aurora", name: "Aurora" },
      },
      {
        ...contextBase(),
        kind: "sailingDetail",
        path: "/sailings/aurora-2027-05-08",
        slug: "aurora-2027-05-08",
        title: "Aurora, 8 May 2027",
        sailing: sailing(),
      },
    ];

    expect(
      contexts.map((value) => themePageContextSchema.parse(value).kind),
    ).toEqual(["cruiseIndex", "cruiseDetail", "shipDetail", "sailingDetail"]);
  });

  it("keeps itinerary and departure editorial data immutable and provider-neutral", () => {
    const parsed = cruiseSailingSchema.parse(sailing());
    expect(parsed.departure.startsOn).toBe("2027-05-08");
    expect(parsed.itinerary.days[0]?.ports[0]?.name).toBe("Athens");
    expect(parsed.cabinCategories[0]?.name).toBe("Balcony");
  });

  it.each([
    ["commercial", { editorial: { pricing: { amount: 1200 } } }],
    ["fare", { itinerary: { days: [{ fareCode: "FLEX" }] } }],
    ["promotion", { nested: [{ promotion: "SPRING" }] }],
    ["availability", { nested: { cabinAvailability: 4 } }],
    ["quote", { nested: { quoteId: "q_1" } }],
    ["booking", { nested: { booking: { id: "b_1" } } }],
    ["session", { nested: { sessionId: "s_1" } }],
    ["payment", { nested: { paymentStatus: "pending" } }],
    ["PII", { nested: { passengerEmail: "guest@example.test" } }],
    ["provider", { nested: { providerName: "internal" } }],
    ["source", { nested: { sourceSystem: "internal" } }],
    ["provenance", { nested: { provenance: { row: 7 } } }],
  ])("recursively rejects %s fields from immutable cruise data", (_label, leak) => {
    expect(
      cruiseDetailContextSchema.safeParse({
        ...contextBase(),
        kind: "cruiseDetail",
        path: "/cruises/mediterranean-light",
        slug: "mediterranean-light",
        title: "Mediterranean light",
        cruise: cruise(leak),
      }).success,
    ).toBe(false);
  });

  it("rejects leaks at context, ship, sailing, port, and cabin-category depth", () => {
    const cases = [
      cruiseIndexContextSchema.safeParse({
        ...contextBase(),
        kind: "cruiseIndex",
        path: "/cruises",
        title: "Cruises",
        cruises: [],
        customerEmail: "guest@example.test",
      }),
      shipDetailContextSchema.safeParse({
        ...contextBase(),
        kind: "shipDetail",
        path: "/ships/aurora",
        slug: "aurora",
        title: "Aurora",
        ship: { id: "aurora", slug: "aurora", name: "Aurora", providerId: "p" },
      }),
      sailingDetailContextSchema.safeParse({
        ...contextBase(),
        kind: "sailingDetail",
        path: "/sailings/aurora-2027-05-08",
        slug: "aurora-2027-05-08",
        title: "Aurora",
        sailing: sailing({ quote: {} }),
      }),
      cruiseDetailContextSchema.safeParse({
        ...contextBase(),
        kind: "cruiseDetail",
        path: "/cruises/mediterranean-light",
        slug: "mediterranean-light",
        title: "Cruise",
        cruise: cruise({ ports: [port({ sourceId: "port-1" })] }),
      }),
      cruiseDetailContextSchema.safeParse({
        ...contextBase(),
        kind: "cruiseDetail",
        path: "/cruises/mediterranean-light",
        slug: "mediterranean-light",
        title: "Cruise",
        cruise: cruise({
          ships: [
            {
              id: "aurora",
              slug: "aurora",
              name: "Aurora",
              cabinCategories: [cabin({ fareClass: "A" })],
            },
          ],
        }),
      }),
    ];
    expect(cases.every((result) => !result.success)).toBe(true);
  });

  it("publishes only same-origin provider-neutral live capabilities", () => {
    const context = cruiseIndexContextSchema.parse({
      ...contextBase(),
      kind: "cruiseIndex",
      path: "/cruises",
      title: "Cruises",
      cruises: [],
      live: {
        capabilities: [
          "cruise.search.v1",
          "cruise.sailing.v1",
          "cruise.pricing.v1",
          "cruise.quote.v1",
          "booking.session.v1",
          "checkout.v1",
        ].map((id) => ({
          id,
          available: true,
          methods:
            THEME_CAPABILITY_METHODS[
              id as keyof typeof THEME_CAPABILITY_METHODS
            ],
          endpoint: `/v1/public/theme/${id}`,
        })),
      },
    });
    expect(context.live?.capabilities).toHaveLength(6);
  });

  it("gives every cruise record a lead image under one name", () => {
    const image = {
      id: "m1",
      mediaType: "image",
      name: "Aurora at anchor",
      url: "https://cdn.example/aurora.jpg",
      altText: "A ship at anchor off a rocky coast",
    };
    const parsed = cruiseSailingSchema.parse(
      sailing({
        coverMedia: image,
        media: [image],
        cabinCategories: [cabin({ coverMedia: image })],
        itinerary: {
          id: "mediterranean-light-7n",
          name: "Mediterranean light",
          days: [
            {
              dayNumber: 1,
              title: "Athens",
              coverMedia: image,
              ports: [port({ coverMedia: image })],
            },
          ],
        },
      }),
    );

    expect(parsed.coverMedia?.url).toBe(image.url);
    expect(parsed.media[0]?.url).toBe(image.url);
    expect(parsed.cabinCategories[0]?.coverMedia?.altText).toBe(image.altText);
    expect(parsed.itinerary.days[0]?.coverMedia?.url).toBe(image.url);
    expect(parsed.itinerary.days[0]?.ports[0]?.coverMedia?.url).toBe(image.url);
  });

  it("reads an explicitly absent lead image the same way everywhere", () => {
    const parsed = cruiseSailingSchema.parse(
      sailing({
        coverMedia: null,
        cabinCategories: [cabin({ coverMedia: null })],
      }),
    );

    expect(parsed.coverMedia).toBeNull();
    expect(parsed.cabinCategories[0]?.coverMedia).toBeNull();
  });

  it("keeps v1alpha4 publications readable after stabilizing v1", () => {
    expect(
      themeContextResponseSchema.parse({
        contractVersion: "v1alpha4",
        context: {
          ...contextBase(),
          kind: "home",
          path: "/",
          title: "Home",
          sections: [],
        },
      }).contractVersion,
    ).toBe("v1alpha4");
    expect(CONTRACT_VERSION).toBe("v1");
  });
});
