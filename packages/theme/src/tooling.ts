import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createJiti } from "jiti";
import type { ParsedThemeDefinition } from "./contract.js";
import { type ThemeDiagnostic, TOOLING_SCHEMA_VERSION } from "./diagnostics.js";
import { checkThemeDefinition } from "./validate.js";

const CONFIG_FILES = [
  "theme.config.ts",
  "theme.config.mts",
  "theme.config.js",
  "theme.config.mjs",
  "voyant.theme.ts",
  "voyant.theme.mts",
  "voyant.theme.js",
  "voyant.theme.mjs",
];

export interface ThemeProjectOptions {
  projectRoot: string;
  configFile?: string;
}

export interface ThemeToolingReport {
  schemaVersion: typeof TOOLING_SCHEMA_VERSION;
  ok: boolean;
  diagnostics: ThemeDiagnostic[];
  configPath?: string;
  theme?: ParsedThemeDefinition;
  exitCode?: number;
  artifact?: ThemeBuildMetadata;
}

export interface ThemeBuildFile {
  path: string;
  size: number;
  sha256: string;
}

export interface ThemeBuildRuntime {
  schemaVersion: "voyant.theme.runtime.v1";
  platform: "cloudflare-workers";
  entrypoint: string;
  assetsDirectory: string;
  assetsBinding: string;
  compatibilityFlags: string[];
  requiredBindings: string[];
}

export interface ThemeBuildMetadata {
  schemaVersion: "voyant.theme.build.v3";
  contractVersion: ParsedThemeDefinition["contractVersion"];
  theme: { id: string; version: string };
  routes: Array<{ id: string; pattern: string; context: string }>;
  /** Alternate renderer ids and their compatible page contexts. */
  templates: ParsedThemeDefinition["manifest"]["templates"];
  /**
   * The settings the theme declares, carried verbatim so a host can render an
   * editor for them. Without this the declaration reaches the build and stops:
   * `manifest.settings` is validated but nothing downstream can see it, so an
   * operator has no way to supply the values the theme reads from
   * `context.settings`.
   */
  settings: ParsedThemeDefinition["manifest"]["settings"];
  /** Section and block declarations used to generate the visual editor. */
  sections: ParsedThemeDefinition["manifest"]["sections"];
  /**
   * The collection shapes the theme binds to, carried for the same reason as
   * settings: without this the declaration reaches the build and stops. The
   * platform reads them to decide whether an operator's mapping satisfies the
   * theme, so a theme could declare a required slot and the check would pass
   * against nothing.
   */
  contentBindings: ParsedThemeDefinition["manifest"]["contentBindings"];
  /** Stable live operations this immutable theme release knows how to call. */
  capabilities: ParsedThemeDefinition["manifest"]["capabilities"];
  outputDirectory: string;
  runtime: ThemeBuildRuntime | null;
  files: ThemeBuildFile[];
  digest: string;
}

const THEME_RUNTIME_METADATA_PATH = ".voyant/theme-runtime.json";

