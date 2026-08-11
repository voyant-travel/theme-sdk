import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePublicationSystemRoute = vi.fn();
const resolveThemeContext = vi.fn();

vi.mock("virtual:voyant-theme", () => ({
  resolvePublicationSystemRoute,
  resolveThemeContext,
}));

const { onRequest } = await import("../src/middleware.js");

describe("theme middleware", () => {
  beforeEach(() => {
    resolvePublicationSystemRoute.mockReset();
    resolveThemeContext.mockReset();
  });

  it("returns a publication system document before rendering a catch-all page", async () => {
    const systemResponse = new Response("Not found", {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
    resolvePublicationSystemRoute.mockResolvedValue(systemResponse);
    const next = vi.fn();
    const request = new Request("https://preview.example/sitemap.xml");

    const response = await onRequest({ request }, next);

    expect(response).toBe(systemResponse);
    expect(resolvePublicationSystemRoute).toHaveBeenCalledWith(request);
    expect(next).not.toHaveBeenCalled();
    expect(resolveThemeContext).not.toHaveBeenCalled();
  });

  it("continues ordinary requests when no system document is resolved", async () => {
    resolvePublicationSystemRoute.mockResolvedValue(undefined);
    const rendered = Response.json({ ok: true });
    const next = vi.fn(async () => rendered);
    const request = new Request("https://preview.example/tours");

    const response = await onRequest({ request }, next);

    expect(response).toBe(rendered);
    expect(next).toHaveBeenCalledTimes(1);
    expect(resolveThemeContext).not.toHaveBeenCalled();
  });
});
