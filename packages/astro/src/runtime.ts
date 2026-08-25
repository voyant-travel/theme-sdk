import {
  CONTRACT_VERSION,
  checkThemeDefinition,
  createFixtureRouter,
  type ParsedThemeDefinition,
  parseThemeDevelopmentRuntimeDescriptor,
  READABLE_CONTRACT_VERSIONS,
  type ThemeDefinition,
  type ThemeDevelopmentRuntimeDescriptor,
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

export const THEME_DEVELOPMENT_RUNTIME_ADAPTER_ID = "voyant-platform" as const;

export const THEME_DEVELOPMENT_RUNTIME_ENV_NAMES = [
  "VOYANT_THEME_DEVELOPMENT_RUNTIME",
  "VOYANT_THEME_DEVELOPMENT_RUNTIME_ADAPTER",
  "VOYANT_THEME_DEVELOPMENT_CAPABILITY",
] as const;

const MAX_CONTEXT_RESPONSE_BYTES = 2 * 1024 * 1024;
export const CONNECTED_CONTEXT_TIMEOUT_MS = 10_000;
export const CONNECTED_PUBLIC_API_PATH = "/v1/public" as const;
export const MANAGED_CONTENT_ORIGIN = "https://content.voyant.invalid" as const;

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

export interface VoyantThemeDevelopmentRuntime {
  descriptor: ThemeDevelopmentRuntimeDescriptor;
  capability: string;
}

export type ThemeContentFetch = typeof globalThis.fetch;

/**
 * Creates the server-only Fetch transport consumed by
 * `@voyant-travel/content-client` in a managed Theme.
 */
export function createThemeContentFetch(
  runtimeEnv: unknown,
): ThemeContentFetch {
  return async (input, init) => {
    const publication = readPublicationBindings(runtimeEnv);
    if (!publication) {
      throw new ThemeRuntimeError(
        "THEME_RUNTIME_BINDINGS_INVALID",
        "Voyant managed Content is unavailable outside a managed Theme runtime.",
      );
    }
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      url.origin !== MANAGED_CONTENT_ORIGIN ||
      !url.pathname.startsWith("/__voyant/content/") ||
      (request.method !== "GET" && request.method !== "HEAD")
    ) {
      throw new ThemeRuntimeError(
        "THEME_RUNTIME_BINDINGS_INVALID",
        "Voyant managed Content accepts only scoped read requests.",
      );
    }
    const headers = new Headers({ accept: "application/json" });
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch) headers.set("if-none-match", ifNoneMatch);
    headers.set(
      "authorization",
      `Bearer ${publication.VOYANT_PUBLICATION_TOKEN}`,
    );
    return publication.PUBLICATION.fetch(
      new Request(`${MANAGED_CONTENT_ORIGIN}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        signal: request.signal,
      }),
    );
  };
}

const CONNECTED_PUBLIC_API_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "idempotency-key",
] as const;

function isCanonicalPublicApiPath(pathname: string) {
  return (
    pathname === CONNECTED_PUBLIC_API_PATH ||
    pathname.startsWith(`${CONNECTED_PUBLIC_API_PATH}/`)
  );
}

/**
 * Serves canonical same-origin Public API calls during connected development.
 * The browser sees only localhost; the private development capability stays in
 * Astro's server process and is exchanged with the Platform relay.
 */
export async function resolveThemePublicApiRoute(
  request: Request,
  privateEnvironment?: unknown,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Response | undefined> {
  const requestUrl = new URL(request.url);
  if (!isCanonicalPublicApiPath(requestUrl.pathname)) return undefined;
  const development = readThemeDevelopmentRuntime(privateEnvironment);
  if (!development) return undefined;

  const target = new URL(development.descriptor.publicApiEndpoint);
  target.pathname = `${target.pathname.replace(/\/$/, "")}${requestUrl.pathname}`;
  target.search = requestUrl.search;
  const headers = new Headers();
  for (const name of CONNECTED_PUBLIC_API_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("authorization", `Bearer ${development.capability}`);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: request.signal,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  try {
    const response = await fetchImpl(new Request(target, init));
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("cache-control", "private, no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_FETCH_FAILED",
      "Connected Theme Public API relay is unavailable.",
      502,
    );
  }
}

export type ThemeContextResolver = (
  input: string | URL,
  runtimeEnv?: unknown,
  privateEnvironment?: unknown,
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

/**
 * Reads the private child-process handoff produced by connected Theme tooling.
 * The capability is deliberately separate from the serializable descriptor.
 */
export function readThemeDevelopmentRuntime(
  privateEnvironment: unknown,
): VoyantThemeDevelopmentRuntime | undefined {
  if (!isRecord(privateEnvironment)) return undefined;
  const configured = THEME_DEVELOPMENT_RUNTIME_ENV_NAMES.filter(
    (name) => privateEnvironment[name] !== undefined,
  );
  if (configured.length === 0) return undefined;
  if (configured.length !== THEME_DEVELOPMENT_RUNTIME_ENV_NAMES.length) {
    const missing = THEME_DEVELOPMENT_RUNTIME_ENV_NAMES.filter(
      (name) => privateEnvironment[name] === undefined,
    );
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      `Voyant connected development runtime is missing private values: ${missing.join(", ")}.`,
    );
  }

  if (
    privateEnvironment.VOYANT_THEME_DEVELOPMENT_RUNTIME_ADAPTER !==
    THEME_DEVELOPMENT_RUNTIME_ADAPTER_ID
  ) {
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      `Voyant connected development requires Adapter '${THEME_DEVELOPMENT_RUNTIME_ADAPTER_ID}'.`,
    );
  }
  const capability = privateEnvironment.VOYANT_THEME_DEVELOPMENT_CAPABILITY;
  if (
    typeof capability !== "string" ||
    !capability ||
    capability !== capability.trim()
  ) {
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      "Voyant connected development capability must be a non-empty string without outer whitespace.",
    );
  }

  const serialized = privateEnvironment.VOYANT_THEME_DEVELOPMENT_RUNTIME;
  if (typeof serialized !== "string" || !serialized.trim()) {
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      "Voyant connected development descriptor must be serialized JSON.",
    );
  }
  let untrustedDescriptor: unknown;
  try {
    untrustedDescriptor = JSON.parse(serialized);
  } catch {
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      "Voyant connected development descriptor is not valid JSON.",
    );
  }

  let descriptor: ThemeDevelopmentRuntimeDescriptor;
  try {
    descriptor = parseThemeDevelopmentRuntimeDescriptor(untrustedDescriptor);
  } catch {
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      "Voyant connected development descriptor is invalid.",
    );
  }
  if (Date.parse(descriptor.expiresAt) <= Date.now()) {
    throw new ThemeRuntimeError(
      "THEME_RUNTIME_BINDINGS_INVALID",
      "Voyant connected development session has expired.",
    );
  }

  return { descriptor, capability };
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
  return validateThemeContextResponse(response, request.url);
}

async function validateThemeContextResponse(
  response: Response,
  requestUrl: string,
): Promise<ThemePageContext> {
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
    new URL(requestUrl).pathname,
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

function connectedDevelopmentRequest(
  input: string | URL,
  runtime: VoyantThemeDevelopmentRuntime,
  signal: AbortSignal,
): Request {
  let pageUrl: URL;
  try {
    pageUrl = new URL(String(input));
  } catch {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_FETCH_FAILED",
      "Connected theme context resolution requires an absolute request URL.",
    );
  }
  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
    throw new ThemeRuntimeError(
      "THEME_CONTEXT_FETCH_FAILED",
      "Connected theme context resolution requires an HTTP(S) request URL.",
    );
  }
  pageUrl.hash = "";

  // Field order is part of the relay's signed, canonical request contract.
  const payload = {
    path: pageUrl.pathname,
    perspective: runtime.descriptor.perspective,
    sessionId: runtime.descriptor.sessionId,
    manifestDigest: runtime.descriptor.manifestDigest,
  };
  return new Request(runtime.descriptor.contentEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${runtime.capability}`,
      "content-type": "application/json",
      [PUBLICATION_REQUEST_HEADERS.contractVersion]: CONTRACT_VERSION,
    },
    body: JSON.stringify(payload),
    signal,
  });
}

