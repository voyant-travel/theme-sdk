import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveThemeContext = vi.fn();

vi.mock("virtual:voyant-theme", () => ({
  resolveThemeContext,
}));

const { onRequest } = await import("../src/middleware.js");

describe("theme middleware", () => {
  beforeEach(() => {
    resolveThemeContext.mockReset();
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
});
