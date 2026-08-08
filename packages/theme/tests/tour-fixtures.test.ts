import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createTourFixtureAdapter,
  TourFixtureNetworkError,
  tourSellingFixtureMatrixSchema,
  tourSellingFixtureSchema,
} from "../src/index.js";

const matrix = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/tour-selling.json", import.meta.url),
    ),
    "utf8",
  ),
);

describe("tour selling fixture matrix", () => {
  it("covers the deterministic page and live journey states", () => {
    const parsed = tourSellingFixtureMatrixSchema.parse(matrix);
    const pairs = new Set(
      parsed.fixtures.map((fixture) => `${fixture.surface}:${fixture.state}`),
    );

    expect(pairs).toEqual(
      new Set([
        "index:populated",
        "index:empty",
        "index:error",
        "detail:rich",
        "detail:minimal",
        "detail:notFound",
        "detail:unavailable",
        "live:priced",
        "live:unpriced",
        "live:available",
        "live:soldOut",
        "live:invalid",
        "live:created",
        "live:held",
        "live:committed",
        "live:missing",
        "live:expired",
        "live:revisionConflict",
        "live:idempotencyConflict",
        "live:checkoutReady",
        "live:paymentPending",
        "live:paymentSucceeded",
        "live:paymentFailed",
        "live:providerError",
        "live:networkError",
        "live:malformed",
      ]),
    );
  });

  it("keeps commercial state out of every immutable page context", () => {
    const parsed = tourSellingFixtureMatrixSchema.parse(matrix);
    const serializedPages = JSON.stringify(
      parsed.fixtures.filter((fixture) => fixture.surface !== "live"),
    );

    for (const key of [
      '"price"',
      '"availability"',
      '"offerId"',
      '"sessionId"',
      '"checkoutId"',
      '"payment"',
    ]) {
      expect(serializedPages).not.toContain(key);
    }
  });

  it("rejects unknown authoring keys and mismatched state semantics", () => {
    expect(
      tourSellingFixtureSchema.safeParse({
        id: "wrong",
        surface: "live",
        state: "priced",
        capability: "catalog.pricing.v1",
        request: {
          method: "POST",
          path: "/v1/public/theme/catalog/pricing",
          provider: "private-provider",
        },
        result: {
          transport: "http",
          status: 200,
          body: {
            kind: "offer",
            offerId: "offer-1",
            productId: "tour-1",
            total: { amountMinor: 100, currency: "EUR" },
            expiresAt: "2030-01-01T10:00:00Z",
          },
        },
      }).success,
    ).toBe(false);

    const priced = structuredClone(
      matrix.fixtures.find(
        (fixture: { id: string }) => fixture.id === "offer-priced",
      ),
    );
    priced.state = "soldOut";
    expect(tourSellingFixtureSchema.safeParse(priced).success).toBe(false);
  });

  it("requires typed booking action bodies for PATCH fixtures", () => {
    const held = structuredClone(
      matrix.fixtures.find(
        (fixture: { id: string }) => fixture.id === "booking-held",
      ),
    );
    expect(tourSellingFixtureSchema.safeParse(held).success).toBe(true);

    delete held.request.body.quoteId;
    expect(tourSellingFixtureSchema.safeParse(held).success).toBe(false);
  });

  it("returns isolated deterministic fixtures and rejects duplicate ids", () => {
    const adapter = createTourFixtureAdapter(matrix);
    const first = adapter.get("booking-held");
    const second = adapter.get("booking-held");
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(adapter.list("detail")).toHaveLength(4);
    expect(adapter.get("unknown")).toBeUndefined();

    expect(() =>
      createTourFixtureAdapter({
        version: "v1",
        fixtures: [matrix.fixtures[0], matrix.fixtures[0]],
      }),
    ).toThrow("Duplicate tour fixture id 'index-populated'.");
  });

  it("represents malformed and network failures without pretending they are HTTP bodies", () => {
    const adapter = createTourFixtureAdapter(matrix);
    expect(adapter.get("live-network-error")).toMatchObject({
      surface: "live",
      result: { transport: "networkError", code: "timeout" },
    });
    expect(adapter.get("live-malformed-response")).toMatchObject({
      surface: "live",
      result: { transport: "malformed", rawBody: "{not-json" },
    });
    expect(() => adapter.respond("live-network-error")).toThrow(
      TourFixtureNetworkError,
    );
    const malformed = adapter.respond("live-malformed-response");
    expect(malformed.status).toBe(200);
    expect(malformed.headers.get("Content-Type")).toBe("application/json");
  });
});
