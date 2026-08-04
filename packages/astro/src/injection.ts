import type { ThemeCodeInjection } from "@voyant-travel/theme";

/**
 * Splices an operator's injected markup into a rendered document.
 *
 * This is deliberately not a theme's job. Injected markup is how an operator
 * adds analytics, consent and verification tags, and if every theme had to
 * render it themselves then forgetting to would silently drop those tags with
 * nothing to notice the omission. Doing it here means injection works for any
 * theme, including ones written before the field existed.
 *
 * The markup is operator-authored and runs as script by design — that is the
 * point of the field, and it is why the platform closes the seam upstream by
 * scoping it to a single site's own document rather than trying to sanitise
 * what is meant to execute.
 *
 * Anchors are matched case-insensitively because a theme may emit `</HEAD>`,
 * and each is optional: a document without `<body>` simply gets no body
 * injection rather than having markup appended somewhere arbitrary.
 */
export function injectThemeCode(
  html: string,
  injection: ThemeCodeInjection | undefined,
): string {
  if (!injection) return html;
  const head = trimmed(injection.head);
  const bodyStart = trimmed(injection.bodyStart);
  const bodyEnd = trimmed(injection.bodyEnd);
  if (!head && !bodyStart && !bodyEnd) return html;

  let output = html;
  if (head) output = insertBefore(output, /<\/head\s*>/i, head);
  if (bodyStart) output = insertAfterBodyOpen(output, bodyStart);
  if (bodyEnd) output = insertBefore(output, /<\/body\s*>/i, bodyEnd);
  return output;
}

function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function insertBefore(html: string, anchor: RegExp, markup: string): string {
  const match = anchor.exec(html);
  if (!match) return html;
  return `${html.slice(0, match.index)}${markup}${html.slice(match.index)}`;
}

/**
 * `<body>` carries attributes far more often than `</body>` does, so the open
 * tag is matched up to its own `>` rather than as a literal.
 */
function insertAfterBodyOpen(html: string, markup: string): string {
  const match = /<body\b[^>]*>/i.exec(html);
  if (!match) return html;
  const at = match.index + match[0].length;
  return `${html.slice(0, at)}${markup}${html.slice(at)}`;
}

/** Whether a response is a document this can splice markup into. */
export function isInjectableDocument(response: Response): boolean {
  if (!response.body) return false;
  const contentType = response.headers.get("content-type")?.toLowerCase();
  return Boolean(contentType?.includes("text/html"));
}
