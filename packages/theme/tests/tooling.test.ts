import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLING_SCHEMA_VERSION } from "../src/index.js";
import { buildTheme, developTheme, validateTheme } from "../src/tooling.js";
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
});
