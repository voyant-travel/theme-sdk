import { describe, expect, it, vi } from "vitest";
import { voyantTheme } from "../src/index.js";

const theme = {
  contractVersion: "v1" as const,
  manifest: {
    id: "middleware-order",
    name: "Middleware order",
    version: "1.0.0",
    routes: [
      { id: "home", pattern: "/", context: "home" as const },
      {
        id: "content",
        pattern: "/stories/[...path]",
        context: "content" as const,
      },
      { id: "not-found", pattern: "/404", context: "notFound" as const },
    ],
  },
  fixtures: {
    home: {
      kind: "home" as const,
      path: "/" as const,
      locale: "en",
      site: { name: "Fixture site" },
      seo: { title: "Home" },
      title: "Home",
    },
    content: [],
    notFound: {
      kind: "notFound" as const,
      path: "/404",
      locale: "en",
      site: { name: "Fixture site" },
      seo: { title: "Missing" },
      title: "Missing",
    },
  },
};

describe("voyantTheme middleware ordering", () => {
  it("guards platform routes before themes and injects code after themes", () => {
    const integration = voyantTheme({ theme });
    const addMiddleware = vi.fn();
    const setup = integration.hooks?.["astro:config:setup"];
    if (typeof setup !== "function") throw new Error("Expected setup hook.");

    setup({
      addMiddleware,
      config: { root: new URL("file:///theme/") },
      logger: { error: vi.fn() },
      updateConfig: vi.fn(),
    } as never);

    expect(addMiddleware.mock.calls).toEqual([
      [
        {
          entrypoint: "@voyant-travel/astro/system-middleware",
          order: "pre",
        },
      ],
      [{ entrypoint: "@voyant-travel/astro/middleware", order: "post" }],
    ]);
  });
});
