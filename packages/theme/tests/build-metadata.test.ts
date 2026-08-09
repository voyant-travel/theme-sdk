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
    expect(first.schemaVersion).toBe("voyant.theme.build.v3");
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

  it("carries the settings a theme declares, in declaration order", async () => {
    // A host renders its settings editor from this list. Dropping it here
    // would leave `manifest.settings` validated but invisible, so a theme
    // could declare a setting nobody can ever supply a value for.
    const theme = validTheme();
    theme.manifest.settings = [
      { id: "brand-color", label: "Brand colour", type: "text" },
      {
        id: "density",
        label: "Density",
        type: "select",
        options: [
          { label: "Comfortable", value: "comfortable" },
          { label: "Compact", value: "compact" },
        ],
      },
    ];
    const checked = checkThemeDefinition(theme);
    const root = await mkdtemp(path.join(tmpdir(), "voyant-settings-"));
    if (!checked.theme) throw new Error("Test setup failed.");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist", "index.html"), "home");

    const metadata = await createThemeBuildMetadata({
      projectRoot: root,
      outputDirectory: "dist",
      theme: checked.theme,
    });
    expect(metadata.settings.map((field) => field.id)).toEqual([
      "brand-color",
      "density",
    ]);
  });

  it("carries templates and content bindings after routes and sections", async () => {
    // Without this the declaration reaches the build and stops: the platform
    // reads these to decide whether an operator's mapping satisfies the theme,
    // so a theme could declare a required slot and the check would pass
    // against an empty declaration.
    const theme = validTheme();
    theme.manifest.settings = [
      { id: "brand-color", label: "Brand colour", type: "text" },
    ];
    theme.manifest.templates = [
      { id: "feature", name: "Feature story", context: "content" },
    ];
    theme.manifest.contentBindings = [
      {
        id: "guides",
        name: "Travel guides",
        fields: [
          { id: "summary", label: "Summary", type: "text", required: true },
        ],
      },
    ];
    theme.manifest.capabilities = [
      { id: "catalog.search.v1" },
      { id: "shopping.search.v1" },
      { id: "shopping.trip-selections.v1" },
      { id: "shopping.trip-booking.v1" },
      { id: "checkout.v1", required: false },
    ];
    const checked = checkThemeDefinition(theme);
    const root = await mkdtemp(path.join(tmpdir(), "voyant-bindings-"));
    if (!checked.theme) throw new Error("Test setup failed.");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist", "index.html"), "home");

    const metadata = await createThemeBuildMetadata({
      projectRoot: root,
      outputDirectory: "dist",
      theme: checked.theme,
    });

    expect(metadata.contentBindings?.[0]?.fields[0]?.required).toBe(true);
    expect(metadata.templates).toEqual([
      { id: "feature", name: "Feature story", context: "content" },
    ]);
    expect(metadata.capabilities).toEqual([
      { id: "catalog.search.v1", required: true },
      { id: "shopping.search.v1", required: true },
      { id: "shopping.trip-selections.v1", required: true },
      { id: "shopping.trip-booking.v1", required: true },
      { id: "checkout.v1", required: false },
    ]);
    // The position is part of what the digest commits to, and the platform
    // rebuilds the object in this order to verify it.
    const keys = Object.keys(metadata);
    expect(keys.indexOf("templates")).toBe(keys.indexOf("routes") + 1);
    expect(keys.indexOf("settings")).toBe(keys.indexOf("templates") + 1);
    expect(keys.indexOf("sections")).toBe(keys.indexOf("settings") + 1);
    expect(keys.indexOf("contentBindings")).toBe(keys.indexOf("sections") + 1);
    expect(keys.indexOf("capabilities")).toBe(
      keys.indexOf("contentBindings") + 1,
    );
    expect(keys.indexOf("outputDirectory")).toBe(
      keys.indexOf("capabilities") + 1,
    );
  });

  it("carries sections between settings and content bindings", async () => {
    const theme = validTheme();
    theme.manifest.sections = [
      {
        id: "hero",
        name: "Hero",
        settings: [{ id: "heading", label: "Heading", type: "text" }],
        blocks: [
          {
            type: "button",
            name: "Button",
            limit: 2,
            settings: [{ id: "label", label: "Label", type: "text" }],
          },
        ],
        max_blocks: 2,
        limit: 1,
        presets: [
          {
            name: "Hero",
            settings: {
              heading: { zebra: 1, alpha: { zulu: true, beta: false } },
            },
            blocks: [
              {
                type: "button",
                settings: { label: { zebra: 1, alpha: 2 } },
              },
            ],
          },
        ],
        templates: ["home"],
      },
    ];
    const checked = checkThemeDefinition(theme);
    const root = await mkdtemp(path.join(tmpdir(), "voyant-sections-"));
    if (!checked.theme) throw new Error("Test setup failed.");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist", "index.html"), "home");

    const metadata = await createThemeBuildMetadata({
      projectRoot: root,
      outputDirectory: "dist",
      theme: checked.theme,
    });

    expect(metadata.sections[0]?.blocks[0]?.limit).toBe(2);
    expect(
      Object.keys(
        (metadata.sections[0]?.presets[0]?.settings.heading ?? {}) as object,
      ),
    ).toEqual(["alpha", "zebra"]);
    expect(
      Object.keys(
        (
          (metadata.sections[0]?.presets[0]?.settings.heading ?? {}) as {
            alpha?: object;
          }
        ).alpha ?? {},
      ),
    ).toEqual(["beta", "zulu"]);
    expect(
      Object.keys(
        (metadata.sections[0]?.presets[0]?.blocks[0]?.settings.label ??
          {}) as object,
      ),
    ).toEqual(["alpha", "zebra"]);
    expect(Object.keys(metadata).slice(3, 10)).toEqual([
      "routes",
      "templates",
      "settings",
      "sections",
      "contentBindings",
      "capabilities",
      "outputDirectory",
    ]);
    expect(Object.keys(metadata.sections[0] ?? {})).toEqual([
      "id",
      "name",
      "settings",
      "blocks",
      "max_blocks",
      "limit",
      "presets",
      "templates",
    ]);
  });

  it("accepts a colour setting and rejects a default that is not one", async () => {
    // A host renders this as a swatch picker, so the default has to be a value
    // a picker can show. Accepting `rebeccapurple` or `oklch(...)` would mean
    // every host had to parse CSS colours before it could render the control.
    const theme = validTheme();
    theme.manifest.settings = [
      { id: "accent", label: "Accent", type: "color", default: "#0b3d2e" },
    ];
    expect(checkThemeDefinition(theme).theme).toBeTruthy();

    const shorthand = validTheme();
    shorthand.manifest.settings = [
      { id: "accent", label: "Accent", type: "color", default: "#0b3" },
    ];
    expect(checkThemeDefinition(shorthand).theme).toBeTruthy();

    for (const bad of ["rebeccapurple", "0b3d2e", "#0b3d2", "rgb(1,2,3)"]) {
      const invalid = validTheme();
      invalid.manifest.settings = [
        { id: "accent", label: "Accent", type: "color", default: bad },
      ];
      expect(checkThemeDefinition(invalid).theme).toBeFalsy();
    }
  });

  it("carries an empty list for a theme that declares no settings", async () => {
    const checked = checkThemeDefinition(validTheme());
    const root = await mkdtemp(path.join(tmpdir(), "voyant-nosettings-"));
    if (!checked.theme) throw new Error("Test setup failed.");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist", "index.html"), "home");

    const metadata = await createThemeBuildMetadata({
      projectRoot: root,
      outputDirectory: "dist",
      theme: checked.theme,
    });
    expect(metadata.settings).toEqual([]);
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
