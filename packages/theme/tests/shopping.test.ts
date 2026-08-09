import { describe, expect, it } from "vitest";
import {
  shoppingRequestedScopeSchema,
  shoppingTripBookingRequestSchema,
  shoppingTripBookingResponseSchema,
} from "../src/index.js";

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

describe("managed Trip booking", () => {
  const request = {
    selectionRef: "opaque-selection-ref-1234",
    expectedRevision: 2,
    idempotencyKey: "book-trip-revision-2",
  };

  it("accepts only the opaque selection precondition and idempotency key", () => {
    expect(shoppingTripBookingRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    { tripId: "trip_private" },
    { providerId: "provider_private" },
    { sourceId: "source_private" },
    { userId: "user_private" },
    { buyerAccountId: "buyer_private" },
    { bookingEngineId: "engine_private" },
    { paymentIntent: "payment_private" },
    { fxRate: 4.97 },
  ])("rejects the server-owned selector %j", (selector) => {
    expect(
      shoppingTripBookingRequestSchema.safeParse({ ...request, ...selector })
        .success,
    ).toBe(false);
  });

  it("preserves the managed Booking Session outcome and capability", () => {
    const response = {
      data: {
        bookingSessionCapability: `bcap_${"a".repeat(43)}`,
        outcome: {
          kind: "session_created",
          session: {
            id: "bses_1",
            target: { kind: "managed_itinerary" },
            revision: 1,
          },
        },
      },
    };

    expect(shoppingTripBookingResponseSchema.parse(response)).toEqual(response);
  });
});
