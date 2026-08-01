import { describe, expect, it } from "vitest";
import { createThemeContextResolver } from "../src/runtime.js";

describe("createThemeContextResolver", () => {
  it("rejects an invalid contract before rendering", () => {
    expect(() =>
      createThemeContextResolver({ contractVersion: "future" } as never),
    ).toThrow("THEME_SCHEMA_INVALID");
  });
});
