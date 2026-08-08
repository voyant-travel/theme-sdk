import { z } from "zod";

/** Stable lifecycle actions accepted by the `booking.session.v1` PATCH endpoint. */
export const BOOKING_SESSION_ACTIONS = [
  "update",
  "quote",
  "hold",
  "commit",
  "abandon",
  "renew",
] as const;

export const bookingSessionActionSchema = z.enum(BOOKING_SESSION_ACTIONS);

const identifierSchema = z.string().min(1);
const revisionSchema = z.number().int().positive();
const idempotencyKeySchema = z.string().min(8).max(128);

const actionRequestBase = {
  sessionId: identifierSchema,
  revision: revisionSchema,
  idempotencyKey: idempotencyKeySchema,
};

/** Provider-neutral checkout preferences forwarded with a commit action. */
export const bookingSessionPaymentSchema = z.strictObject({
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  acceptedCheckoutHandoffs: z
    .array(z.enum(["embedded", "redirect"]))
    .optional(),
});

export const bookingSessionUpdateRequestSchema = z.strictObject({
  ...actionRequestBase,
  action: z.literal("update"),
  selection: z.record(z.string(), z.unknown()),
});

export const bookingSessionQuoteRequestSchema = z.strictObject({
  ...actionRequestBase,
  action: z.literal("quote"),
});

export const bookingSessionHoldRequestSchema = z.strictObject({
  ...actionRequestBase,
  action: z.literal("hold"),
  quoteId: identifierSchema,
  quantity: z.number().int().positive().optional(),
});

export const bookingSessionCommitRequestSchema = z.strictObject({
  ...actionRequestBase,
  action: z.literal("commit"),
  quoteId: identifierSchema,
  holdId: identifierSchema.optional(),
  paymentIntent: identifierSchema.optional(),
  requirementsFingerprint: identifierSchema,
  payment: bookingSessionPaymentSchema.optional(),
});

export const bookingSessionAbandonRequestSchema = z.strictObject({
  ...actionRequestBase,
  action: z.literal("abandon"),
});

export const bookingSessionRenewRequestSchema = z.strictObject({
  ...actionRequestBase,
  action: z.literal("renew"),
  extendBySeconds: z.number().int().positive(),
});

/**
 * Closed request envelope for a `booking.session.v1` PATCH.
 *
 * Themes carry their last observed `revision`; the platform maps it to the
 * private runtime precondition. `idempotencyKey` is required for every action
 * and is also bound to the upstream `Idempotency-Key` header by the platform.
 */
export const bookingSessionActionRequestSchema = z.discriminatedUnion(
  "action",
  [
    bookingSessionUpdateRequestSchema,
    bookingSessionQuoteRequestSchema,
    bookingSessionHoldRequestSchema,
    bookingSessionCommitRequestSchema,
    bookingSessionAbandonRequestSchema,
    bookingSessionRenewRequestSchema,
  ],
);

export type BookingSessionAction = z.infer<typeof bookingSessionActionSchema>;
export type BookingSessionPayment = z.infer<typeof bookingSessionPaymentSchema>;
export type BookingSessionUpdateRequest = z.infer<
  typeof bookingSessionUpdateRequestSchema
>;
export type BookingSessionQuoteRequest = z.infer<
  typeof bookingSessionQuoteRequestSchema
>;
export type BookingSessionHoldRequest = z.infer<
  typeof bookingSessionHoldRequestSchema
>;
export type BookingSessionCommitRequest = z.infer<
  typeof bookingSessionCommitRequestSchema
>;
export type BookingSessionAbandonRequest = z.infer<
  typeof bookingSessionAbandonRequestSchema
>;
export type BookingSessionRenewRequest = z.infer<
  typeof bookingSessionRenewRequestSchema
>;
export type BookingSessionActionRequest = z.infer<
  typeof bookingSessionActionRequestSchema
>;
