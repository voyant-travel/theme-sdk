import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createThemeBuildMetadata,
  loadThemeProject,
  parseThemeBuildRuntime,
} from "../packages/theme/dist/tooling.js";

const projectRoot = path.resolve("examples/minimal");
await access(path.join(projectRoot, "dist"));

const project = await loadThemeProject({ projectRoot });
assert.equal(project.diagnostics.length, 0);
assert.ok(project.theme);
const metadata = await createThemeBuildMetadata({
  projectRoot,
  outputDirectory: "dist",
  theme: project.theme,
  runtime: parseThemeBuildRuntime(
    JSON.parse(
      await readFile(
        path.join(projectRoot, ".voyant/theme-runtime.json"),
        "utf8",
      ),
    ),
  ),
});
assert.deepEqual(metadata.routes, [
  {
    id: "cruise-detail",
    pattern: "/cruises/[slug]",
    context: "cruiseDetail",
  },
  { id: "cruises", pattern: "/cruises", context: "cruiseIndex" },
  { id: "home", pattern: "/", context: "home" },
  { id: "journal-entry", pattern: "/journal/[...path]", context: "content" },
  { id: "not-found", pattern: "/404", context: "notFound" },
  {
    id: "sailing-detail",
    pattern: "/sailings/[slug]",
    context: "sailingDetail",
  },
  { id: "ship-detail", pattern: "/ships/[slug]", context: "shipDetail" },
  { id: "tour-detail", pattern: "/tours/[slug]", context: "tourDetail" },
  { id: "tours", pattern: "/tours", context: "tourIndex" },
]);
assert.ok(metadata.files.some((file) => file.path === "server/entry.mjs"));
assert.deepEqual(metadata.runtime, {
  schemaVersion: "voyant.theme.runtime.v1",
  platform: "cloudflare-workers",
  entrypoint: "server/entry.mjs",
  assetsDirectory: "client",
  assetsBinding: "ASSETS",
  compatibilityFlags: ["nodejs_compat"],
  requiredBindings: [
    "PUBLICATION",
    "VOYANT_PUBLICATION_TOKEN",
    "VOYANT_SITE_ID",
    "VOYANT_PUBLICATION_ID",
    "VOYANT_THEME_RELEASE_ID",
  ],
});
assert.match(metadata.digest, /^[a-f0-9]{64}$/);

const persisted = JSON.parse(
  await readFile(path.join(projectRoot, ".voyant/theme-build.json"), "utf8"),
);
assert.deepEqual(persisted, metadata);
