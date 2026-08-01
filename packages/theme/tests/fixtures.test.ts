import { describe, expect, it } from "vitest";
import { checkThemeDefinition, createFixtureRouter } from "../src/index.js";
import { validTheme } from "./helpers.js";

describe("createFixtureRouter", () => {
  it("resolves home, content, and notFound contexts", () => {
    const checked = checkThemeDefinition(validTheme());
    if (!checked.theme) throw new Error("Test setup failed.");
    const router = createFixtureRouter(checked.theme);
    expect(router.resolve("/").kind).toBe("home");
    expect(router.resolve("https://example.test/stories/one/").kind).toBe(
      "content",
    );
    expect(router.resolve("/somewhere-else")).toMatchObject({
      kind: "notFound",
      path: "/somewhere-else",
    });
  });
});
