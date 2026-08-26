import { z } from "zod";
import { localeSchema } from "./contract.js";

/*
 * A sitemap helper exists for hreflang, not for XML.
 *
 * Emitting `<url><loc>` needs no SDK. What needs one is the alternate set: a
 * theme's addresses differ per locale — `/pelerinaje` and `/pilgrimages` are
 * one page with two addresses — and hreflang is only honored when every URL in
 * a cluster names every other one, itself included. Get that partially right
 * and search engines discard the annotation silently, which is the same
 * observable outcome as never having emitted it. Centralizing it here is the
 * difference between one implementation being correct and every theme being
 * subtly wrong for months.
 *
 * Entries are therefore grouped by a stable `id` across locales, exactly as the
 * platform's `discovery` document groups by resource id with `alternates` and
 * an `xDefaultPath`. Grouping by path cannot express this, because the paths
 * are the part that differs.
 *
 * This is a request handler rather than a build step because themes are SSR
 * Workers and the catalog moves independently of releases. A file written at
 * build time is stale the moment a tour is added, renamed or retired, which is
 * precisely the staleness that removing the baked catalog snapshot is meant to
 * end.
 */

/**
 * The sitemaps.org ceiling on a single `urlset`: 50,000 URLs.
 *
 * Above it a document is rejected outright rather than truncated, so the helper
 * splits into shards and serves an index instead.
 */
export const SITEMAP_URL_LIMIT = 50_000;

/**
 * The sitemaps.org ceiling on a single uncompressed document: 50MiB.
 *
 * A URL count well under the limit can still exceed this once paths are long
 * and every entry carries an alternate link per locale, so both caps are
 * enforced.
 */
export const SITEMAP_BYTE_LIMIT = 50 * 1024 * 1024;

const DEFAULT_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=60";

/*
 * W3C Datetime, the only format sitemaps.org accepts for `lastmod`: a complete
 * date, optionally with a time that carries an explicit zone. A bare local
 * timestamp is ambiguous and crawlers treat the whole element as invalid.
 */
const W3C_DATETIME =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

export const sitemapChangefreqSchema = z.enum([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

export type SitemapChangefreq = z.infer<typeof sitemapChangefreqSchema>;

export const sitemapEntrySchema = z.strictObject({
  /**
   * The resource this address points at, stable across locales.
   *
   * This is the grouping key, so it must be the same string in every locale
   * that has the page — `tour:42`, not the slug.
   */
  id: z.string().min(1),
  /**
   * A root-relative path. Protocol-relative paths are rejected: `//example.com`
   * is a valid start-with-slash string that `URL` resolves to a foreign origin,
   * which would publish someone else's domain in this site's sitemap.
   */
  path: z
    .string()
    .startsWith("/")
    .refine((value) => !value.startsWith("//"), {
      message: "Use a root-relative path, not a protocol-relative URL.",
    }),
  lastmod: z
    .string()
    .regex(W3C_DATETIME, "Use a W3C datetime with an explicit zone.")
    .optional(),
  changefreq: sitemapChangefreqSchema.optional(),
  priority: z.number().min(0).max(1).optional(),
});

export type SitemapEntry = z.infer<typeof sitemapEntrySchema>;

const sitemapEntriesSchema = z.array(sitemapEntrySchema);

/**
 * What to do with a resource that exists in some locales but not all.
 *
 * `omit` keeps it out of the sitemap entirely. `emitWithoutAlternates` publishes
 * every address it does have with no `xhtml:link` at all. Neither ever emits a
 * partial cluster, because a cluster that names only some of its members is the
 * one outcome search engines discard without saying so.
 */
export const sitemapIncompleteLocaleSetPolicySchema = z.enum([
  "omit",
  "emitWithoutAlternates",
]);

export type SitemapIncompleteLocaleSetPolicy = z.infer<
  typeof sitemapIncompleteLocaleSetPolicySchema
>;

export type SitemapIncompleteLocaleSet = {
  id: string;
  presentLocales: string[];
  missingLocales: string[];
  policy: SitemapIncompleteLocaleSetPolicy;
};

export type SitemapEntriesInput = { locale: string };

export type SitemapEntriesLoader = (
  input: SitemapEntriesInput,
) => Promise<SitemapEntry[]> | SitemapEntry[];

export type SitemapContext = { request: Request };

export type SitemapHandler = (context: SitemapContext) => Promise<Response>;

/**
 * Raised when the entries a theme supplied cannot describe a coherent site.
 *
 * These are authoring or content defects — one address claimed by two
 * resources, one resource listed twice in a locale — that produce an
 * unsatisfiable hreflang graph. The helper refuses rather than publishing a
 * document that looks well-formed and is quietly ignored.
 */
export class SitemapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitemapError";
  }
}

