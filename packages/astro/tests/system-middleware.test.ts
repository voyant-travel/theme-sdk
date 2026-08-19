import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePublicationSystemRoute = vi.fn();
const resolveThemePublicApiRoute = vi.fn();

vi.mock("virtual:voyant-theme", () => ({
  resolvePublicationSystemRoute,
  resolveThemePublicApiRoute,
}));

const { onRequest } = await import("../src/system-middleware.js");

describe("theme system middleware", () => {
  beforeEach(() => {
    resolvePublicationSystemRoute.mockReset();
    resolveThemePublicApiRoute.mockReset();
  });

  it("serves a connected Public API response before theme routes", async () => {
    const relayed = Response.json({ data: [] });
    resolveThemePublicApiRoute.mockResolvedValue(relayed);
    const next = vi.fn();
    const request = new Request(
      "http://localhost:4321/v1/public/catalog/search",
    );

    await expect(onRequest({ request }, next)).resolves.toBe(relayed);
    expect(resolvePublicationSystemRoute).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns a publication system document without entering theme middleware", async () => {
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
  });

  it("continues ordinary requests", async () => {
    resolvePublicationSystemRoute.mockResolvedValue(undefined);
    const rendered = Response.json({ ok: true });
    const next = vi.fn(async () => rendered);
    const request = new Request("https://preview.example/tours");

    await expect(onRequest({ request }, next)).resolves.toBe(rendered);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
