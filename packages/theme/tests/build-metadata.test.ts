import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkThemeDefinition } from "../src/index.js";
import { createThemeBuildMetadata } from "../src/tooling.js";
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
});
