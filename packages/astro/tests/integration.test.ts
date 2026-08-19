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
    vi.stubEnv("VOYANT_THEME_DEVELOPMENT_RUNTIME", '{"sessionId":"tds_123"}');
    vi.stubEnv("VOYANT_THEME_DEVELOPMENT_RUNTIME_ADAPTER", "voyant-platform");
    vi.stubEnv("VOYANT_THEME_DEVELOPMENT_CAPABILITY", "private-capability");
    const integration = voyantTheme({ theme });
    const addMiddleware = vi.fn();
    const updateConfig = vi.fn();
    const setup = integration.hooks?.["astro:config:setup"];
    if (typeof setup !== "function") throw new Error("Expected setup hook.");

    setup({
      addMiddleware,
      command: "dev",
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
    const serverSource = vitePlugin?.load?.("\0virtual:voyant-theme", {
      ssr: true,
    });
    const clientSource = vitePlugin?.load?.("\0virtual:voyant-theme", {
      ssr: false,
    });
    expect(serverSource).not.toContain("process.env");
    expect(serverSource).toContain("private-capability");
    expect(serverSource).toContain(
      "resolveContext(input, env, privateEnvironment)",
    );
    expect(serverSource).toContain(
      "resolvePublicApiRoute(request, privateEnvironment)",
    );
    expect(clientSource).not.toContain("private-capability");
    expect(clientSource).toContain("const privateEnvironment = undefined");
    vi.unstubAllEnvs();
  });

  it("never embeds connected development secrets in build modules", () => {
    vi.stubEnv("VOYANT_THEME_DEVELOPMENT_CAPABILITY", "must-not-build");
    const integration = voyantTheme({ theme });
    const updateConfig = vi.fn();
    const setup = integration.hooks?.["astro:config:setup"];
    if (typeof setup !== "function") throw new Error("Expected setup hook.");

    setup({
      addMiddleware: vi.fn(),
      command: "build",
      config: { root: new URL("file:///theme/") },
      logger: { error: vi.fn() },
      updateConfig,
    } as never);
    const vitePlugin = updateConfig.mock.calls[0]?.[0]?.vite?.plugins?.[0];
    const source = vitePlugin?.load?.("\0virtual:voyant-theme", { ssr: true });
    expect(source).not.toContain("must-not-build");
    expect(source).toContain("const privateEnvironment = undefined");
    vi.unstubAllEnvs();
  });
});
