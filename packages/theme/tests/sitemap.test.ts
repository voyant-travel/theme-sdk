import { describe, expect, it } from "vitest";
import {
  createSitemap,
  SITEMAP_URL_LIMIT,
  type SitemapEntry,
  SitemapError,
  type SitemapIncompleteLocaleSet,
  type SitemapOptions,
} from "../src/index.js";

const bilingual: { locales: string[]; defaultLocale: string } = {
  locales: ["ro", "en"],
  defaultLocale: "ro",
};

function get(url: string, method = "GET"): { request: Request } {
  return { request: new Request(url, { method }) };
}

function byLocale(
  entries: Record<string, SitemapEntry[]>,
): SitemapOptions["entries"] {
  return ({ locale }) => entries[locale] ?? [];
}

async function bodyOf(
  options: SitemapOptions,
  url = "https://tours.example/sitemap.xml",
): Promise<string> {
  const response = await createSitemap(options)(get(url));
  return await response.text();
}

const pilgrimages = {
  ro: [{ id: "category:1", path: "/pelerinaje" }],
  en: [{ id: "category:1", path: "/en/pilgrimages" }],
} satisfies Record<string, SitemapEntry[]>;

describe("sitemap alternates", () => {
  it("groups one resource's differing per-locale paths into a single cluster", async () => {
    const body = await bodyOf({ ...bilingual, entries: byLocale(pilgrimages) });

    /*
     * Two addresses, two <url> elements, one resource. Grouping by path could
     * not have produced this: the paths are what differ.
     */
    expect(body.match(/<loc>/g)).toHaveLength(2);
    expect(body).toContain("<loc>https://tours.example/pelerinaje</loc>");
    expect(body).toContain("<loc>https://tours.example/en/pilgrimages</loc>");
  });

  it("names every locale plus x-default on every URL in the cluster", async () => {
    const body = await bodyOf({ ...bilingual, entries: byLocale(pilgrimages) });

    const urls = body.match(/ {2}<url>[\s\S]*?<\/url>/g) ?? [];
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url).toContain(
        '<xhtml:link rel="alternate" hreflang="ro" href="https://tours.example/pelerinaje" />',
      );
      expect(url).toContain(
        '<xhtml:link rel="alternate" hreflang="en" href="https://tours.example/en/pilgrimages" />',
      );
      expect(url).toContain(
        '<xhtml:link rel="alternate" hreflang="x-default" href="https://tours.example/pelerinaje" />',
      );
    }
  });

  it("points x-default at the default locale rather than the first one", async () => {
    const body = await bodyOf({
      locales: ["ro", "en"],
      defaultLocale: "en",
      entries: byLocale(pilgrimages),
    });

    expect(body).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://tours.example/en/pilgrimages" />',
    );
    expect(body).not.toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://tours.example/pelerinaje" />',
    );
  });

  it("declares the xhtml namespace the alternate links live in", async () => {
    const body = await bodyOf({ ...bilingual, entries: byLocale(pilgrimages) });

    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    );
  });

  it("carries the optional per-locale hints on the URL they belong to", async () => {
    const body = await bodyOf({
      ...bilingual,
      entries: byLocale({
        ro: [
          {
            id: "tour:1",
            path: "/tururi/deltă",
            lastmod: "2026-08-14",
            changefreq: "weekly",
            priority: 0.8,
          },
        ],
        en: [{ id: "tour:1", path: "/en/tours/delta" }],
      }),
    });

    expect(body).toContain("<lastmod>2026-08-14</lastmod>");
    expect(body).toContain("<changefreq>weekly</changefreq>");
    expect(body).toContain("<priority>0.8</priority>");
    expect(body.match(/<lastmod>/g)).toHaveLength(1);
  });
});

describe("sitemap incomplete locale sets", () => {
  const partial = {
    ro: [
      { id: "tour:1", path: "/tururi/delta" },
      { id: "page:about", path: "/despre" },
    ],
    en: [{ id: "tour:1", path: "/en/tours/delta" }],
  } satisfies Record<string, SitemapEntry[]>;

  it("omits a resource missing from a locale by default", async () => {
    const body = await bodyOf({ ...bilingual, entries: byLocale(partial) });

    expect(body).toContain("/tururi/delta");
    expect(body).not.toContain("/despre");
  });

  it("reports every incomplete resource so the gap is visible", async () => {
    const reports: SitemapIncompleteLocaleSet[] = [];
    await bodyOf({
      ...bilingual,
      entries: byLocale(partial),
      onIncompleteLocaleSet: (report) => reports.push(report),
    });

    expect(reports).toEqual([
      {
        id: "page:about",
        presentLocales: ["ro"],
        missingLocales: ["en"],
        policy: "omit",
      },
    ]);
  });

  it("emits an incomplete resource with no alternates at all when asked to", async () => {
    const body = await bodyOf({
      ...bilingual,
      entries: byLocale(partial),
      incompleteLocaleSet: "emitWithoutAlternates",
    });

    const about =
      body.match(/ {2}<url>\s*<loc>[^<]*\/despre<\/loc>[\s\S]*?<\/url>/)?.[0] ??
      "";
    expect(about).toContain("<loc>https://tours.example/despre</loc>");
    // Never a partial cluster: no alternate at all rather than one that names
    // only the locales that happen to exist.
    expect(about).not.toContain("xhtml:link");
  });

  it("still reports under the permissive policy", async () => {
    const reports: SitemapIncompleteLocaleSet[] = [];
    await bodyOf({
      ...bilingual,
      entries: byLocale(partial),
      incompleteLocaleSet: "emitWithoutAlternates",
      onIncompleteLocaleSet: (report) => reports.push(report),
    });

    expect(reports.map((report) => report.policy)).toEqual([
      "emitWithoutAlternates",
    ]);
  });
});