const optionsSchema = z.strictObject({
  locales: z.array(localeSchema).min(1),
  defaultLocale: localeSchema,
  entries: z.custom<SitemapEntriesLoader>(
    (value) => typeof value === "function",
    { message: "Provide an entries function." },
  ),
  /**
   * Defaults to `omit`. See `sitemapIncompleteLocaleSetPolicySchema` for why
   * neither option emits a partial cluster.
   */
  incompleteLocaleSet: sitemapIncompleteLocaleSetPolicySchema.default("omit"),
  /**
   * Called once per resource whose locale set is incomplete, whichever policy
   * is in force. An incomplete set is usually a content gap rather than an
   * intention, so it is reported rather than absorbed.
   */
  onIncompleteLocaleSet: z
    .custom<(report: SitemapIncompleteLocaleSet) => void>(
      (value) => typeof value === "function",
      { message: "Provide a reporting function." },
    )
    .optional(),
  cacheControl: z.string().min(1).default(DEFAULT_CACHE_CONTROL),
});

export type SitemapOptions = z.input<typeof optionsSchema>;

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function xmlEscape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => XML_ESCAPES[character] ?? character,
  );
}

/*
 * A shard is addressed by suffixing the page number onto the mounted route, so
 * a theme serving `/sitemap.xml` serves its shards from `/sitemap-2.xml`. Both
 * the index links and the shard selection are derived from the incoming
 * pathname, which keeps the handler mountable at whatever route the theme picks
 * without being told that route twice.
 */
const SHARD_PATH = /^(?<base>\/.*?)-(?<page>[1-9]\d*)\.xml$/;

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).href;
}

type SitemapGroup = {
  id: string;
  byLocale: Map<string, SitemapEntry>;
};

async function collectGroups(
  options: z.output<typeof optionsSchema>,
): Promise<SitemapGroup[]> {
  const groups = new Map<string, SitemapGroup>();
  const pathOwners = new Map<string, string>();

  for (const locale of options.locales) {
    const entries = sitemapEntriesSchema.parse(
      await options.entries({ locale }),
    );
    for (const entry of entries) {
      const group = groups.get(entry.id) ?? {
        id: entry.id,
        byLocale: new Map(),
      };
      if (group.byLocale.has(locale)) {
        throw new SitemapError(
          `Entry "${entry.id}" was listed twice for locale "${locale}".`,
        );
      }
      /*
       * One address can belong to one resource in one locale. Two resources at
       * the same path, or one path served as two locales, both produce clusters
       * that contradict each other; a crawler resolves that by ignoring the
       * annotation on every URL involved.
       */
      const owner = pathOwners.get(entry.path);
      if (owner !== undefined) {
        throw new SitemapError(
          `Path "${entry.path}" is claimed by both "${owner}" and "${entry.id}".`,
        );
      }
      pathOwners.set(entry.path, entry.id);
      group.byLocale.set(locale, entry);
      groups.set(entry.id, group);
    }
  }

  return [...groups.values()];
}

type AlternateLink = { hreflang: string; path: string };

