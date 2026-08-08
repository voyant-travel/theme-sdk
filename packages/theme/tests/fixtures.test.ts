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
});
