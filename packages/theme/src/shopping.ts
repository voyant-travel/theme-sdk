import { z } from "zod";

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const CURRENCY = /^[A-Z]{3}$/;

/**
 * The complete scope a browser may request for managed shopping.
 *
 * The platform validates these preferences against the active Storefront
 * market. Customer identity, provider selection, booking, payment, and FX are
 * server-owned and deliberately have no representation here.
 */
export const shoppingRequestedScopeSchema = z.strictObject({
  marketId: z.string().min(1).max(128).optional(),
  locale: z
    .string()
    .regex(LANGUAGE_TAG, "Expected a BCP 47 language tag")
    .optional(),
  currency: z
    .string()
    .regex(CURRENCY, "Expected an ISO 4217 currency code")
    .optional(),
});

export type ShoppingRequestedScope = z.infer<
  typeof shoppingRequestedScopeSchema
>;

/** The closed browser input that freezes one opaque Trip revision server-side. */
export const shoppingTripBookingRequestSchema = z.strictObject({
  selectionRef: z.string().min(16).max(512),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().min(8).max(128),
});

/**
 * The Booking Session contract owns the outcome members. This forward-
 * compatible wrapper preserves that outcome and types the anonymous
 * capability returned by the managed runtime.
 */
export const shoppingTripBookingResultSchema = z.strictObject({
  bookingSessionCapability: z
    .string()
    .regex(/^bcap_[A-Za-z0-9_-]{43,}$/)
    .optional(),
  outcome: z.looseObject({ kind: z.string().min(1) }),
});

export const shoppingTripBookingResponseSchema = z.strictObject({
  data: shoppingTripBookingResultSchema,
});

export type ShoppingTripBookingRequest = z.infer<
  typeof shoppingTripBookingRequestSchema
>;
export type ShoppingTripBookingResult = z.infer<
  typeof shoppingTripBookingResultSchema
>;
export type ShoppingTripBookingResponse = z.infer<
  typeof shoppingTripBookingResponseSchema
>;
