import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createJiti } from "jiti";
import type { ParsedThemeDefinition } from "./contract.js";
import {
  parseThemeDevelopmentRuntimeDescriptor,
  type ThemeDevelopmentRuntimeDescriptor,
} from "./development-runtime.js";
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
  /** Private inherited values. They are never added to command arguments. */
  env?: NodeJS.ProcessEnv;
  /** Run a long-lived development command in an SDK-owned process group. */
  processGroup?: boolean;
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
  /** Omit for the existing fixture-backed local development behavior. */
  runtime?: ThemeDevelopmentRuntimeReference;
}

export interface WatchThemeProjectOptions extends ThemeProjectOptions {
  /** Coalesce editor saves that replace a file through multiple filesystem operations. */
  debounceMs?: number;
}

export interface ThemeProjectWatchHandle {
  close(): Promise<void>;
}

export const THEME_DEVELOPMENT_RUNTIME_ENV =
  "VOYANT_THEME_DEVELOPMENT_RUNTIME" as const;
export const THEME_DEVELOPMENT_RUNTIME_ADAPTER_ENV =
  "VOYANT_THEME_DEVELOPMENT_RUNTIME_ADAPTER" as const;

export interface ThemeDevelopmentRuntimeAdapterContext {
  descriptor: ThemeDevelopmentRuntimeDescriptor;
  projectRoot: string;
  signal?: AbortSignal;
}

export interface PreparedThemeDevelopmentRuntime {
  /**
   * Private values inherited only by the local child process. An Adapter may
   * close over an opaque, short-lived capability and return it here; tooling
   * never serializes these values into the descriptor or build metadata.
   */
  childEnvironment?: Readonly<Record<string, string>>;
  dispose?(): void | Promise<void>;
}

export interface ThemeDevelopmentRuntimeAdapter {
  /** Stable, non-secret Adapter identifier used by the Astro runtime. */
  id: string;
  prepare(
    context: ThemeDevelopmentRuntimeAdapterContext,
  ): PreparedThemeDevelopmentRuntime | Promise<PreparedThemeDevelopmentRuntime>;
}

export interface ThemeDevelopmentRuntimeReference {
  descriptor: ThemeDevelopmentRuntimeDescriptor;
  adapter: ThemeDevelopmentRuntimeAdapter;
}

export interface ThemeDevHandle {
  url: string;
  wait(): Promise<number>;
  /** Restart Astro with a validated replacement connected-runtime descriptor. */
  reload(runtime: ThemeDevelopmentRuntimeReference): Promise<void>;
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
    // Use Jiti's synchronous evaluator so native ESM's process-wide URL cache
    // cannot return stale config or local manifest modules during watch mode.
    input = unwrapDefault(loader(configPath));
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

const LOCAL_IMPORT_PATTERN =
  /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s*)?|\brequire\s*\(|\bimport\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
const LOCAL_MODULE_EXTENSIONS = [
  "",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".json",
] as const;

async function localConfigDependencies(
  configPath: string,
): Promise<Set<string>> {
  const dependencies = new Set([path.resolve(configPath)]);
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch {
    return dependencies;
  }
  for (const match of source.matchAll(LOCAL_IMPORT_PATTERN)) {
    const specifier = match[1];
    if (!specifier) continue;
    const candidate = path.resolve(path.dirname(configPath), specifier);
    let resolved = false;
    for (const suffix of LOCAL_MODULE_EXTENSIONS) {
      const file = `${candidate}${suffix}`;
      if (await fileExists(file)) {
        dependencies.add(file);
        resolved = true;
        break;
      }
      const index = path.join(candidate, `index${suffix}`);
      if (suffix && (await fileExists(index))) {
        dependencies.add(index);
        resolved = true;
        break;
      }
    }
    if (!resolved) {
      // Retain candidate paths so recreating a temporarily invalid import also
      // retriggers validation.
      for (const suffix of LOCAL_MODULE_EXTENSIONS) {
        dependencies.add(`${candidate}${suffix}`);
        if (suffix) dependencies.add(path.join(candidate, `index${suffix}`));
      }
    }
  }
  return dependencies;
}

/**
 * Watches the config and its directly imported local manifest modules.
 * Invalid edits are returned as versioned diagnostics and do not mutate the
 * caller's last valid development runtime.
 */
export async function watchThemeProject(
  options: WatchThemeProjectOptions,
  onReport: (report: ThemeToolingReport) => void | Promise<void>,
): Promise<ThemeProjectWatchHandle> {
  const configPath =
    (await resolveConfigPath(options)) ??
    path.resolve(
      options.projectRoot,
      options.configFile ?? CONFIG_FILES[0] ?? "theme.config.ts",
    );
  let dependencies = await localConfigDependencies(configPath);
  const watchers = new Map<string, FSWatcher>();
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  let running = false;
  let pending = false;
  const idleWaiters = new Set<() => void>();

  function schedule() {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => void validate().catch(() => {}),
      options.debounceMs ?? 75,
    );
  }

  const refreshWatchers = () => {
    const directories = new Set(
      [...dependencies].map((dependency) => path.dirname(dependency)),
    );
    for (const [directory, watcher] of watchers) {
      if (!directories.has(directory)) {
        watcher.close();
        watchers.delete(directory);
      }
    }
    for (const directory of directories) {
      if (watchers.has(directory)) continue;
      try {
        const watcher = watch(directory, (_event, filename) => {
          if (closed || filename === null) return;
          const changed = path.resolve(directory, filename.toString());
          if (dependencies.has(changed)) schedule();
        });
        watcher.on("error", schedule);
        watchers.set(directory, watcher);
      } catch {
        // Validation reports missing modules; the config directory remains
        // watched so repairing its import retriggers this discovery pass.
      }
    }
  };

  const validate = async () => {
    if (closed) return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      do {
        pending = false;
        const result = await validateTheme(options);
        dependencies = await localConfigDependencies(configPath);
        refreshWatchers();
        await onReport(result);
      } while (pending && !closed);
    } finally {
      running = false;
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    }
  };

  refreshWatchers();
  try {
    await validate();
  } catch (error) {
    closed = true;
    for (const watcher of watchers.values()) watcher.close();
    throw error;
  }
  return {
    async close() {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
      if (running) {
        await new Promise<void>((resolve) => idleWaiters.add(resolve));
      }
    },
  };
}

