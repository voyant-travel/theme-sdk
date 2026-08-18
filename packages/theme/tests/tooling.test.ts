import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  THEME_DEVELOPMENT_RUNTIME_SCHEMA_VERSION,
  THEME_EDITOR_PROTOCOL_VERSION,
  type ThemeDevelopmentRuntimeDescriptor,
  TOOLING_SCHEMA_VERSION,
} from "../src/index.js";
import {
  buildTheme,
  createThemeBuildMetadata,
  developTheme,
  THEME_DEVELOPMENT_RUNTIME_ADAPTER_ENV,
  THEME_DEVELOPMENT_RUNTIME_ENV,
  validateTheme,
} from "../src/tooling.js";
import { validTheme } from "./helpers.js";

describe("validateTheme", () => {
  it("loads the canonical theme.config.mjs and emits a versioned report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "voyant-theme-"));
    await writeFile(
      path.join(root, "theme.config.mjs"),
      `export default ${JSON.stringify(validTheme())};`,
    );
    const result = await validateTheme({ projectRoot: root });
    expect(result).toMatchObject({
      schemaVersion: TOOLING_SCHEMA_VERSION,
      ok: true,
    });
    expect(result.configPath).toBe(path.join(root, "theme.config.mjs"));
  });

  it("reports a missing canonical config deterministically", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "voyant-theme-"));
    const result = await validateTheme({ projectRoot: root });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "THEME_CONFIG_NOT_FOUND",
        severity: "error",
        path: "$",
      }),
    ]);
  });
});

function childProcessDouble(): ChildProcess & {
  emitError(error: Error): void;
  emitExit(code: number): void;
} {
  class TestChildProcess extends EventEmitter {
    exitCode: number | null = null;
    signalCode: NodeJS.Signals | null = null;
    killed = false;

    kill() {
      this.killed = true;
      this.emit("exit", 0, "SIGTERM");
      return true;
    }

    emitError(error: Error) {
      this.emit("error", error);
    }

    emitExit(code: number) {
      this.exitCode = code;
      this.emit("exit", code, null);
    }
  }

  return new TestChildProcess() as unknown as ChildProcess & {
    emitError(error: Error): void;
    emitExit(code: number): void;
  };
}

async function installFakeAstro(root: string): Promise<string> {
  const directory = path.join(root, "node_modules", "astro");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({
      name: "astro",
      version: "0.0.0-test",
      bin: { astro: "astro.js" },
    }),
  );
  const entry = path.join(directory, "astro.js");
  await writeFile(entry, "");
  return entry;
}

describe("buildTheme", () => {
  it("runs the project-installed Astro CLI without requiring a package manager binary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "voyant-theme-"));
    await writeFile(
      path.join(root, "theme.config.mjs"),
      `export default ${JSON.stringify(validTheme())};`,
    );
    const astroEntry = await installFakeAstro(root);
    const child = childProcessDouble();
    let received: { command: string; args: string[]; cwd: string } | undefined;
    const result = await buildTheme({
      projectRoot: root,
      runner: (command) => {
        received = command;
        setImmediate(() => child.emitExit(1));
        return child;
      },
    });

    expect(received).toMatchObject({
      command: process.execPath,
      args: [astroEntry, "build"],
      cwd: root,
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "THEME_BUILD_FAILED" }),
    );
  });
});

