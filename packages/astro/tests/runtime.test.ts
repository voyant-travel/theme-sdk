import { describe, expect, it, vi } from "vitest";
import {
  createThemeContextResolver,
  PUBLICATION_BINDING_NAMES,
  PUBLICATION_REQUEST_HEADERS,
  PUBLICATION_RESPONSE_HEADERS,
  ThemeRuntimeError,
  type VoyantPublicationBindings,
} from "../src/runtime.js";

const theme = {
  contractVersion: "v1alpha2" as const,
  manifest: {
    id: "runtime-test",
    name: "Runtime test",
    version: "0.1.0",
    routes: [
      { id: "home", pattern: "/", context: "home" as const },
      {
        id: "content",
        pattern: "/stories/[...path]",
        context: "content" as const,
      },
      { id: "not-found", pattern: "/404", context: "notFound" as const },
    ],
  },
  fixtures: {
    home: {
      kind: "home" as const,
      path: "/" as const,
      locale: "en",
      site: { name: "Fixture site" },
      seo: { title: "Fixture home" },
      title: "Fixture home",
    },
    content: [],
    notFound: {
      kind: "notFound" as const,
      path: "/404",
      locale: "en",
      site: { name: "Fixture site" },
      seo: { title: "Missing" },
      title: "Missing",
    },
  },
};

function publishedContext(path = "/stories/north") {
  return {
    contractVersion: "v1alpha2",
    context: {
      kind: "content",
      path,
      slug: "north",
      locale: "en",
      site: { name: "Published site" },
      navigation: [],
      menus: {},
      seo: { title: "Published story", noIndex: false },
      settings: {},
      title: "Published story",
      body: "Immutable release, current publication.",
    },
  };
}

function publishedResponse(
  body: {
    contractVersion: string;
    context: Record<string, unknown>;
  } = publishedContext(),
  locale = String(body.context.locale),
) {
  return Response.json(body, {
    headers: { [PUBLICATION_RESPONSE_HEADERS.locale]: locale },
  });
}

function bindings(
  fetch: VoyantPublicationBindings["PUBLICATION"]["fetch"],
): VoyantPublicationBindings {
  return {
    PUBLICATION: { fetch },
    VOYANT_PUBLICATION_TOKEN: "scoped-token",
    VOYANT_SITE_ID: "site_123",
    VOYANT_PUBLICATION_ID: "pub_456",
    VOYANT_THEME_RELEASE_ID: "release_789",
  };
}

