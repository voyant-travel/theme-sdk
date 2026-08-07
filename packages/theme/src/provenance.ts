const START = "\u2063\u2062";
const END = "\u2064";
const ZERO = "\u200b";
const ONE = "\u200c";

/** Loose context key used by the platform to opt a response into draft editing. */
export const THEME_EDITOR_CONTEXT_KEY = "_voyant" as const;

export interface ThemeEditorContext {
  mode: "draft";
  editorOrigin: string;
}

function pointerSegments(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  const segments = pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  return segments.some((part) => /~(?![01])/.test(part)) ? null : segments;
}

const PRESENTATION_LEAVES = new Set([
  "title",
  "summary",
  "body",
  "message",
  "description",
  "label",
  "alt",
  "name",
]);
const STRUCTURAL_LEAVES = new Set([
  "locale",
  "path",
  "kind",
  "id",
  "slug",
  "type",
  "href",
  "src",
]);

/**
 * The materializer's allowlist. In particular, root `settings`, routing fields,
 * URLs, identifiers and code injection are never candidates for stega.
 */
export function isStegaPointerAllowed(pointer: string): boolean {
  const parts = pointerSegments(pointer);
  if (!parts?.length) return false;
  const [root] = parts;
  const leaf = parts.at(-1);
  if (
    root === "settings" ||
    root === "locale" ||
    root === "path" ||
    root === "codeInjection" ||
    root === THEME_EDITOR_CONTEXT_KEY ||
    !leaf ||
    STRUCTURAL_LEAVES.has(leaf)
  ) {
    return false;
  }
  if (PRESENTATION_LEAVES.has(leaf)) return true;
  if (root === "sections") {
    return parts.includes("settings") || parts.includes("data");
  }
  if (root === "entry" || root === "entries") {
    return parts.includes("values") || parts.includes("binding");
  }
  return false;
}

function bytesToInvisible(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit -= 1)
      result += byte & (1 << bit) ? ONE : ZERO;
  }
  return result;
}

function invisibleToBytes(value: string): Uint8Array | null {
  if (value.length % 8 !== 0) return null;
  const bytes = new Uint8Array(value.length / 8);
  for (let offset = 0; offset < value.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const character = value[offset + bit];
      if (character !== ZERO && character !== ONE) return null;
      byte = (byte << 1) | (character === ONE ? 1 : 0);
    }
    bytes[offset / 8] = byte;
  }
  return bytes;
}

/** Append a reversible, invisible RFC-6901 provenance payload to a string. */
export function encodeStega(value: string, pointer: string): string {
  if (!isStegaPointerAllowed(pointer)) return value;
  const payload = new TextEncoder().encode(JSON.stringify({ p: pointer }));
  return `${value}${START}${bytesToInvisible(payload)}${END}`;
}

export interface DecodedStega {
  value: string;
  pointer: string;
}

/** Decode only payloads emitted by this SDK; malformed invisible text is data. */
export function decodeStega(value: string): DecodedStega | null {
  const start = value.lastIndexOf(START);
  if (start < 0 || !value.endsWith(END)) return null;
  const encoded = value.slice(start + START.length, -END.length);
  const bytes = invisibleToBytes(encoded);
  if (!bytes) return null;
  try {
    const payload: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("p" in payload) ||
      typeof payload.p !== "string" ||
      !isStegaPointerAllowed(payload.p)
    ) {
      return null;
    }
    return { value: value.slice(0, start), pointer: payload.p };
  } catch {
    return null;
  }
}

export function cleanStega(value: string): string {
  return decodeStega(value)?.value ?? value;
}

function escapePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function editorContext(value: unknown): ThemeEditorContext | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  if (record.mode !== "draft" || typeof record.editorOrigin !== "string")
    return null;
  try {
    const origin = new URL(record.editorOrigin);
    if (
      origin.origin !== record.editorOrigin ||
      !/^https?:$/.test(origin.protocol)
    )
      return null;
    return { mode: "draft", editorOrigin: origin.origin };
  } catch {
    return null;
  }
}

export function getThemeEditorContext(
  context: unknown,
): ThemeEditorContext | null {
  if (typeof context !== "object" || context === null || Array.isArray(context))
    return null;
  return editorContext(
    (context as Record<string, unknown>)[THEME_EDITOR_CONTEXT_KEY],
  );
}

/**
 * Encode only allowlisted draft strings. Non-draft input is returned by
 * reference so production rendering remains byte-for-byte unchanged.
 */
export function encodeThemeContextProvenance<T>(context: T): T {
  if (!getThemeEditorContext(context)) return context;
  const visit = (value: unknown, pointer: string): unknown => {
    if (typeof value === "string") return encodeStega(value, pointer);
    if (Array.isArray(value))
      return value.map((item, index) => visit(item, `${pointer}/${index}`));
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        visit(item, `${pointer}/${escapePointerSegment(key)}`),
      ]),
    );
  };
  return visit(context, "") as T;
}
