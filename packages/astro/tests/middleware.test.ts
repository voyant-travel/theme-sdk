import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveThemeContext = vi.fn();
const resolveThemeConsentConfiguration = vi.fn();

vi.mock("virtual:voyant-theme", () => ({
  resolveThemeConsentConfiguration,
  resolveThemeContext,
}));

const { onRequest } = await import("../src/middleware.js");

describe("theme middleware", () => {
  beforeEach(() => {
    resolveThemeContext.mockReset();
    resolveThemeConsentConfiguration.mockReset();
  });

  it("continues non-document responses without resolving page context", async () => {
    const rendered = Response.json({ ok: true });
    const next = vi.fn(async () => rendered);
    const request = new Request("https://preview.example/tours");

    const response = await onRequest({ request }, next);

    expect(response).toBe(rendered);
    expect(next).toHaveBeenCalledTimes(1);
    expect(resolveThemeContext).not.toHaveBeenCalled();
  });

  it("places managed consent before operator and theme scripts", async () => {
    resolveThemeContext.mockResolvedValue({
      codeInjection: { head: "<script data-operator></script>" },
    });
    resolveThemeConsentConfiguration.mockResolvedValue({
      schemaVersion: 1,
      surface: "theme",
      hostname: "www.example.com",
      regime: "strict_opt_in",
      provider: { mode: "external_gtm", gtmContainerId: "GTM-ABC123" },
      profile: null,
      presentationOverrides: null,
    });
    const next = vi.fn(
      async () =>
        new Response(
          "<html><head><script data-theme></script></head><body></body></html>",
          { headers: { "content-type": "text/html" } },
        ),
    );

    const response = await onRequest(
      { request: new Request("https://www.example.com/") },
      next,
    );
    const html = await response.text();

    expect(html.indexOf("data-voyant-consent-bootstrap")).toBeLessThan(
      html.indexOf("data-theme"),
    );
    expect(html.indexOf("data-voyant-consent-bootstrap")).toBeLessThan(
      html.indexOf("data-operator"),
    );
  });
});
