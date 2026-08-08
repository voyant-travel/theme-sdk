import { describe, expect, expectTypeOf, it } from "vitest";
import {
  BOOKING_SESSION_ACTIONS,
  type BookingSessionActionRequest,
  bookingSessionActionRequestSchema,
} from "../src/index.js";

const common = {
  sessionId: "bses_1",
  revision: 3,
  idempotencyKey: "theme-action-1",
} as const;

describe("booking.session.v1 action request", () => {
  it("accepts the complete provider-neutral lifecycle union", () => {
    const requests = [
      { ...common, action: "update", selection: { paxCount: 2 } },
      { ...common, action: "quote" },
      { ...common, action: "hold", quoteId: "bqte_1", quantity: 2 },
      {
        ...common,
        action: "commit",
        quoteId: "bqte_1",
        holdId: "bhld_1",
        paymentIntent: "card",
        requirementsFingerprint: "rqf_1",
        payment: {
          returnUrl: "https://store.example/checkout/return",
          cancelUrl: "https://store.example/checkout/cancel",
          acceptedCheckoutHandoffs: ["embedded", "redirect"],
        },
      },
      { ...common, action: "abandon" },
      { ...common, action: "renew", extendBySeconds: 900 },
    ] satisfies BookingSessionActionRequest[];

    expect(requests.map((request) => request.action)).toEqual(
      BOOKING_SESSION_ACTIONS,
    );
    for (const request of requests) {
      expect(bookingSessionActionRequestSchema.parse(request)).toEqual(request);
    }
    expectTypeOf(requests).items.toMatchTypeOf<BookingSessionActionRequest>();
  });

  it.each([
    ["update without selection", { ...common, action: "update" }],
    ["hold without quote", { ...common, action: "hold" }],
    [
      "commit without requirements fingerprint",
      { ...common, action: "commit", quoteId: "bqte_1" },
    ],
    ["renew without duration", { ...common, action: "renew" }],
  ])("rejects %s", (_label, request) => {
    expect(bookingSessionActionRequestSchema.safeParse(request).success).toBe(
      false,
    );
  });

  it.each([
    [
      "a missing revision",
      { sessionId: "bses_1", action: "quote", idempotencyKey: "key" },
    ],
    [
      "a stale runtime alias",
      { ...common, action: "quote", expectedRevision: 3 },
    ],
    [
      "a missing idempotency key",
      { sessionId: "bses_1", revision: 3, action: "quote" },
    ],
    [
      "a provider path",
      { ...common, action: "quote", path: "/v1/admin/bookings" },
    ],
    [
      "a provider selector",
      { ...common, action: "quote", provider: "private" },
    ],
    [
      "an action-incompatible field",
      { ...common, action: "quote", quoteId: "bqte_1" },
    ],
  ])("rejects %s", (_label, request) => {
    expect(bookingSessionActionRequestSchema.safeParse(request).success).toBe(
      false,
    );
  });

  it("requires a positive revision and bounded idempotency inputs", () => {
    expect(
      bookingSessionActionRequestSchema.safeParse({
        ...common,
        action: "quote",
        revision: 0,
      }).success,
    ).toBe(false);
    expect(
      bookingSessionActionRequestSchema.safeParse({
        ...common,
        action: "quote",
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
    expect(
      bookingSessionActionRequestSchema.safeParse({
        ...common,
        action: "quote",
        idempotencyKey: "",
      }).success,
    ).toBe(false);
  });
});