describe("developTheme", () => {
  async function projectWithConfig(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "voyant-theme-"));
    await writeFile(
      path.join(root, "theme.config.mjs"),
      `export default ${JSON.stringify(validTheme())};`,
    );
    await installFakeAstro(root);
    return root;
  }

  function connectedDescriptor(): ThemeDevelopmentRuntimeDescriptor {
    return {
      schemaVersion: THEME_DEVELOPMENT_RUNTIME_SCHEMA_VERSION,
      sessionId: "session_123",
      themeId: "voyant.minimal",
      siteId: "site_123",
      installationId: "installation_123",
      manifestDigest: "b".repeat(64),
      perspective: "development",
      contentEndpoint: "https://content.sandbox.onvoyant.com/v1",
      publicApiEndpoint: "https://api.sandbox.onvoyant.com/v1",
      editor: {
        baseUrl: "https://sandbox.onvoyant.com/themes/editor",
        protocolVersion: THEME_EDITOR_PROTOCOL_VERSION,
      },
      expiresAt: "2026-08-19T12:00:00.000Z",
    };
  }

  it("observes spawn errors immediately without a rejected background promise", async () => {
    const child = childProcessDouble();
    const handle = await developTheme({
      projectRoot: await projectWithConfig(),
      runner: () => child,
    });
    child.emitError(new Error("spawn failed"));
    await expect(handle.wait()).resolves.toBe(1);
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it("exposes an early nonzero process exit and keeps close idempotent", async () => {
    const child = childProcessDouble();
    const handle = await developTheme({
      projectRoot: await projectWithConfig(),
      runner: () => child,
    });
    child.emitExit(7);
    await expect(handle.wait()).resolves.toBe(7);
    await expect(
      Promise.all([handle.close(), handle.close()]),
    ).resolves.toEqual([undefined, undefined]);
  });

  it("keeps the old fixture-backed call free of connected runtime state", async () => {
    const child = childProcessDouble();
    let received: { args: string[]; env?: NodeJS.ProcessEnv } | undefined;
    const handle = await developTheme({
      projectRoot: await projectWithConfig(),
      runner: (invocation) => {
        received = invocation;
        return child;
      },
    });

    expect(received?.env).toBeUndefined();
    expect(received?.args).toEqual(
      expect.arrayContaining(["dev", "--host", "localhost", "--port", "4321"]),
    );
    child.emitExit(0);
    await expect(handle.wait()).resolves.toBe(0);
  });

  it("validates and forwards a connected descriptor through the selected Adapter", async () => {
    const child = childProcessDouble();
    const descriptor = connectedDescriptor();
    let preparedDescriptor: ThemeDevelopmentRuntimeDescriptor | undefined;
    let received: { args: string[]; env?: NodeJS.ProcessEnv } | undefined;
    let disposed = false;
    const handle = await developTheme({
      projectRoot: await projectWithConfig(),
      runtime: {
        descriptor,
        adapter: {
          id: "voyant-connected",
          prepare(context) {
            preparedDescriptor = context.descriptor;
            return {
              childEnvironment: {
                VOYANT_PRIVATE_DEVELOPMENT_CAPABILITY: "short-lived-secret",
              },
              dispose() {
                disposed = true;
              },
            };
          },
        },
      },
      runner: (invocation) => {
        received = invocation;
        return child;
      },
    });

    expect(preparedDescriptor).toEqual(descriptor);
    expect(received?.env?.[THEME_DEVELOPMENT_RUNTIME_ADAPTER_ENV]).toBe(
      "voyant-connected",
    );
    expect(
      JSON.parse(received?.env?.[THEME_DEVELOPMENT_RUNTIME_ENV] ?? "null"),
    ).toEqual(descriptor);
    expect(received?.env?.VOYANT_PRIVATE_DEVELOPMENT_CAPABILITY).toBe(
      "short-lived-secret",
    );
    child.emitExit(0);
    await expect(handle.wait()).resolves.toBe(0);
    expect(disposed).toBe(true);
  });

  it("keeps Adapter capabilities out of arguments and build/runtime metadata", async () => {
    const root = await projectWithConfig();
    const child = childProcessDouble();
    const secret = "capability-never-serialize-this";
    let received: { args: string[]; env?: NodeJS.ProcessEnv } | undefined;
    const handle = await developTheme({
      projectRoot: root,
      runtime: {
        descriptor: connectedDescriptor(),
        adapter: {
          id: "voyant-connected",
          prepare: () => ({
            childEnvironment: {
              VOYANT_PRIVATE_DEVELOPMENT_CAPABILITY: secret,
            },
          }),
        },
      },
      runner: (invocation) => {
        received = invocation;
        return child;
      },
    });

    expect(JSON.stringify(received?.args)).not.toContain(secret);
    expect(received?.env?.VOYANT_PRIVATE_DEVELOPMENT_CAPABILITY).toBe(secret);
    expect(received?.env?.[THEME_DEVELOPMENT_RUNTIME_ENV]).not.toContain(
      secret,
    );
    child.emitExit(0);
    await handle.wait();

    const checked = await validateTheme({ projectRoot: root });
    if (!checked.theme) throw new Error("Test setup failed.");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist/index.html"), "home");
    await createThemeBuildMetadata({
      projectRoot: root,
      outputDirectory: "dist",
      theme: checked.theme,
    });
    const voyantFiles = await Promise.all(
      ["theme-build.json", "theme-runtime.json"].map(async (name) => {
        try {
          return await readFile(path.join(root, ".voyant", name), "utf8");
        } catch {
          return "";
        }
      }),
    );
    expect(voyantFiles.join("\n")).not.toContain(secret);
  });

  it("rejects public environment names for short-lived capabilities", async () => {
    let disposed = false;
    await expect(
      developTheme({
        projectRoot: await projectWithConfig(),
        runtime: {
          descriptor: connectedDescriptor(),
          adapter: {
            id: "voyant-connected",
            prepare: () => ({
              childEnvironment: { VITE_CAPABILITY: "would-be-public" },
              dispose() {
                disposed = true;
              },
            }),
          },
        },
        runner: () => childProcessDouble(),
      }),
    ).rejects.toThrow("reserved or public");
    expect(disposed).toBe(true);
  });
});
