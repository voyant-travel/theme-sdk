import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

export interface ThemeBuildMetadata {
  schemaVersion: "voyant.theme.build.v1";
  contractVersion: ParsedThemeDefinition["contractVersion"];
  theme: { id: string; version: string };
  routes: Array<{ id: string; pattern: string; context: string }>;
  outputDirectory: string;
  files: ThemeBuildFile[];
  digest: string;
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

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function collectBuildFiles(
  root: string,
  directory = root,
): Promise<ThemeBuildFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: ThemeBuildFile[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
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
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function createThemeBuildMetadata(options: {
  projectRoot: string;
  outputDirectory: string;
  theme: ParsedThemeDefinition;
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
  const canonical = {
    schemaVersion: "voyant.theme.build.v1" as const,
    contractVersion: options.theme.contractVersion,
    theme: {
      id: options.theme.manifest.id,
      version: options.theme.manifest.version,
    },
    routes: options.theme.manifest.routes
      .map(({ id, pattern, context }) => ({ id, pattern, context }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    outputDirectory: normalizedOutput,
    files: await collectBuildFiles(outputPath),
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

  const command = project.theme.tooling?.build ?? [
    "pnpm",
    "exec",
    "astro",
    "build",
  ];
  try {
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
  const base = project.theme.tooling?.dev ?? ["pnpm", "exec", "astro", "dev"];
  const command = [...base, "--host", host, "--port", String(port)];
  const child = (options.runner ?? defaultRunner)(
    invocation(command, path.resolve(options.projectRoot), options.signal),
  );
  const completed = waitForExit(child);
  let closing: Promise<void> | undefined;

  return {
    url: `http://${host}:${port}`,
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