function renderUrl(
  origin: string,
  entry: SitemapEntry,
  links: AlternateLink[],
): string {
  const lines = [
    "  <url>",
    `    <loc>${xmlEscape(absoluteUrl(origin, entry.path))}</loc>`,
  ];
  for (const link of links) {
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="${xmlEscape(link.hreflang)}" href="${xmlEscape(absoluteUrl(origin, link.path))}" />`,
    );
  }
  if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
  if (entry.changefreq) {
    lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  }
  if (entry.priority !== undefined) {
    lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
  }
  lines.push("  </url>");
  return lines.join("\n");
}

function renderUrlBlocks(
  options: z.output<typeof optionsSchema>,
  groups: SitemapGroup[],
  origin: string,
): string[] {
  const blocks: string[] = [];

  for (const group of groups) {
    const present: Array<{ locale: string; entry: SitemapEntry }> = [];
    const missingLocales: string[] = [];
    for (const locale of options.locales) {
      const entry = group.byLocale.get(locale);
      if (entry) present.push({ locale, entry });
      else missingLocales.push(locale);
    }

    if (missingLocales.length > 0) {
      options.onIncompleteLocaleSet?.({
        id: group.id,
        presentLocales: present.map(({ locale }) => locale),
        missingLocales,
        policy: options.incompleteLocaleSet,
      });
      if (options.incompleteLocaleSet === "omit") continue;
    }

    /*
     * `x-default` names the address a visitor with no matching locale should
     * land on, so it is the default locale's path. The whole cluster, itself
     * included, only exists when every locale is present.
     */
    const defaultPath = group.byLocale.get(options.defaultLocale)?.path;
    const links: AlternateLink[] =
      missingLocales.length === 0 && defaultPath !== undefined
        ? [
            ...present.map(({ locale, entry }) => ({
              hreflang: locale,
              path: entry.path,
            })),
            { hreflang: "x-default", path: defaultPath },
          ]
        : [];

    for (const { entry } of present) {
      blocks.push(renderUrl(origin, entry, links));
    }
  }

  return blocks;
}

const URLSET_OPEN = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;
const URLSET_CLOSE = `</urlset>
`;
const INDEX_OPEN = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
const INDEX_CLOSE = `</sitemapindex>
`;

const URLSET_OVERHEAD = byteLength(URLSET_OPEN) + byteLength(URLSET_CLOSE);

/**
 * Packs rendered `<url>` blocks into documents that stay under both caps.
 *
 * A single block larger than the byte cap still gets a shard of its own: there
 * is nothing smaller to split it into, and dropping it would hide a page rather
 * than report an oversized one.
 */
function shardUrlBlocks(blocks: string[]): string[][] {
  const shards: string[][] = [];
  let current: string[] = [];
  let bytes = URLSET_OVERHEAD;

  for (const block of blocks) {
    const size = byteLength(block) + 1;
    const overflows =
      current.length >= SITEMAP_URL_LIMIT || bytes + size > SITEMAP_BYTE_LIMIT;
    if (current.length > 0 && overflows) {
      shards.push(current);
      current = [];
      bytes = URLSET_OVERHEAD;
    }
    current.push(block);
    bytes += size;
  }

  shards.push(current);
  return shards;
}

function renderUrlset(blocks: string[]): string {
  return `${URLSET_OPEN}${blocks.map((block) => `${block}\n`).join("")}${URLSET_CLOSE}`;
}

function renderIndex(origin: string, base: string, shards: number): string {
  const lines: string[] = [];
  for (let page = 1; page <= shards; page += 1) {
    lines.push(
      "  <sitemap>",
      `    <loc>${xmlEscape(absoluteUrl(origin, `${base}-${page}.xml`))}</loc>`,
      "  </sitemap>",
      "",
    );
  }
  return `${INDEX_OPEN}${lines.join("\n")}${INDEX_CLOSE}`;
}

function xmlResponse(
  request: Request,
  body: string,
  cacheControl: string,
): Response {
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Builds the request handler a theme mounts at `/sitemap.xml`.
 *
 * The theme supplies the addresses it owns for each locale; the helper groups
 * them by `id`, emits reciprocal `xhtml:link` alternates plus `x-default`,
 * absolutizes against the origin the request arrived on, and splits into a
 * sitemap index once a document would exceed `SITEMAP_URL_LIMIT` or
 * `SITEMAP_BYTE_LIMIT`.
 *
 * Origin comes from the request because a theme is served on several hostnames
 * — preview, platform, custom domain — and a sitemap that names the wrong one
 * advertises URLs the visitor cannot reach. Mount the same handler again at the
 * shard route (`/sitemap-[page].xml`) to serve a split sitemap.
 */
export function createSitemap(options: SitemapOptions): SitemapHandler {
  const parsed = optionsSchema.parse(options);
  if (!parsed.locales.includes(parsed.defaultLocale)) {
    throw new SitemapError(
      `Default locale "${parsed.defaultLocale}" is not in the locale list.`,
    );
  }
  const locales = [...new Set(parsed.locales)];
  if (locales.length !== parsed.locales.length) {
    throw new SitemapError("Locales must be unique.");
  }

  return async ({ request }) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD", "Cache-Control": "private, no-store" },
      });
    }

    const url = new URL(request.url);
    const shardPath = SHARD_PATH.exec(url.pathname);
    const base = shardPath?.groups?.base ?? url.pathname.replace(/\.xml$/, "");
    const page = shardPath?.groups?.page
      ? Number(shardPath.groups.page)
      : undefined;

    const groups = await collectGroups(parsed);
    const shards = shardUrlBlocks(renderUrlBlocks(parsed, groups, url.origin));

    if (page === undefined) {
      const body =
        shards.length > 1
          ? renderIndex(url.origin, base, shards.length)
          : renderUrlset(shards[0] ?? []);
      return xmlResponse(request, body, parsed.cacheControl);
    }

    const shard = shards[page - 1];
    if (!shard || shards.length === 1) {
      return new Response(request.method === "HEAD" ? null : "Not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }
    return xmlResponse(request, renderUrlset(shard), parsed.cacheControl);
  };
}
