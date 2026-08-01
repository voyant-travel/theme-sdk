import type { z } from "zod";

export const TOOLING_SCHEMA_VERSION = "voyant.theme.tooling.v1" as const;

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticSource {
  file: string;
  path: Array<string | number>;
}

export interface ThemeDiagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  /** Stable JSONPath-like location, for example `$.manifest.routes[0].pattern`. */
  path?: string;
  hint?: string;
  source?: DiagnosticSource;
}

export function formatDiagnosticPath(path: PropertyKey[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    const value = String(segment);
    return /^[A-Za-z_$][\w$]*$/.test(value)
      ? `${result}.${value}`
      : `${result}[${JSON.stringify(value)}]`;
  }, "$");
}

export function diagnosticsFromZod(
  error: z.ZodError,
  file: string,
): ThemeDiagnostic[] {
  return error.issues
    .map((issue) => {
      const sourcePath = issue.path.map((part) =>
        typeof part === "symbol" ? String(part) : part,
      );
      return {
        code: "THEME_SCHEMA_INVALID",
        message: issue.message,
        severity: "error" as const,
        path: formatDiagnosticPath(sourcePath),
        source: { file, path: sourcePath },
      };
    })
    .sort(compareDiagnostics);
}

export function compareDiagnostics(
  left: ThemeDiagnostic,
  right: ThemeDiagnostic,
): number {
  return (
    (left.path ?? "").localeCompare(right.path ?? "") ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}
