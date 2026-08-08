import { describe, expect, it } from "vitest";
import { shoppingRequestedScopeSchema } from "../src/index.js";

describe("managed shopping scope", () => {
  it("accepts only validated browser-selectable market preferences", () => {
    expect(
      shoppingRequestedScopeSchema.parse({
        marketId: "market_ro",
        locale: "ro-RO",
        currency: "RON",
      }),
    ).toEqual({
      marketId: "market_ro",
      locale: "ro-RO",
      currency: "RON",
    });
  });

  it.each([
    { marketId: "" },
    { marketId: "x".repeat(129) },
    { locale: "not_a_language" },
    { currency: "ron" },
    { providerId: "provider_spoofed" },
    { buyerAccountId: "buyer_spoofed" },
    { bookingEngineId: "engine_spoofed" },
    { paymentIntent: "charge" },
    { fxRate: "4.97" },
  ])("rejects an invalid or server-owned selector: %j", (scope) => {
    expect(shoppingRequestedScopeSchema.safeParse(scope).success).toBe(false);
  });
});