describe("sitemap XML escaping", () => {
  it("escapes reserved characters in generated locations", async () => {
    const body = await bodyOf({
      ...bilingual,
      entries: byLocale({
        ro: [{ id: "tour:1", path: "/cauta?a=1&b=2" }],
        en: [{ id: "tour:1", path: "/en/search?a=1&b=2" }],
      }),
    });

    expect(body).toContain(
      "<loc>https://tours.example/cauta?a=1&amp;b=2</loc>",
    );
    expect(body).not.toMatch(/<loc>[^<]*&(?!amp;)/);
    expect(body).toContain('href="https://tours.example/cauta?a=1&amp;b=2"');
  });

  it("percent-encodes non-ASCII paths before escaping them", async () => {
    const body = await bodyOf({
      ...bilingual,
      entries: byLocale({
        ro: [{ id: "tour:1", path: "/tururi/delta dunării" }],
        en: [{ id: "tour:1", path: "/en/tours/delta" }],
      }),
    });

    expect(body).toContain(
      "<loc>https://tours.example/tururi/delta%20dun%C4%83rii</loc>",
    );
  });

  it("rejects a protocol-relative path that would publish a foreign origin", async () => {
    const handler = createSitemap({
      ...bilingual,
      entries: byLocale({
        ro: [{ id: "tour:1", path: "//evil.example/tururi" }],
        en: [{ id: "tour:1", path: "/en/tours" }],
      }),
    });

    await expect(
      handler(get("https://tours.example/sitemap.xml")),
    ).rejects.toThrow();
  });
});

describe("sitemap request origin", () => {
  it.each([
    "https://tours.example",
    "https://preview-7f2.themes.voyant.travel",
    "http://localhost:4321",
  ])("absolutizes against the host the request arrived on: %s", async (origin) => {
    const body = await bodyOf(
      { ...bilingual, entries: byLocale(pilgrimages) },
      `${origin}/sitemap.xml`,
    );

    expect(body).toContain(`<loc>${origin}/pelerinaje</loc>`);
    expect(body).toContain(`href="${origin}/en/pilgrimages"`);
  });
});