const defaultRunner: ThemeCommandRunner = ({
  command,
  args,
  cwd,
  signal,
  output,
  env,
  processGroup,
}) =>
  spawn(command, args, {
    cwd,
    signal,
    stdio: output === "silent" ? ["inherit", "ignore", "inherit"] : "inherit",
    shell: false,
    detached: processGroup && process.platform !== "win32",
    env: env ? { ...process.env, ...env } : undefined,
  });

function invocation(
  command: string[],
  cwd: string,
  signal?: AbortSignal,
  output?: "inherit" | "silent",
  env?: NodeJS.ProcessEnv,
  processGroup?: boolean,
): CommandInvocation {
  const [executable, ...args] = command;
  if (!executable) throw new Error("Theme tooling command cannot be empty.");
  return { command: executable, args, cwd, signal, output, env, processGroup };
}

function validateAdapterId(value: string): string {
  if (!/^[a-z][a-z0-9.-]{0,63}$/.test(value)) {
    throw new Error(
      "Theme development runtime Adapter id must be a lowercase identifier.",
    );
  }
  return value;
}

function privateChildEnvironment(
  values: Readonly<Record<string, string>> | undefined,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      throw new Error(
        `Theme development private environment key '${key}' is invalid.`,
      );
    }
    if (
      key === THEME_DEVELOPMENT_RUNTIME_ENV ||
      key === THEME_DEVELOPMENT_RUNTIME_ADAPTER_ENV ||
      key.startsWith("PUBLIC_") ||
      key.startsWith("VITE_")
    ) {
      throw new Error(
        `Theme development private environment key '${key}' is reserved or public.`,
      );
    }
    environment[key] = value;
  }
  return environment;
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

function waitForClose(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

function terminateDevelopmentProcess(
  child: ChildProcess,
  ownsProcessGroup: boolean,
): void {
  if (ownsProcessGroup && typeof child.pid === "number" && child.pid > 0) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch (error) {
      if (!isErrnoException(error, "ESRCH")) throw error;
    }
  }
  child.kill("SIGTERM");
}