describe("createThemeContextResolver", () => {
  it("rejects an invalid contract before rendering", () => {
    expect(() =>
      createThemeContextResolver({ contractVersion: "future" } as never),
    ).toThrow("THEME_SCHEMA_INVALID");
  });

  it("uses local fixtures when the complete production binding set is absent", async () => {
    const resolve = createThemeContextResolver(theme);

    await expect(resolve("http://localhost:4321/")).resolves.toMatchObject({
      kind: "home",
      title: "Fixture home",
    });
  });

  it("loads a v1alpha2 context through the scoped publication Fetcher", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) =>
      publishedResponse(),
    );
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/stories/north?locale=en#section",
        bindings(fetch),
      ),
    ).resolves.toMatchObject({ kind: "content", title: "Published story" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new Error("Expected a Request.");
    expect(request.url).toBe("https://north.example/stories/north?locale=en");
    expect(request.headers.get("authorization")).toBe("Bearer scoped-token");
    expect(request.headers.get(PUBLICATION_REQUEST_HEADERS.siteId)).toBe(
      "site_123",
    );
    expect(request.headers.get(PUBLICATION_REQUEST_HEADERS.publicationId)).toBe(
      "pub_456",
    );
    expect(request.headers.get(PUBLICATION_REQUEST_HEADERS.releaseId)).toBe(
      "release_789",
    );
    expect(
      request.headers.get(PUBLICATION_REQUEST_HEADERS.contractVersion),
    ).toBe("v1alpha2");
  });

  it("renders a publication that grew fields this release predates", async () => {
    const published = publishedContext();
    const grown = {
      ...published,
      context: { ...published.context, readingMinutes: 4 },
    };
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/stories/north?locale=en",
        bindings(async () => publishedResponse(grown)),
      ),
    ).resolves.toMatchObject({ kind: "content", readingMinutes: 4 });
  });

  it("serves a publication materialized before this release existed", async () => {
    // A site whose theme has been redeployed but whose content has not been
    // republished: v1alpha1 objects, no seo, title carrying the document title.
    const published = publishedContext();
    const { menus: _menus, seo: _seo, ...legacyContext } = published.context;
    const legacy = { contractVersion: "v1alpha1", context: legacyContext };
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/stories/north?locale=en",
        bindings(async () => publishedResponse(legacy)),
      ),
    ).resolves.toMatchObject({
      kind: "content",
      seo: { title: "Published story", noIndex: false },
      menus: {},
    });
  });

  it("matches a localized public URL to its locale-independent context path", async () => {
    const localized = publishedContext("/stories/north");
    localized.context.locale = "fr";
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/fr/stories/north?locale=fr",
        bindings(async () => publishedResponse(localized)),
      ),
    ).resolves.toMatchObject({
      locale: "fr",
      path: "/stories/north",
    });
  });

  it("fails closed when only part of the production binding set is present", async () => {
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve("https://north.example/", {
        PUBLICATION: { fetch: vi.fn() },
        VOYANT_SITE_ID: "site_123",
      }),
    ).rejects.toMatchObject({ code: "THEME_RUNTIME_BINDINGS_INVALID" });
  });

  it.each([
    ["reader error", new Response(null, { status: 503 })],
    [
      "future contract",
      publishedResponse({ ...publishedContext(), contractVersion: "v2" }),
    ],
    ["wrong path", publishedResponse(publishedContext("/stories/elsewhere"))],
    ["malformed context", Response.json({ contractVersion: "v1alpha2" })],
  ])("fails closed for %s", async (_label, response) => {
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/stories/north?locale=en",
        bindings(async () => response.clone()),
      ),
    ).rejects.toBeInstanceOf(ThemeRuntimeError);
  });

  it.each([
    ["missing", Response.json(publishedContext())],
    ["mismatched", publishedResponse(publishedContext(), "fr")],
    [
      "malformed context locale",
      publishedResponse(
        {
          ...publishedContext(),
          context: { ...publishedContext().context, locale: "en_us" },
        },
        "en_us",
      ),
    ],
  ])("rejects a %s publication locale", async (_label, response) => {
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/stories/north?locale=en",
        bindings(async () => response.clone()),
      ),
    ).rejects.toMatchObject({ code: "THEME_CONTEXT_RESPONSE_INVALID" });
  });

  it("accepts the reader's typed not-found fallback", async () => {
    const fallback = {
      contractVersion: "v1alpha2",
      context: {
        kind: "notFound",
        path: "/404",
        locale: "en",
        site: { name: "Published site" },
        navigation: [],
        menus: {},
        seo: { title: "Not found", noIndex: true },
        settings: {},
        title: "Not found",
      },
    };
    const response = Response.json(fallback, {
      headers: {
        [PUBLICATION_RESPONSE_HEADERS.contextPath]: "/404",
        [PUBLICATION_RESPONSE_HEADERS.locale]: "en",
        [PUBLICATION_RESPONSE_HEADERS.requestedPath]: "/missing",
      },
      status: 404,
    });
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/missing?locale=en",
        bindings(async () => response.clone()),
      ),
    ).resolves.toMatchObject({ kind: "notFound", path: "/404" });
  });

  it("validates localized not-found headers against the content path", async () => {
    const fallback = {
      contractVersion: "v1alpha2",
      context: {
        kind: "notFound",
        path: "/404",
        locale: "fr",
        site: { name: "Published site" },
        navigation: [],
        menus: {},
        seo: { title: "Introuvable", noIndex: true },
        settings: {},
        title: "Introuvable",
      },
    };
    const response = Response.json(fallback, {
      headers: {
        [PUBLICATION_RESPONSE_HEADERS.contextPath]: "/404",
        [PUBLICATION_RESPONSE_HEADERS.locale]: "fr",
        [PUBLICATION_RESPONSE_HEADERS.requestedPath]: "/missing",
      },
      status: 404,
    });
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/fr/missing?locale=fr",
        bindings(async () => response.clone()),
      ),
    ).resolves.toMatchObject({ kind: "notFound", locale: "fr" });
  });

  it("keeps the public binding contract intentionally small", () => {
    expect(PUBLICATION_BINDING_NAMES).toEqual([
      "PUBLICATION",
      "VOYANT_PUBLICATION_TOKEN",
      "VOYANT_SITE_ID",
      "VOYANT_PUBLICATION_ID",
      "VOYANT_THEME_RELEASE_ID",
    ]);
  });

  it("fetches one context when the same page is resolved twice", async () => {
    // The page resolves its own context and the injection middleware resolves
    // it again after rendering. That must cost one fetch, not two.
    const fetch = vi.fn(async () => publishedResponse());
    const resolve = createThemeContextResolver(theme);
    const env = bindings(fetch);

    await resolve("https://north.example/stories/north", env);
    await resolve("https://north.example/stories/north", env);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("resolves a different publication separately", async () => {
    // A publication is immutable, so its id is what makes an entry reusable.
    // A new publication must never be answered from the previous one.
    const fetch = vi.fn(async () => publishedResponse());
    const resolve = createThemeContextResolver(theme);

    await resolve("https://north.example/stories/north", bindings(fetch));
    await resolve("https://north.example/stories/north", {
      ...bindings(fetch),
      VOYANT_PUBLICATION_ID: "pub_next",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("lets concurrent resolutions of the same page each fetch", async () => {
    // The cost of never caching a promise. Only the settled context is stored,
    // so two resolutions that overlap both fetch, and neither can end up
    // awaiting a promise that belongs to another request.
    const fetch = vi.fn(async () => publishedResponse());
    const resolve = createThemeContextResolver(theme);
    const env = bindings(fetch);

    await Promise.all([
      resolve("https://north.example/stories/north", env),
      resolve("https://north.example/stories/north", env),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failure", async () => {
    // Caching a rejection would keep failing every later request that landed
    // on this isolate, long after the cause had cleared.
    const fetch = vi
      .fn<VoyantPublicationBindings["PUBLICATION"]["fetch"]>()
      .mockRejectedValueOnce(new Error("unreachable"))
      .mockResolvedValueOnce(publishedResponse());
    const resolve = createThemeContextResolver(theme);
    const env = bindings(fetch);

    await expect(
      resolve("https://north.example/stories/north", env),
    ).rejects.toMatchObject({ code: "THEME_CONTEXT_FETCH_FAILED" });
    await expect(
      resolve("https://north.example/stories/north", env),
    ).resolves.toMatchObject({ kind: "content" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
