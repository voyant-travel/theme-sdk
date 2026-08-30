import { describe, expect, it } from "vitest";
import { CLOUDFLARE_THEME_RUNTIME } from "../src/deployment.js";
import {
  PLATFORM_API_URL_BINDING,
  PUBLICATION_BINDING_NAMES,
} from "../src/runtime.js";

describe("Cloudflare theme runtime contract", () => {
  it("declares every binding used by the managed consent proxy", () => {
    expect(CLOUDFLARE_THEME_RUNTIME.requiredBindings).toEqual([
      ...PUBLICATION_BINDING_NAMES,
      PLATFORM_API_URL_BINDING,
    ]);
  });
});
