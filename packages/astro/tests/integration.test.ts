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
    const updateConfig = vi.fn();
    const setup = integration.hooks?.["astro:config:setup"];
    if (typeof setup !== "function") throw new Error("Expected setup hook.");

    setup({
      addMiddleware,
      config: { root: new URL("file:///theme/") },
      logger: { error: vi.fn() },
      updateConfig,
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

    const vitePlugin = updateConfig.mock.calls[0]?.[0]?.vite?.plugins?.[0];
    const source = vitePlugin?.load?.("\0virtual:voyant-theme");
    expect(source).toContain("import.meta.env.SSR");
    expect(source).toContain("process.env");
    expect(source).toContain("resolveContext(input, env, privateEnvironment)");
    expect(source).not.toContain("VOYANT_THEME_DEVELOPMENT_CAPABILITY");
    expect(source).not.toContain("PUBLIC_");
    expect(source).not.toContain("VITE_");
  });
});