async function resolveConnectedDevelopmentContext(
  input: string | URL,
  runtime: VoyantThemeDevelopmentRuntime,
): Promise<ThemePageContext> {
  const controller = new AbortController();
  const request = connectedDevelopmentRequest(
    input,
    runtime,
    controller.signal,
  );
  const timeout = setTimeout(
    () => controller.abort(),
    CONNECTED_CONTEXT_TIMEOUT_MS,
  );
  try {
    let response: Response;
    try {
      response = await fetch(request);
    } catch {
      throw new ThemeRuntimeError(
        "THEME_CONTEXT_FETCH_FAILED",
        "Voyant connected development context could not be loaded.",
      );
    }
    return await validateThemeContextResponse(response, String(input));
  } finally {
    clearTimeout(timeout);
  }
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
  return async (input, runtimeEnv, privateEnvironment) => {
    const bindings = readPublicationBindings(runtimeEnv);
    if (!bindings) {
      const developmentRuntime =
        readThemeDevelopmentRuntime(privateEnvironment);
      if (developmentRuntime) {
        // Development sessions are mutable. Never reuse a context across SSR
        // requests, even when the URL and manifest digest have not changed.
        return resolveConnectedDevelopmentContext(input, developmentRuntime);
      }
      return router.resolve(input);
    }

    // A Theme publication is immutable, but its Site-owned Content generation
    // is deliberately not: publishing a Page or Collection Item must become
    // visible without republishing the Theme. Never keep a resolved context in
    // the isolate across requests, because that would pin the first Content
    // generation the isolate observed.
    return resolvePublishedContext(input, bindings);
  };
}
