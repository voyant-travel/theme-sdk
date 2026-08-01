import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLING_SCHEMA_VERSION } from "../src/index.js";
import { validateTheme } from "../src/tooling.js";
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