function isErrnoException(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
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
    const exitCode = await waitForClose(child);
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
  const projectRoot = path.resolve(options.projectRoot);
  const ownsProcessGroup = !options.runner && process.platform !== "win32";
  const prepareRuntime = async (
    runtime: ThemeDevelopmentRuntimeReference | undefined,
  ) => {
    if (!runtime) return {};
    const descriptor = parseThemeDevelopmentRuntimeDescriptor(
      runtime.descriptor,
    );
    const adapterId = validateAdapterId(runtime.adapter.id);
    const prepared = await runtime.adapter.prepare({
      descriptor,
      projectRoot,
      signal: options.signal,
    });
    try {
      return {
        prepared,
        environment: {
          ...privateChildEnvironment(prepared.childEnvironment),
          [THEME_DEVELOPMENT_RUNTIME_ENV]: JSON.stringify(descriptor),
          [THEME_DEVELOPMENT_RUNTIME_ADAPTER_ENV]: adapterId,
        },
      };
    } catch (error) {
      await prepared.dispose?.();
      throw error;
    }
  };

  let active = await prepareRuntime(options.runtime);
  let child: ChildProcess | undefined;
  let childCompletion: Promise<number> | undefined;
  let childClosed = true;
  let closed = false;
  let restarting = false;
  let resolveCompleted!: (exitCode: number) => void;
  const completed = new Promise<number>((resolve) => {
    resolveCompleted = resolve;
  });

  const start = (environment: NodeJS.ProcessEnv | undefined) => {
    // Astro 7 auto-backgrounds itself when it detects an agentic parent. Any
    // truthy value suppresses that detection; Astro does not interpret the
    // value. Keep the child in the foreground so this handle owns its lifetime.
    const childEnvironment = {
      ...environment,
      ASTRO_DEV_BACKGROUND: "0",
    };
    const next = (options.runner ?? defaultRunner)(
      invocation(
        command,
        projectRoot,
        options.signal,
        undefined,
        childEnvironment,
        true,
      ),
    );
    child = next;
    childClosed = false;
    let observed = false;
    let resolveChildCompletion!: (exitCode: number) => void;
    childCompletion = new Promise<number>((resolve) => {
      resolveChildCompletion = resolve;
    });
    const complete = (exitCode: number) => {
      if (observed) return;
      observed = true;
      resolveChildCompletion(exitCode);
      if (child === next) childClosed = true;
      if (!restarting && !closed) resolveCompleted(exitCode);
    };
    next.once("error", () => complete(1));
    next.once("close", (code, signal) => complete(code ?? (signal ? 1 : 0)));
    return next;
  };

  try {
    start(active.environment);
  } catch (error) {
    await active.prepared?.dispose?.();
    throw error;
  }
  const finalized = completed.then(async (exitCode) => {
    await active.prepared?.dispose?.();
    return exitCode;
  });
  let closing: Promise<void> | undefined;

  return {
    url: `http://${host}:${port}`,
    wait() {
      return finalized;
    },
    async reload(runtime) {
      if (closed)
        throw new Error("Cannot reload a closed Theme development server.");
      if (!child || childClosed) {
        throw new Error("Cannot reload a stopped Theme development server.");
      }
      const replacement = await prepareRuntime(runtime);
      const previous = child;
      const previousCompletion = childCompletion;
      let previousStopped = false;
      if (childClosed || !previousCompletion) {
        await replacement.prepared?.dispose?.();
        throw new Error("Cannot reload a stopped Theme development server.");
      }
      restarting = true;
      try {
        terminateDevelopmentProcess(previous, ownsProcessGroup);
        await previousCompletion;
        previousStopped = true;
        await active.prepared?.dispose?.();
        active = {};
        restarting = false;
        start(replacement.environment);
        active = replacement;
      } catch (error) {
        await replacement.prepared?.dispose?.();
        // Once the previous child has stopped, a failed replacement cannot be
        // represented as a healthy development handle. Settle `wait()` so the
        // CLI exits instead of remaining attached to a server that no longer
        // exists.
        if (previousStopped) {
          closed = true;
          resolveCompleted(1);
        }
        throw error;
      } finally {
        restarting = false;
      }
    },
    close() {
      if (closing) return closing;
      closing = (async () => {
        closed = true;
        if (child && !childClosed) {
          restarting = true;
          const stopped = childCompletion;
          terminateDevelopmentProcess(child, ownsProcessGroup);
          await stopped;
          restarting = false;
        }
        resolveCompleted(0);
        await finalized;
      })();
      return closing;
    },
  };
}

/** Additive alias using the shorter SDK vocabulary. */
export const devTheme = developTheme;
