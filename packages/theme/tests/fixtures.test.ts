import { describe, expect, it } from "vitest";
import { checkThemeDefinition, createFixtureRouter } from "../src/index.js";
import { validTheme } from "./helpers.js";

describe("createFixtureRouter", () => {
  it("resolves home, content, and notFound contexts", () => {
    const checked = checkThemeDefinition(validTheme());
    if (!checked.theme) throw new Error("Test setup failed.");
    const router = createFixtureRouter(checked.theme);
    expect(router.resolve("/").kind).toBe("home");
    expect(router.resolve("https://example.test/stories/one/").kind).toBe(
      "content",
    );
    expect(router.resolve("/somewhere-else")).toMatchObject({
      kind: "notFound",
      path: "/somewhere-else",
    });
  });

  it("resolves collection index and entry fixtures at operator addresses", () => {
    const theme = validTheme();
    const base = {
      locale: "ro-RO",
      site: { name: "Test" },
      navigation: [],
      menus: {},
      settings: {},
    };
    const collection = {
      id: "stiri",
      name: "Stiri",
      fields: [{ id: "author", label: "Autor", type: "text" as const }],
    };
    const entry = {
      id: "prima",
      slug: "prima",
      path: "/stiri/prima",
      title: "Prima",
      values: { author: "Ana" },
    };
    theme.manifest.routes.push(
      { id: "collection", pattern: "/stiri", context: "collectionIndex" },
      {
        id: "collection-entry",
        pattern: "/stiri/[entry]",
        context: "collectionEntry",
      },
    );
    theme.fixtures.collectionIndex = [
      {
        ...base,
        kind: "collectionIndex",
        path: "/stiri",
        seo: { title: "Stiri" },
        title: "Stiri",
        collection,
        entries: [entry],
      },
    ];
    theme.fixtures.collectionEntry = [
      {
        ...base,
        kind: "collectionEntry",
        path: "/stiri/prima",
        seo: { title: "Prima" },
        title: "Prima",
        collection,
        entry,
      },
    ];

    const checked = checkThemeDefinition(theme);
    if (!checked.theme) throw new Error("Test setup failed.");
    const router = createFixtureRouter(checked.theme);

    // A collection lives wherever the operator put it, so both the index and
    // its entries are path-addressed rather than hung off a canonical prefix.
    expect(router.resolve("/stiri").kind).toBe("collectionIndex");
    expect(router.resolve("/stiri/prima/")).toMatchObject({
      kind: "collectionEntry",
      title: "Prima",
    });
  });

  it("keeps a theme without collection fixtures valid and falling through", () => {
    const checked = checkThemeDefinition(validTheme());
    if (!checked.theme) throw new Error("Test setup failed.");

    // Both slots default to empty, so themes written before they existed stay
    // valid and an unclaimed collection path still reaches notFound.
    expect(checked.ok).toBe(true);
    expect(checked.theme.fixtures.collectionIndex).toEqual([]);
    expect(checked.theme.fixtures.collectionEntry).toEqual([]);
    expect(createFixtureRouter(checked.theme).resolve("/stiri")).toMatchObject({
      kind: "notFound",
      path: "/stiri",
    });
  });

  it("resolves canonical tour index and detail fixtures", () => {
    const theme = validTheme();
    const base = {
      locale: "en",
      site: { name: "Test" },
      navigation: [],
      menus: {},
      settings: {},
    };
    theme.fixtures.tourIndex = {
      ...base,
      kind: "tourIndex",
      path: "/tours",
      seo: { title: "Tours" },
      title: "Tours",
      products: [],
    };
    theme.fixtures.tourDetail = [
      {
        ...base,
        kind: "tourDetail",
        path: "/tours/delta",
        slug: "delta",
        seo: { title: "The Danube delta" },
        title: "The Danube delta",
        product: {
          id: "delta",
          slug: "delta",
          name: "The Danube delta",
          bookingMode: "itinerary",
          capacityMode: "limited",
          categories: [],
          tags: [],
          destinations: [],
          locations: [],
          media: [],
          features: [],
          faqs: [],
        },
      },
    ];

    const checked = checkThemeDefinition(theme);
    if (!checked.theme) throw new Error("Test setup failed.");
    const router = createFixtureRouter(checked.theme);
    expect(router.resolve("/tours").kind).toBe("tourIndex");
    expect(router.resolve("/tours/delta/")).toMatchObject({
      kind: "tourDetail",
      slug: "delta",
    });
  });

  it("resolves cruise, ship, and sailing fixtures by canonical path", () => {
    const theme = validTheme();
    const base = {
      locale: "en",
      site: { name: "Test" },
      navigation: [],
      menus: {},
      settings: {},
      seo: { title: "Cruises" },
    };
    theme.fixtures.cruiseIndex = {
      ...base,
      kind: "cruiseIndex",
      path: "/cruises",
      title: "Cruises",
      cruises: [],
    };
    theme.fixtures.cruiseDetail = [
      {
        ...base,
        kind: "cruiseDetail",
        path: "/cruises/mediterranean-light",
        slug: "mediterranean-light",
        title: "Mediterranean light",
        cruise: {
          id: "mediterranean-light",
          slug: "mediterranean-light",
          name: "Mediterranean light",
        },
      },
    ];
    theme.fixtures.shipDetail = [
      {
        ...base,
        kind: "shipDetail",
        path: "/ships/aurora",
        slug: "aurora",
        title: "Aurora",
        ship: { id: "aurora", slug: "aurora", name: "Aurora" },
      },
    ];
    theme.fixtures.sailingDetail = [];

    const checked = checkThemeDefinition(theme);
    if (!checked.theme) throw new Error("Test setup failed.");
    const router = createFixtureRouter(checked.theme);
    expect(router.resolve("/cruises").kind).toBe("cruiseIndex");
    expect(router.resolve("/cruises/mediterranean-light").kind).toBe(
      "cruiseDetail",
    );
    expect(router.resolve("/ships/aurora").kind).toBe("shipDetail");
  });

  it("resolves a category fixture at the operator's own address", () => {
    const theme = validTheme();
    theme.manifest.routes.push({
      id: "category",
      pattern: "/[category]",
      context: "categoryDetail",
    });
    theme.fixtures.categoryDetail = [
      {
        kind: "categoryDetail",
        path: "/pelerinaje",
        slug: "pelerinaje",
        locale: "ro-RO",
        site: { name: "Test" },
        navigation: [],
        menus: {},
        seo: { title: "Pelerinaje" },
        settings: {},
        title: "Pelerinaje",
        category: {
          id: "cat_pilgrimages",
          name: "Pelerinaje",
          slug: "pelerinaje",
        },
      },
    ];

    const checked = checkThemeDefinition(theme);
    if (!checked.theme) throw new Error("Test setup failed.");
    const router = createFixtureRouter(checked.theme);

    // The address is the operator's own translated slug, not a canonical path
    // like /tours, so the fixture is path-addressed exactly as tour and cruise
    // detail fixtures are.
    expect(router.resolve("/pelerinaje/")).toMatchObject({
      kind: "categoryDetail",
      slug: "pelerinaje",
    });
  });

  it("keeps a theme without category fixtures valid and falling through", () => {
    const checked = checkThemeDefinition(validTheme());
    if (!checked.theme) throw new Error("Test setup failed.");

    // The slot defaults to empty, so themes written before it existed stay
    // valid and an unclaimed path still reaches notFound rather than a
    // half-populated category page.
    expect(checked.ok).toBe(true);
    expect(checked.theme.fixtures.categoryDetail).toEqual([]);
    expect(
      createFixtureRouter(checked.theme).resolve("/pelerinaje"),
    ).toMatchObject({
      kind: "notFound",
      path: "/pelerinaje",
    });
  });
});
