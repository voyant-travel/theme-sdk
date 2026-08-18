import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONNECTED_CONTEXT_TIMEOUT_MS,
  createThemeContextResolver,
  PUBLICATION_BINDING_NAMES,
  PUBLICATION_REQUEST_HEADERS,
  PUBLICATION_RESPONSE_HEADERS,
  readThemeDevelopmentRuntime,
  resolvePublicationSystemRoute,
  THEME_DEVELOPMENT_RUNTIME_ADAPTER_ID,
  THEME_DEVELOPMENT_RUNTIME_ENV_NAMES,
  ThemeRuntimeError,
  type VoyantPublicationBindings,
} from "../src/runtime.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const theme = {
  contractVersion: "v1" as const,
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

function developmentEnvironment(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    VOYANT_THEME_DEVELOPMENT_RUNTIME: JSON.stringify({
      schemaVersion: "voyant.theme-development-runtime.v1",
      sessionId: "session_123",
      themeId: "theme_123",
      siteId: "site_123",
      installationId: "installation_123",
      manifestDigest: "a".repeat(64),
      perspective: "development",
      contentEndpoint: "https://sandbox.onvoyant.com/theme-development/content",
      publicApiEndpoint:
        "https://sandbox.onvoyant.com/theme-development/public-api",
      editor: {
        baseUrl: "https://sandbox.onvoyant.com/theme-editor",
        protocolVersion: "voyant.theme-editor.v1",
      },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    VOYANT_THEME_DEVELOPMENT_RUNTIME_ADAPTER:
      THEME_DEVELOPMENT_RUNTIME_ADAPTER_ID,
    VOYANT_THEME_DEVELOPMENT_CAPABILITY: "private-capability",
    ...overrides,
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

  it("loads connected development context through a canonical private request", async () => {
    const connectedFetch = vi.fn(async (_request: RequestInfo | URL) =>
      publishedResponse(),
    );
    vi.stubGlobal("fetch", connectedFetch);
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "http://localhost:4321/stories/north?locale=en#selection",
        undefined,
        developmentEnvironment(),
      ),
    ).resolves.toMatchObject({ kind: "content", title: "Published story" });

    expect(connectedFetch).toHaveBeenCalledTimes(1);
    const request = connectedFetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new Error("Expected a Request.");
    expect(request.url).toBe(
      "https://sandbox.onvoyant.com/theme-development/content",
    );
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe(
      "Bearer private-capability",
    );
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(
      request.headers.get(PUBLICATION_REQUEST_HEADERS.contractVersion),
    ).toBe(theme.contractVersion);
    expect(request.headers.get("cookie")).toBeNull();
    expect(request.headers.get(PUBLICATION_REQUEST_HEADERS.siteId)).toBeNull();
    await expect(request.json()).resolves.toEqual({
      path: "/stories/north",
      perspective: "development",
      sessionId: "session_123",
      manifestDigest: "a".repeat(64),
    });
  });

  it("bounds a connected relay outage", async () => {
    vi.useFakeTimers();
    const connectedFetch = vi.fn(
      async (request: RequestInfo | URL): Promise<Response> =>
        new Promise((_resolve, reject) => {
          if (!(request instanceof Request)) {
            reject(new Error("Expected a Request."));
            return;
          }
          request.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", connectedFetch);
    const resolve = createThemeContextResolver(theme);
    const pending = resolve(
      "http://localhost:4321/stories/north",
      undefined,
      developmentEnvironment(),
    );

    const rejection = expect(pending).rejects.toMatchObject({
      code: "THEME_CONTEXT_FETCH_FAILED",
    });
    await vi.advanceTimersByTimeAsync(CONNECTED_CONTEXT_TIMEOUT_MS);
    await rejection;
    const request = connectedFetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).signal.aborted).toBe(true);
  });

  it("rejects outer whitespace instead of normalizing a capability", async () => {
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "http://localhost:4321/stories/north",
        undefined,
        developmentEnvironment({
          VOYANT_THEME_DEVELOPMENT_CAPABILITY: " private-capability ",
        }),
      ),
    ).rejects.toMatchObject({ code: "THEME_RUNTIME_BINDINGS_INVALID" });
  });

  it("fetches connected mutable content afresh for every resolution", async () => {
    const connectedFetch = vi.fn(async () => publishedResponse());
    vi.stubGlobal("fetch", connectedFetch);
    const resolve = createThemeContextResolver(theme);
    const environment = developmentEnvironment();

    await resolve(
      "http://localhost:4321/stories/north",
      undefined,
      environment,
    );
    await resolve(
      "http://localhost:4321/stories/north",
      undefined,
      environment,
    );

    expect(connectedFetch).toHaveBeenCalledTimes(2);
  });

  it("preserves managed publication precedence over connected development", async () => {
    const publicationFetch = vi.fn(async () => publishedResponse());
    const connectedFetch = vi.fn(async () => publishedResponse());
    vi.stubGlobal("fetch", connectedFetch);
    const resolve = createThemeContextResolver(theme);

    await resolve(
      "https://north.example/stories/north",
      bindings(publicationFetch),
      developmentEnvironment({
        VOYANT_THEME_DEVELOPMENT_RUNTIME: "not json",
      }),
    );

    expect(publicationFetch).toHaveBeenCalledTimes(1);
    expect(connectedFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["partial", { VOYANT_THEME_DEVELOPMENT_RUNTIME: "{}" }],
    [
      "wrong Adapter",
      developmentEnvironment({
        VOYANT_THEME_DEVELOPMENT_RUNTIME_ADAPTER: "other-platform",
      }),
    ],
    [
      "malformed descriptor",
      developmentEnvironment({ VOYANT_THEME_DEVELOPMENT_RUNTIME: "not json" }),
    ],
    [
      "expired descriptor",
      developmentEnvironment({
        VOYANT_THEME_DEVELOPMENT_RUNTIME: JSON.stringify({
          ...JSON.parse(
            String(developmentEnvironment().VOYANT_THEME_DEVELOPMENT_RUNTIME),
          ),
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      }),
    ],
  ])("fails closed for %s connected configuration", async (_label, env) => {
    const connectedFetch = vi.fn(async () => publishedResponse());
    vi.stubGlobal("fetch", connectedFetch);
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve("http://localhost:4321/stories/north", undefined, env),
    ).rejects.toMatchObject({ code: "THEME_RUNTIME_BINDINGS_INVALID" });
    expect(connectedFetch).not.toHaveBeenCalled();
  });

  it("does not let connected configuration bypass partial managed bindings", async () => {
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "https://north.example/stories/north",
        { VOYANT_SITE_ID: "site_123" },
        developmentEnvironment(),
      ),
    ).rejects.toMatchObject({ code: "THEME_RUNTIME_BINDINGS_INVALID" });
  });

  it("uses the publication validator for connected response path and locale", async () => {
    const connectedFetch = vi.fn(async () =>
      publishedResponse(publishedContext("/stories/elsewhere"), "fr"),
    );
    vi.stubGlobal("fetch", connectedFetch);
    const resolve = createThemeContextResolver(theme);

    await expect(
      resolve(
        "http://localhost:4321/stories/north",
        undefined,
        developmentEnvironment(),
      ),
    ).rejects.toMatchObject({ code: "THEME_CONTEXT_RESPONSE_INVALID" });
  });

  it("requests its own contract version and reads an older publication", async () => {
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
    // A theme asks for the version it was built against, and accepts any
    // readable one in the answer. The response here is a v1alpha2 envelope, so
    // this covers both halves at once. Asserted against the theme's own
    // declaration rather than a literal, so bumping the contract cannot quietly
    // turn this into a test of the wrong version.
    expect(
      request.headers.get(PUBLICATION_REQUEST_HEADERS.contractVersion),
    ).toBe(theme.contractVersion);
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

  it("keeps the connected environment contract private and intentionally small", () => {
    expect(THEME_DEVELOPMENT_RUNTIME_ENV_NAMES).toEqual([
      "VOYANT_THEME_DEVELOPMENT_RUNTIME",
      "VOYANT_THEME_DEVELOPMENT_RUNTIME_ADAPTER",
      "VOYANT_THEME_DEVELOPMENT_CAPABILITY",
    ]);
    expect(readThemeDevelopmentRuntime(developmentEnvironment())).toMatchObject(
      {
        capability: "private-capability",
        descriptor: { sessionId: "session_123" },
      },
    );
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

describe("resolvePublicationSystemRoute", () => {
  it("proxies platform discovery routes with only trusted publication headers", async () => {
    const fetch = vi.fn<VoyantPublicationBindings["PUBLICATION"]["fetch"]>(
      async () =>
        new Response("Not found", {
          status: 404,
          headers: { "cache-control": "private, no-store" },
        }),
    );
    const response = await resolvePublicationSystemRoute(
      new Request("https://north.example/sitemap.xml?ignored=1", {
        headers: {
          authorization: "Bearer browser-token",
          cookie: "session=browser",
          "x-voyant-site-id": "spoofed",
        },
      }),
      bindings(fetch),
    );

    expect(response?.status).toBe(404);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new Error("Expected a Request.");
    expect(request.url).toBe("https://north.example/sitemap.xml?ignored=1");
    expect(request.method).toBe("GET");
    expect(request.headers.get("accept")).toBe("application/xml");
    expect(request.headers.get("authorization")).toBe("Bearer scoped-token");
    expect(request.headers.get("cookie")).toBeNull();
    expect(request.headers.get(PUBLICATION_REQUEST_HEADERS.siteId)).toBe(
      "site_123",
    );
  });

  it("preserves HEAD and leaves non-system or local-fixture routes alone", async () => {
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      expect(request).toBeInstanceOf(Request);
      expect((request as Request).method).toBe("HEAD");
      expect((request as Request).headers.get("accept")).toBe("text/plain");
      return new Response(null, { status: 200 });
    });

    await expect(
      resolvePublicationSystemRoute(
        new Request("https://north.example/robots.txt", { method: "HEAD" }),
        bindings(fetch),
      ),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      resolvePublicationSystemRoute(
        new Request("https://north.example/stories/north"),
        bindings(fetch),
      ),
    ).resolves.toBeUndefined();
    await expect(
      resolvePublicationSystemRoute(
        new Request("https://localhost:4321/sitemap.xml"),
      ),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
