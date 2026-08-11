import {
  CONTRACT_VERSION,
  checkThemeDefinition,
  createFixtureRouter,
  type ParsedThemeDefinition,
  READABLE_CONTRACT_VERSIONS,
  type ThemeDefinition,
  type ThemePageContext,
  themeContextResponseSchema,
  upgradeThemeContextResponse,
} from "@voyant-travel/theme";

export const PUBLICATION_BINDING_NAMES = [
  "PUBLICATION",
  "VOYANT_PUBLICATION_TOKEN",
  "VOYANT_SITE_ID",
  "VOYANT_PUBLICATION_ID",
  "VOYANT_THEME_RELEASE_ID",
] as const;

export const PUBLICATION_REQUEST_HEADERS = {
  contractVersion: "x-voyant-theme-contract-version",
  publicationId: "x-voyant-publication-id",
  releaseId: "x-voyant-theme-release-id",
  siteId: "x-voyant-site-id",
} as const;

export const PUBLICATION_RESPONSE_HEADERS = {
  contextPath: "x-voyant-publication-context-path",
  locale: "x-voyant-publication-locale",
  requestedPath: "x-voyant-requested-path",
} as const;

const MAX_CONTEXT_RESPONSE_BYTES = 2 * 1024 * 1024;

/** The HTTP subset of a Cloudflare `Fetcher` used by the theme runtime. */
export interface PublicationFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/** Bindings injected by the Voyant dispatcher for one scoped release. */
export interface VoyantPublicationBindings {
  PUBLICATION: PublicationFetcher;
  VOYANT_PUBLICATION_TOKEN: string;
  VOYANT_SITE_ID: string;
  VOYANT_PUBLICATION_ID: string;
  VOYANT_THEME_RELEASE_ID: string;
}

export type ThemeContextResolver = (
  input: string | URL,
  runtimeEnv?: unknown,
) => Promise<ThemePageContext>;

export type ThemeRuntimeErrorCode =
  | "THEME_CONTEXT_FETCH_FAILED"
  | "THEME_CONTEXT_RESPONSE_INVALID"
  | "THEME_RUNTIME_BINDINGS_INVALID";

export class ThemeRuntimeError extends Error {
  constructor(
    readonly code: ThemeRuntimeErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ThemeRuntimeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isPublicationFetcher(value: unknown): value is PublicationFetcher {
  return (
    (isRecord(value) || typeof value === "function") &&
    "fetch" in value &&
    typeof value.fetch === "function"
  );
}

function requiredString(
  env: Record<string, unknown>,
  name: (typeof PUBLICATION_BINDING_NAMES)[number],
): string {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      `Voyant publication binding ${name} must be a non-empty string.`,
    );
  }
  return value.trim();
}

/**
 * Returns `undefined` only when the complete publication binding set is absent.
 * A partially configured production runtime fails closed instead of rendering
 * fixtures on a public hostname.
 */
export function readPublicationBindings(
  runtimeEnv: unknown,
): VoyantPublicationBindings | undefined {
  if (!isRecord(runtimeEnv)) return undefined;
  const configured = PUBLICATION_BINDING_NAMES.filter(
    (name) => runtimeEnv[name] !== undefined,
  );
  if (configured.length === 0) return undefined;
  if (configured.length !== PUBLICATION_BINDING_NAMES.length) {
    const missing = PUBLICATION_BINDING_NAMES.filter(
      (name) => runtimeEnv[name] === undefined,
    );
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      `Voyant publication runtime is missing bindings: ${missing.join(", ")}.`,
    );
  }

  const publication = runtimeEnv.PUBLICATION;
  if (!isPublicationFetcher(publication)) {
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      "Voyant publication binding PUBLICATION must be a Fetcher.",
    );
  }

  return {
    PUBLICATION: publication,
    VOYANT_PUBLICATION_TOKEN: requiredString(
      runtimeEnv,
      "VOYANT_PUBLICATION_TOKEN",
    ),
    VOYANT_SITE_ID: requiredString(runtimeEnv, "VOYANT_SITE_ID"),
    VOYANT_PUBLICATION_ID: requiredString(runtimeEnv, "VOYANT_PUBLICATION_ID"),
    VOYANT_THEME_RELEASE_ID: requiredString(
      runtimeEnv,
      "VOYANT_THEME_RELEASE_ID",
    ),
  };
}