function requiredRuntimeString(
  runtime: Record<string, unknown>,
  field: keyof ThemeBuildRuntime,
): string {
  const value = runtime[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Theme runtime ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredRuntimePath(
  runtime: Record<string, unknown>,
  field: "assetsDirectory" | "entrypoint",
): string {
  const value = requiredRuntimeString(runtime, field).replaceAll("\\", "/");
  const segments = value.split("/");
  if (
    value.startsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Theme runtime ${field} must be a safe relative path.`);
  }
  return value;
}

function requiredRuntimeStrings(
  runtime: Record<string, unknown>,
  field: "compatibilityFlags" | "requiredBindings",
): string[] {
  const value = runtime[field];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`Theme runtime ${field} must be an array of strings.`);
  }
  const values = value.map((item) => String(item).trim());
  if (new Set(values).size !== values.length) {
    throw new Error(`Theme runtime ${field} must not contain duplicates.`);
  }
  return values;
}

export function parseThemeBuildRuntime(value: unknown): ThemeBuildRuntime {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Theme runtime metadata must be an object.");
  }
  const runtime = value as Record<string, unknown>;
  const expectedKeys = [
    "assetsBinding",
    "assetsDirectory",
    "compatibilityFlags",
    "entrypoint",
    "platform",
    "requiredBindings",
    "schemaVersion",
  ];
  const keys = Object.keys(runtime).sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      "Theme runtime metadata has unsupported or missing fields.",
    );
  }
  if (runtime.schemaVersion !== "voyant.theme.runtime.v1") {
    throw new Error(
      "Theme runtime schemaVersion must be voyant.theme.runtime.v1.",
    );
  }
  if (runtime.platform !== "cloudflare-workers") {
    throw new Error("Theme runtime platform must be cloudflare-workers.");
  }
  return {
    schemaVersion: "voyant.theme.runtime.v1",
    platform: "cloudflare-workers",
    entrypoint: requiredRuntimePath(runtime, "entrypoint"),
    assetsDirectory: requiredRuntimePath(runtime, "assetsDirectory"),
    assetsBinding: requiredRuntimeString(runtime, "assetsBinding"),
    compatibilityFlags: requiredRuntimeStrings(runtime, "compatibilityFlags"),
    requiredBindings: requiredRuntimeStrings(runtime, "requiredBindings"),
  };
}

async function loadThemeBuildRuntime(
  projectRoot: string,
): Promise<ThemeBuildRuntime | null> {
  try {
    return parseThemeBuildRuntime(
      JSON.parse(
        await readFile(
          path.join(projectRoot, THEME_RUNTIME_METADATA_PATH),
          "utf8",
        ),
      ),
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export interface LoadedThemeProject {
  configPath: string;
  theme?: ParsedThemeDefinition;
  diagnostics: ThemeDiagnostic[];
}

export interface CommandInvocation {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  output?: "inherit" | "silent";
}

export type ThemeCommandRunner = (
  invocation: CommandInvocation,
) => ChildProcess;

interface RunnableThemeOptions extends ThemeProjectOptions {
  runner?: ThemeCommandRunner;
  signal?: AbortSignal;
}

export interface BuildThemeOptions extends RunnableThemeOptions {
  output?: "inherit" | "silent";
}

export interface DevelopThemeOptions extends RunnableThemeOptions {
  host?: string;
  port?: number;
}

export interface ThemeDevHandle {
  url: string;
  wait(): Promise<number>;
  close(): Promise<void>;
}

export class ThemeToolingError extends Error {
  constructor(
    message: string,
    readonly diagnostics: ThemeDiagnostic[],
  ) {
    super(message);
    this.name = "ThemeToolingError";
  }
}

function report(
  project: LoadedThemeProject,
  extras: Partial<ThemeToolingReport> = {},
): ThemeToolingReport {
  return {
    schemaVersion: TOOLING_SCHEMA_VERSION,
    ok: project.diagnostics.every((item) => item.severity !== "error"),
    diagnostics: project.diagnostics,
    configPath: project.configPath || undefined,
    theme: project.theme,
    ...extras,
  };
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveConfigPath(
  options: ThemeProjectOptions,
): Promise<string | undefined> {
  if (options.configFile) {
    const candidate = path.resolve(options.projectRoot, options.configFile);
    return (await fileExists(candidate)) ? candidate : undefined;
  }
  for (const name of CONFIG_FILES) {
    const candidate = path.join(path.resolve(options.projectRoot), name);
    if (await fileExists(candidate)) return candidate;
  }
  return undefined;
}

function unwrapDefault(value: unknown): unknown {
  if (value && typeof value === "object" && "default" in value) {
    return (value as { default: unknown }).default;
  }
  return value;
}

export async function loadThemeProject(
  options: ThemeProjectOptions,
): Promise<LoadedThemeProject> {
  const configPath = await resolveConfigPath(options);
  if (!configPath) {
    const expected = options.configFile ?? CONFIG_FILES[0] ?? "theme.config.ts";
    return {
      configPath: path.resolve(options.projectRoot, expected),
      diagnostics: [
        {
          code: "THEME_CONFIG_NOT_FOUND",
          message: `Theme config '${expected}' was not found.`,
          severity: "error",
          path: "$",
          hint: "Create theme.config.ts and default-export a theme made with defineTheme().",
        },
      ],
    };
  }

  let input: unknown;
  try {
    const loader = createJiti(configPath, {
      interopDefault: false,
      moduleCache: false,
    });
    input = unwrapDefault(await loader.import(configPath));
  } catch (error) {
    return {
      configPath,
      diagnostics: [
        {
          code: "THEME_CONFIG_LOAD_FAILED",
          message: error instanceof Error ? error.message : String(error),
          severity: "error",
          path: "$",
          source: { file: configPath, path: [] },
        },
      ],
    };
  }

  const checked = checkThemeDefinition(input, configPath);
  return { configPath, theme: checked.theme, diagnostics: checked.diagnostics };
}

/** Stable dynamic boundary consumed by `@voyant-travel/cli`. */
export async function validateTheme(
  options: ThemeProjectOptions,
): Promise<ThemeToolingReport> {
  return report(await loadThemeProject(options));
}

/** Additive programmatic alias for SDK consumers. */
export const checkTheme = validateTheme;

const defaultRunner: ThemeCommandRunner = ({
  command,
  args,
  cwd,
  signal,
  output,
}) =>
  spawn(command, args, {
    cwd,
    signal,
    stdio: output === "silent" ? ["inherit", "ignore", "inherit"] : "inherit",
    shell: false,
  });

function invocation(
  command: string[],
  cwd: string,
  signal?: AbortSignal,
  output?: "inherit" | "silent",
): CommandInvocation {
  const [executable, ...args] = command;
  if (!executable) throw new Error("Theme tooling command cannot be empty.");
  return { command: executable, args, cwd, signal, output };
}

async function localAstroCommand(
  projectRoot: string,
  subcommand: "build" | "dev",
): Promise<string[]> {
  const root = path.resolve(projectRoot);
  const require = createRequire(path.join(root, "package.json"));
  const packagePath = require.resolve("astro/package.json");
  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const relativeBin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.astro;
  if (!relativeBin) {
    throw new Error(
      "The project-installed Astro package does not expose its CLI binary.",
    );
  }
  return [
    process.execPath,
    path.resolve(path.dirname(packagePath), relativeBin),
    subcommand,
  ];
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

function observeDevCompletion(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const complete = (exitCode: number) => {
      if (settled) return;
      settled = true;
      resolve(exitCode);
    };
    child.once("error", () => complete(1));
    child.once("exit", (code, signal) => complete(code ?? (signal ? 1 : 0)));
  });
}

/**
 * Orders paths by code unit rather than collation.
 *
 * `localeCompare` reorders punctuation and depends on the host locale, so the
 * same output directory can serialize differently on two machines — and
 * `client/_headers` sorts before `client/.assetsignore` even though `.` (U+002E)
 * precedes `_` (U+005F). Build metadata is provenance for a reproducible build
 * and is verified downstream with a plain relational comparison, so the only
 * safe ordering here is the code-unit one.
 */
function compareBuildPaths(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * JSONB does not retain object insertion order. Preset setting values are the
 * only author-declared arbitrary records in build metadata, so sort every
 * object within those values by Unicode code unit while preserving array order.
 */
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareBuildPaths(left, right))
      .map(([key, nested]) => [key, canonicalJson(nested)]),
  );
}

function canonicalSections(
  sections: ParsedThemeDefinition["manifest"]["sections"],
): ParsedThemeDefinition["manifest"]["sections"] {
  return sections.map((section) => ({
    ...section,
    presets: section.presets.map((preset) => ({
      ...preset,
      settings: canonicalJson(preset.settings) as typeof preset.settings,
      blocks: preset.blocks.map((block) => ({
        ...block,
        settings: canonicalJson(block.settings) as typeof block.settings,
      })),
    })),
  }));
}

async function collectBuildFiles(
  root: string,
  directory = root,
): Promise<ThemeBuildFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: ThemeBuildFile[] = [];
  for (const entry of entries.sort((left, right) =>
    compareBuildPaths(left.name, right.name),
  )) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await collectBuildFiles(root, absolute)));
    else if (entry.isFile()) {
      const content = await readFile(absolute);
      files.push({
        path: path.relative(root, absolute).split(path.sep).join("/"),
        size: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }
  }
  return files.sort((left, right) => compareBuildPaths(left.path, right.path));
}

export async function createThemeBuildMetadata(options: {
  projectRoot: string;
  outputDirectory: string;
  theme: ParsedThemeDefinition;
  runtime?: ThemeBuildRuntime | null;
}): Promise<ThemeBuildMetadata> {
  const projectRoot = path.resolve(options.projectRoot);
  const outputPath = path.resolve(projectRoot, options.outputDirectory);
  const relativeOutput = path.relative(projectRoot, outputPath);
  if (
    !relativeOutput ||
    relativeOutput.startsWith("..") ||
    path.isAbsolute(relativeOutput)
  ) {
    throw new Error(
      "Theme outputDirectory must be a child of the theme project.",
    );
  }
  const normalizedOutput = relativeOutput.split(path.sep).join("/");
  const runtime = options.runtime
    ? parseThemeBuildRuntime(options.runtime)
    : null;
  const files = await collectBuildFiles(outputPath);
  if (runtime && !files.some((file) => file.path === runtime.entrypoint)) {
    throw new Error(
      "Theme runtime entrypoint is missing from the build output.",
    );
  }
  if (
    runtime &&
    !files.some((file) => file.path.startsWith(`${runtime.assetsDirectory}/`))
  ) {
    throw new Error(
      "Theme runtime assetsDirectory is missing from the build output.",
    );
  }
  const canonical = {
    schemaVersion: "voyant.theme.build.v3" as const,
    contractVersion: options.theme.contractVersion,
    theme: {
      id: options.theme.manifest.id,
      version: options.theme.manifest.version,
    },
    routes: options.theme.manifest.routes
      .map(({ id, pattern, context }) => ({ id, pattern, context }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    templates: options.theme.manifest.templates,
    // Declaration order is preserved, unlike routes: a theme orders its
    // settings the way it wants them presented, and sorting them by id would
    // scatter a deliberate grouping.
    settings: options.theme.manifest.settings,
    // Declaration and nested array order are presentation order. This exact
    // key position is shared with the platform's digest reconstruction.
    sections: canonicalSections(options.theme.manifest.sections),
    // Placed between sections and outputDirectory, matching the position the
    // platform rebuilds it in. The digest is taken over JSON.stringify of this
    // object, so the position is part of what the build commits to and moving
    // it would fail verification with identical content.
    contentBindings: options.theme.manifest.contentBindings,
    // Capabilities are authoring declarations, not resolved endpoints. They are
    // carried into the artifact so the platform can resolve a secret-free live
    // envelope for the publication.
    capabilities: options.theme.manifest.capabilities,
    outputDirectory: normalizedOutput,
    runtime,
    files,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
  const metadata: ThemeBuildMetadata = { ...canonical, digest };
  const metadataDirectory = path.join(projectRoot, ".voyant");
  await mkdir(metadataDirectory, { recursive: true });
  await writeFile(
    path.join(metadataDirectory, "theme-build.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}

export async function buildTheme(
  options: BuildThemeOptions,
): Promise<ThemeToolingReport> {
  const project = await loadThemeProject(options);
  if (
    !project.theme ||
    project.diagnostics.some((item) => item.severity === "error")
  )
    return report(project);

  try {
    const command =
      project.theme.tooling?.build ??
      (await localAstroCommand(options.projectRoot, "build"));
    const child = (options.runner ?? defaultRunner)(
      invocation(
        command,
        path.resolve(options.projectRoot),
        options.signal,
        options.output,
      ),
    );
    const exitCode = await waitForExit(child);
    if (exitCode === 0) {
      try {
        const artifact = await createThemeBuildMetadata({
          projectRoot: options.projectRoot,
          outputDirectory: project.theme.tooling?.outputDirectory ?? "dist",
          theme: project.theme,
          runtime: await loadThemeBuildRuntime(
            path.resolve(options.projectRoot),
          ),
        });
        return report(project, { exitCode, artifact });
      } catch (error) {
        return report(
          {
            ...project,
            diagnostics: [
              ...project.diagnostics,
              {
                code: "THEME_BUILD_ARTIFACT_FAILED",
                message: error instanceof Error ? error.message : String(error),
                severity: "error",
                path: "$.tooling.outputDirectory",
                hint: "Ensure the build command writes files to the configured output directory.",
              },
            ],
          },
          { exitCode },
        );
      }
    }
    return report(
      {
        ...project,
        diagnostics: [
          ...project.diagnostics,
          {
            code: "THEME_BUILD_FAILED",
            message: `Theme build exited with code ${exitCode}.`,
            severity: "error",
            path: "$.tooling.build",
          },
        ],
      },
      { exitCode },
    );
  } catch (error) {
    return report({
      ...project,
      diagnostics: [
        ...project.diagnostics,
        {
          code: "THEME_BUILD_START_FAILED",
          message: error instanceof Error ? error.message : String(error),
          severity: "error",
          path: "$.tooling.build",
        },
      ],
    });
  }
}

export async function developTheme(
  options: DevelopThemeOptions,
): Promise<ThemeDevHandle> {
  const project = await loadThemeProject(options);
  if (
    !project.theme ||
    project.diagnostics.some((item) => item.severity === "error")
  ) {
    throw new ThemeToolingError(
      "Cannot start an invalid theme.",
      project.diagnostics,
    );
  }

  const host = options.host ?? "localhost";
  const port = options.port ?? 4321;
  const base =
    project.theme.tooling?.dev ??
    (await localAstroCommand(options.projectRoot, "dev"));
  const command = [...base, "--host", host, "--port", String(port)];
  const child = (options.runner ?? defaultRunner)(
    invocation(command, path.resolve(options.projectRoot), options.signal),
  );
  const completed = observeDevCompletion(child);
  let closing: Promise<void> | undefined;

  return {
    url: `http://${host}:${port}`,
    wait() {
      return completed;
    },
    close() {
      if (closing) return closing;
      closing = (async () => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGTERM");
        await completed;
      })();
      return closing;
    },
  };
}

/** Additive alias using the shorter SDK vocabulary. */
export const devTheme = developTheme;
