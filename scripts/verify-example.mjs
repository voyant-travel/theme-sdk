import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createThemeBuildMetadata,
  loadThemeProject,
} from "../packages/theme/dist/tooling.js";

const projectRoot = path.resolve("examples/minimal");
const expectedFiles = [
  "dist/index.html",
  "dist/journal/hello-world/index.html",
  "dist/404.html",
];
for (const file of expectedFiles) await access(path.join(projectRoot, file));

const project = await loadThemeProject({ projectRoot });
assert.equal(project.diagnostics.length, 0);
assert.ok(project.theme);
const metadata = await createThemeBuildMetadata({
  projectRoot,
  outputDirectory: "dist",
  theme: project.theme,
});
assert.deepEqual(metadata.routes, [
  { id: "home", pattern: "/", context: "home" },
  { id: "journal-entry", pattern: "/journal/[...path]", context: "content" },
  { id: "not-found", pattern: "/404", context: "notFound" },
]);
assert.ok(metadata.files.some((file) => file.path === "index.html"));
assert.match(metadata.digest, /^[a-f0-9]{64}$/);

const persisted = JSON.parse(
  await readFile(path.join(projectRoot, ".voyant/theme-build.json"), "utf8"),
);
assert.deepEqual(persisted, metadata);