function publicationRequest(
  input: string | URL,
  bindings: VoyantPublicationBindings,
  options: { accept?: string; method?: "GET" | "HEAD" } = {},
): Request {
  let url: URL;
  try {
    url = new URL(String(input));
  } catch {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_FETCH_FAILED",
      "Production theme context resolution requires an absolute request URL.",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_FETCH_FAILED",
      "Production theme context resolution requires an HTTP(S) request URL.",
    );
  }
  url.hash = "";

  return new Request(url, {
    headers: {
      accept: options.accept ?? "application/json",
      authorization: `Bearer ${bindings.VOYANT_PUBLICATION_TOKEN}`,
      [PUBLICATION_REQUEST_HEADERS.contractVersion]: CONTRACT_VERSION,
      [PUBLICATION_REQUEST_HEADERS.publicationId]:
        bindings.VOYANT_PUBLICATION_ID,
      [PUBLICATION_REQUEST_HEADERS.releaseId]: bindings.VOYANT_THEME_RELEASE_ID,
      [PUBLICATION_REQUEST_HEADERS.siteId]: bindings.VOYANT_SITE_ID,
    },
    method: options.method ?? "GET",
  });
}

const PUBLICATION_SYSTEM_PATHS = new Set(["/robots.txt", "/sitemap.xml"]);

/**
 * Proxies platform-owned discovery documents before an Astro catch-all page
 * can mistake their text/XML responses for a JSON page context.
 *
 * The browser request is never forwarded. A fresh capability-scoped request
 * is constructed so cookies, caller authorization, and tenant selectors
 * cannot cross the publication binding boundary.
 */
export async function resolvePublicationSystemRoute(
  request: Request,
  runtimeEnv?: unknown,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (
    !PUBLICATION_SYSTEM_PATHS.has(url.pathname) ||
    (request.method !== "GET" && request.method !== "HEAD")
  ) {
    return undefined;
  }

  const bindings = readPublicationBindings(runtimeEnv);
  if (!bindings) return undefined;

  return bindings.PUBLICATION.fetch(
    publicationRequest(url, bindings, {
      accept:
        url.pathname === "/sitemap.xml" ? "application/xml" : "text/plain",
      method: request.method,
    }),
  );
}

async function readBoundedResponse(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > MAX_CONTEXT_RESPONSE_BYTES
  ) {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_RESPONSE_INVALID",
      "Voyant publication context response exceeds the runtime limit.",
    );
  }
  if (!response.body) {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_RESPONSE_INVALID",
      "Voyant publication context response has no body.",
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      received += result.value.byteLength;
      if (received > MAX_CONTEXT_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ThemeRuntimeError(
          "THEME_CONTEXT_RESPONSE_INVALID",
          "Voyant publication context response exceeds the runtime limit.",
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_RESPONSE_INVALID",
      "Voyant publication context response is not valid JSON.",
    );
  }
}

function publicationContextPath(publicPath: string, locale: string): string {
  const prefix = `/${locale}`;
  if (publicPath === prefix) return "/";
  return publicPath.startsWith(`${prefix}/`)
    ? publicPath.slice(prefix.length)
    : publicPath;
}

