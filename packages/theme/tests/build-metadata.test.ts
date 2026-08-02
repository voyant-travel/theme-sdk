import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkThemeDefinition } from "../src/index.js";
import {
  createThemeBuildMetadata,
  parseThemeBuildRuntime,
} from "../src/tooling.js";
import { validTheme } from "./helpers.js";

describe("createThemeBuildMetadata", () => {
  it("is canonical across project roots and file creation order", async () => {
    const checked = checkThemeDefinition(validTheme());
    const roots = await Promise.all([
      mkdtemp(path.join(tmpdir(), "voyant-a-")),
      mkdtemp(path.join(tmpdir(), "voyant-b-")),
    ]);
    const [firstRoot, secondRoot] = roots;
    if (!firstRoot || !secondRoot || !checked.theme)
      throw new Error("Test setup failed.");
    for (const [index, root] of roots.entries()) {
      await mkdir(path.join(root, "dist", "assets"), { recursive: true });
      const files: Array<[string, string]> =
        index === 0
          ? [
              ["index.html", "home"],
              ["assets/app.js", "app"],
            ]
          : [
              ["assets/app.js", "app"],
              ["index.html", "home"],
            ];
      for (const [name, content] of files)
        await writeFile(path.join(root, "dist", name), content);
    }

    const first = await createThemeBuildMetadata({
      projectRoot: firstRoot,
      outputDirectory: "dist",
      theme: checked.theme,
    });
    const second = await createThemeBuildMetadata({
      projectRoot: secondRoot,
      outputDirectory: "dist",
      theme: checked.theme,
    });
    expect(first).toEqual(second);
    expect(first.files.map((file) => file.path)).toEqual([
      "assets/app.js",
      "index.html",
    ]);
    expect(first.schemaVersion).toBe("voyant.theme.build.v2");
    expect(first.runtime).toBeNull();
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      JSON.parse(
        await readFile(
          path.join(firstRoot, ".voyant/theme-build.json"),
          "utf8",
        ),
      ),
    ).toEqual(first);
  });

  it("orders paths by code unit rather than locale collation", async () => {
    const checked = checkThemeDefinition(validTheme());
    const root = await mkdtemp(path.join(tmpdir(), "voyant-order-"));
    if (!checked.theme) throw new Error("Test setup failed.");
    await mkdir(path.join(root, "dist", "client"), { recursive: true });
    // `.` is U+002E and `_` is U+005F, so a code-unit sort puts the dotfile
    // first. Locale collation treats both as ignorable punctuation and orders
    // them the other way round, which downstream verification rejects because
    // it compares paths relationally.
    for (const name of ["_headers", ".assetsignore", "app.css"])
      await writeFile(path.join(root, "dist/client", name), name);

    const metadata = await createThemeBuildMetadata({
      projectRoot: root,
      outputDirectory: "dist",
      theme: checked.theme,
    });

    const paths = metadata.files.map((file) => file.path);
    expect(paths).toEqual([
      "client/.assetsignore",
      "client/_headers",
      "client/app.css",
    ]);
    expect(paths).toEqual([...paths].sort());
    expect(
      paths.some((value, index) => {
        const previous = paths[index - 1];
        return previous !== undefined && previous > value;
      }),
    ).toBe(false);
  });

  it("records a validated Cloudflare server runtime in the artifact digest", async () => {
    const checked = checkThemeDefinition(validTheme());
    const root = await mkdtemp(path.join(tmpdir(), "voyant-runtime-"));
    if (!checked.theme) throw new Error("Test setup failed.");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await mkdir(path.join(root, "dist/client"), { recursive: true });
    await mkdir(path.join(root, "dist/server"), { recursive: true });
    await writeFile(path.join(root, "dist/client/app.css"), "asset");
    await writeFile(path.join(root, "dist/server/entry.mjs"), "worker");
    const runtime = parseThemeBuildRuntime({
      schemaVersion: "voyant.theme.runtime.v1",
      platform: "cloudflare-workers",
      entrypoint: "server/entry.mjs",
      assetsDirectory: "client",
      assetsBinding: "ASSETS",
      compatibilityFlags: ["nodejs_compat"],
      requiredBindings: ["PUBLICATION", "VOYANT_PUBLICATION_TOKEN"],
    });

    const metadata = await createThemeBuildMetadata({
      projectRoot: root,
      outputDirectory: "dist",
      theme: checked.theme,
      runtime,
    });

    expect(metadata.runtime).toEqual(runtime);
    expect(metadata.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a runtime descriptor for a different artifact directory", async () => {
    const checked = checkThemeDefinition(validTheme());
    const root = await mkdtemp(path.join(tmpdir(), "voyant-runtime-path-"));
    if (!checked.theme) throw new Error("Test setup failed.");
    await mkdir(path.join(root, "dist/client"), { recursive: true });
    await writeFile(path.join(root, "dist/client/app.css"), "asset");

    await expect(
      createThemeBuildMetadata({
        projectRoot: root,
        outputDirectory: "dist",
        theme: checked.theme,
        runtime: parseThemeBuildRuntime({
          schemaVersion: "voyant.theme.runtime.v1",
          platform: "cloudflare-workers",
          entrypoint: "server/missing.mjs",
          assetsDirectory: "client",
          assetsBinding: "ASSETS",
          compatibilityFlags: [],
          requiredBindings: [],
        }),
      }),
    ).rejects.toThrow("entrypoint");
  });
});
