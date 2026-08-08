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