async function resolvePublishedContext(
  input: string | URL,
  bindings: VoyantPublicationBindings,
): Promise<ThemePageContext> {
  const request = publicationRequest(input, bindings);
  let response: Response;
  try {
    response = await bindings.PUBLICATION.fetch(request);
  } catch {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_FETCH_FAILED",
      "Voyant publication context could not be loaded.",
    );
  }
  if (!response.ok && response.status !== 404) {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_FETCH_FAILED",
      `Voyant publication context returned HTTP ${response.status}.`,
      response.status,
    );
  }
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (
    !contentType ||
    (!contentType.includes("application/json") &&
      !contentType.includes("+json"))
  ) {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_RESPONSE_INVALID",
      "Voyant publication context response must be JSON.",
    );
  }

  const parsed = themeContextResponseSchema.safeParse(
    upgradeThemeContextResponse(await readBoundedResponse(response)),
  );
  if (!parsed.success) {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_RESPONSE_INVALID",
      `Voyant publication context does not match a readable theme contract (${READABLE_CONTRACT_VERSIONS.join(", ")}).`,
    );
  }
  const publicationLocale = response.headers.get(
    PUBLICATION_RESPONSE_HEADERS.locale,
  );
  if (publicationLocale !== parsed.data.context.locale) {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_RESPONSE_INVALID",
      "Voyant publication context locale does not match the trusted reader locale.",
    );
  }
  const requestedPath = publicationContextPath(
    new URL(request.url).pathname,
    parsed.data.context.locale,
  );
  if (response.status === 404) {
    if (
      parsed.data.context.kind !== "notFound" ||
      response.headers.get(PUBLICATION_RESPONSE_HEADERS.contextPath) !==
        parsed.data.context.path ||
      response.headers.get(PUBLICATION_RESPONSE_HEADERS.requestedPath) !==
        requestedPath
    ) {
      throw new ThemeRuntimeError(
        "THEME_CONTEXT_RESPONSE_INVALID",
        "Voyant publication not-found context does not match the requested path.",
      );
    }
    return parsed.data.context;
  }
  if (parsed.data.context.path !== requestedPath) {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_RESPONSE_INVALID",
      "Voyant publication context path does not match the requested path.",
    );
  }
  return parsed.data.context;
}

/**
 * How many resolved contexts one isolate keeps. Small on purpose: this exists
 * so that two resolutions of the same page within a request cost one fetch,
 * not to be a page cache.
 */
const CONTEXT_MEMO_LIMIT = 64;

/**
 * Only the settled context is ever kept, never the promise that produced it.
 *
 * A promise returned by `fetch` owns the request's I/O context, and Cloudflare
 * Workers refuses to await one outside the request that created it. Caching the
 * promise serves the first request an isolate sees and then throws "Cannot
 * perform I/O on behalf of a different request" for every request after it — a
 * 500 with an empty body, on a path local development never exercises, because
 * fixtures resolve without any I/O at all.
 *
 * The settled value is plain parsed data with nothing attached to a request, so
 * reusing it is safe. Keeping it across requests is sound because a publication
 * is an immutable snapshot: its id changes whenever the content does, so an
 * entry keyed by it cannot go stale. The release is in the key too, so a
 * rollout that reuses a publication id under a new release resolves afresh.
 */
function memoKey(bindings: VoyantPublicationBindings, input: string | URL) {
  return `${bindings.VOYANT_PUBLICATION_ID} ${bindings.VOYANT_THEME_RELEASE_ID} ${String(input)}`;
}

export function createThemeContextResolver(
  theme: ThemeDefinition | ParsedThemeDefinition,
): ThemeContextResolver {
  const checked = checkThemeDefinition(theme);
  if (!checked.ok || !checked.theme) {
    const summary = checked.diagnostics
      .map((item) => `${item.code}: ${item.message}`)
      .join("\n");
    throw new Error(`Invalid Voyant theme:\n${summary}`);
  }
  const router = createFixtureRouter(checked.theme);
  const memo = new Map<string, ThemePageContext>();
  return async (input, runtimeEnv) => {
    const bindings = readPublicationBindings(runtimeEnv);
    if (!bindings) return router.resolve(input);

    const key = memoKey(bindings, input);
    const memoized = memo.get(key);
    if (memoized) return memoized;

    // Awaited before it is stored, so nothing request-scoped is ever cached. A
    // failure simply leaves the entry absent rather than being remembered.
    const context = await resolvePublishedContext(input, bindings);
    memo.set(key, context);
    if (memo.size > CONTEXT_MEMO_LIMIT) {
      const oldest = memo.keys().next();
      if (!oldest.done) memo.delete(oldest.value);
    }
    return context;
  };
}