describe("sitemap response", () => {
  it("serves XML with a cache policy a crawler can reuse", async () => {
    const response = await createSitemap({
      ...bilingual,
      entries: byLocale(pilgrimages),
    })(get("https://tours.example/sitemap.xml"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=60",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("lets a theme override the cache policy", async () => {
    const response = await createSitemap({
      ...bilingual,
      entries: byLocale(pilgrimages),
      cacheControl: "private, no-store",
    })(get("https://tours.example/sitemap.xml"));

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers HEAD with headers and no body", async () => {
    const response = await createSitemap({
      ...bilingual,
      entries: byLocale(pilgrimages),
    })(get("https://tours.example/sitemap.xml", "HEAD"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("refuses a method a crawler would never use", async () => {
    const response = await createSitemap({
      ...bilingual,
      entries: byLocale(pilgrimages),
    })(get("https://tours.example/sitemap.xml", "POST"));

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("serves a well-formed empty urlset for a site with no addresses", async () => {
    const body = await bodyOf({ ...bilingual, entries: () => [] });

    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");
    expect(body).not.toContain("<loc>");
  });
});

describe("sitemap index split", () => {
  const overCap = Math.ceil(SITEMAP_URL_LIMIT / 2) + 1;

  function bulk(prefix: string): SitemapEntry[] {
    return Array.from({ length: overCap }, (_unused, index) => ({
      id: `tour:${index}`,
      path: `${prefix}/${index}`,
    }));
  }

  const bulkOptions: SitemapOptions = {
    ...bilingual,
    entries: ({ locale }) =>
      locale === "ro" ? bulk("/tururi") : bulk("/en/tours"),
  };

  it("caps a single document at 50,000 URLs", () => {
    expect(SITEMAP_URL_LIMIT).toBe(50_000);
  });

  it("serves an index instead of an oversized urlset", async () => {
    const body = await bodyOf(bulkOptions);

    expect(body).toContain(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(body).toContain("<loc>https://tours.example/sitemap-1.xml</loc>");
    expect(body).toContain("<loc>https://tours.example/sitemap-2.xml</loc>");
    expect(body).not.toContain("<urlset");
  });

  it("serves each shard from the page-suffixed route, filled to the cap", async () => {
    const handler = createSitemap(bulkOptions);

    const first = await handler(get("https://tours.example/sitemap-1.xml"));
    const firstBody = await first.text();
    expect(first.status).toBe(200);
    expect(firstBody).toContain("<urlset");
    expect(firstBody.match(/<loc>/g)).toHaveLength(SITEMAP_URL_LIMIT);

    const second = await handler(get("https://tours.example/sitemap-2.xml"));
    const secondBody = await second.text();
    expect(secondBody.match(/<loc>/g)).toHaveLength(
      overCap * 2 - SITEMAP_URL_LIMIT,
    );
  });

  it("404s a shard beyond the split", async () => {
    const response = await createSitemap(bulkOptions)(
      get("https://tours.example/sitemap-9.xml"),
    );

    expect(response.status).toBe(404);
  });

  it("404s a shard route on a site that was never split", async () => {
    const response = await createSitemap({
      ...bilingual,
      entries: byLocale(pilgrimages),
    })(get("https://tours.example/sitemap-1.xml"));

    expect(response.status).toBe(404);
  });

  it("derives shard addresses from whatever route the theme mounted", async () => {
    const body = await bodyOf(
      bulkOptions,
      "https://tours.example/harta-site.xml",
    );

    expect(body).toContain("<loc>https://tours.example/harta-site-1.xml</loc>");
  });
});

describe("sitemap authoring failures", () => {
  it("refuses two resources claiming one address", async () => {
    const handler = createSitemap({
      ...bilingual,
      entries: byLocale({
        ro: [
          { id: "tour:1", path: "/tururi/delta" },
          { id: "tour:2", path: "/tururi/delta" },
        ],
        en: [],
      }),
    });

    await expect(
      handler(get("https://tours.example/sitemap.xml")),
    ).rejects.toThrow(SitemapError);
  });

  it("refuses one address serving two locales, which no cluster can describe", async () => {
    const handler = createSitemap({
      ...bilingual,
      entries: byLocale({
        ro: [{ id: "page:contact", path: "/contact" }],
        en: [{ id: "page:contact", path: "/contact" }],
      }),
    });

    await expect(
      handler(get("https://tours.example/sitemap.xml")),
    ).rejects.toThrow(SitemapError);
  });

  it("refuses a resource listed twice in one locale", async () => {
    const handler = createSitemap({
      ...bilingual,
      entries: byLocale({
        ro: [
          { id: "tour:1", path: "/tururi/delta" },
          { id: "tour:1", path: "/tururi/delta-dunarii" },
        ],
        en: [],
      }),
    });

    await expect(
      handler(get("https://tours.example/sitemap.xml")),
    ).rejects.toThrow(SitemapError);
  });

  it("refuses a default locale that is not one of the site's locales", () => {
    expect(() =>
      createSitemap({
        locales: ["ro", "en"],
        defaultLocale: "de",
        entries: () => [],
      }),
    ).toThrow(SitemapError);
  });

  it.each([
    { locales: [], defaultLocale: "ro" },
    { locales: ["ro"], defaultLocale: "not_a_locale" },
    { locales: ["ro"], defaultLocale: "ro", cacheControl: "" },
    { locales: ["ro", "ro"], defaultLocale: "ro" },
  ] as unknown[])("rejects unusable options: %j", (options) => {
    expect(() =>
      createSitemap({
        ...(options as SitemapOptions),
        entries: () => [],
      }),
    ).toThrow();
  });

  it.each([
    { id: "", path: "/a" },
    { id: "tour:1", path: "tururi" },
    { id: "tour:1", path: "/a", lastmod: "14-08-2026" },
    { id: "tour:1", path: "/a", changefreq: "sometimes" },
    { id: "tour:1", path: "/a", priority: 1.5 },
    { id: "tour:1", path: "/a", loc: "https://tours.example/a" },
  ] as unknown[])("rejects an unusable entry: %j", async (entry) => {
    const handler = createSitemap({
      ...bilingual,
      entries: () => [entry as SitemapEntry],
    });

    await expect(
      handler(get("https://tours.example/sitemap.xml")),
    ).rejects.toThrow();
  });
});

describe("sitemap entry loading", () => {
  it("asks for each locale once and awaits an async catalog", async () => {
    const asked: string[] = [];
    const body = await bodyOf({
      ...bilingual,
      entries: async ({ locale }) => {
        asked.push(locale);
        await Promise.resolve();
        return pilgrimages[locale as "ro" | "en"];
      },
    });

    expect(asked).toEqual(["ro", "en"]);
    expect(body.match(/<loc>/g)).toHaveLength(2);
  });
});
