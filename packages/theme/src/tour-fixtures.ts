import { z } from "zod";
import { bookingSessionActionRequestSchema } from "./booking-session.js";
import {
  themeCapabilityIdSchema,
  tourDetailContextSchema,
  tourIndexContextSchema,
} from "./contract.js";

const fixtureIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens.");

const fixtureRequestSchema = z.strictObject({
  method: z.enum(["GET", "POST", "PATCH"]),
  path: z.string().startsWith("/v1/public/"),
  query: z.record(z.string(), z.string()).default({}),
  body: z.json().optional(),
});

export const tourFixtureErrorCodeSchema = z.enum([
  "invalid_request",
  "not_found",
  "unavailable",
  "unpriced",
  "sold_out",
  "session_missing",
  "session_expired",
  "revision_conflict",
  "idempotency_conflict",
  "payment_failed",
  "provider_error",
]);

export const tourFixtureErrorSchema = z.strictObject({
  kind: z.literal("error"),
  code: tourFixtureErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
});

const moneySchema = z.strictObject({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const offerSchema = z.strictObject({
  kind: z.literal("offer"),
  offerId: z.string().min(1),
  productId: z.string().min(1),
  total: moneySchema,
  expiresAt: z.string().datetime({ offset: true }),
});

const availabilitySchema = z.strictObject({
  kind: z.literal("availability"),
  productId: z.string().min(1),
  options: z.array(
    z.strictObject({
      id: z.string().min(1),
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }).optional(),
      remaining: z.number().int().nonnegative().optional(),
    }),
  ),
});

const bookingSessionSchema = z.strictObject({
  kind: z.literal("bookingSession"),
  sessionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  status: z.enum(["draft", "held", "committed"]),
  expiresAt: z.string().datetime({ offset: true }),
});

const checkoutSchema = z.strictObject({
  kind: z.literal("checkout"),
  checkoutId: z.string().min(1),
  status: z.enum([
    "ready",
    "paymentPending",
    "paymentSucceeded",
    "paymentFailed",
  ]),
  redirectUrl: z.string().url().optional(),
});

export const tourFixtureHttpBodySchema = z.discriminatedUnion("kind", [
  offerSchema,
  availabilitySchema,
  bookingSessionSchema,
  checkoutSchema,
  tourFixtureErrorSchema,
]);

export const tourFixtureResultSchema = z.discriminatedUnion("transport", [
  z.strictObject({
    transport: z.literal("http"),
    status: z.number().int().min(100).max(599),
    body: tourFixtureHttpBodySchema,
  }),
  z.strictObject({
    transport: z.literal("networkError"),
    code: z.enum(["connection_refused", "connection_reset", "timeout"]),
    message: z.string().min(1),
  }),
  z.strictObject({
    transport: z.literal("malformed"),
    status: z.number().int().min(200).max(599),
    contentType: z.string().min(1),
    rawBody: z.string(),
  }),
]);

const pageRequestSchema = z.strictObject({
  method: z.literal("GET"),
  path: z.string().startsWith("/tours"),
});

const pageErrorSchema = z.strictObject({
  status: z.number().int().min(400).max(599),
  error: tourFixtureErrorSchema,
});

const indexFixtureSchema = z.strictObject({
  id: fixtureIdSchema,
  surface: z.literal("index"),
  state: z.enum(["populated", "empty", "error"]),
  request: pageRequestSchema,
  response: z.union([
    z.strictObject({ status: z.literal(200), context: tourIndexContextSchema }),
    pageErrorSchema,
  ]),
});

const detailFixtureSchema = z.strictObject({
  id: fixtureIdSchema,
  surface: z.literal("detail"),
  state: z.enum(["rich", "minimal", "notFound", "unavailable"]),
  request: pageRequestSchema,
  response: z.union([
    z.strictObject({
      status: z.literal(200),
      context: tourDetailContextSchema,
    }),
    pageErrorSchema,
  ]),
});

const liveFixtureSchema = z.strictObject({
  id: fixtureIdSchema,
  surface: z.literal("live"),
  state: z.enum([
    "priced",
    "unpriced",
    "available",
    "soldOut",
    "invalid",
    "created",
    "held",
    "committed",
    "missing",
    "expired",
    "revisionConflict",
    "idempotencyConflict",
    "checkoutReady",
    "paymentPending",
    "paymentSucceeded",
    "paymentFailed",
    "providerError",
    "networkError",
    "malformed",
  ]),
  capability: themeCapabilityIdSchema,
  request: fixtureRequestSchema,
  result: tourFixtureResultSchema,
});

export const tourSellingFixtureSchema = z
  .discriminatedUnion("surface", [
    indexFixtureSchema,
    detailFixtureSchema,
    liveFixtureSchema,
  ])
  .superRefine((fixture, context) => {
    const mismatch = (message: string) =>
      context.addIssue({ code: "custom", message, path: ["state"] });

    if (fixture.surface === "index") {
      if (fixture.state === "error") {
        if (!("error" in fixture.response))
          mismatch("error must return a page error.");
      } else if (!("context" in fixture.response)) {
        mismatch(`${fixture.state} must return a tour index context.`);
      } else if (
        (fixture.state === "empty") !==
        (fixture.response.context.products.length === 0)
      ) {
        mismatch(
          "empty must have no products; populated must have at least one.",
        );
      }
      return;
    }

    if (fixture.surface === "detail") {
      if (fixture.state === "rich" || fixture.state === "minimal") {
        if (!("context" in fixture.response)) {
          mismatch(`${fixture.state} must return a tour detail context.`);
        }
      } else if (!("error" in fixture.response)) {
        mismatch(`${fixture.state} must return a page error.`);
      } else if (
        fixture.state === "notFound" &&
        fixture.response.error.code !== "not_found"
      ) {
        mismatch("notFound must use the not_found error code.");
      } else if (
        fixture.state === "unavailable" &&
        fixture.response.error.code !== "unavailable"
      ) {
        mismatch("unavailable must use the unavailable error code.");
      }
      return;
    }

    const result = fixture.result;
    if (
      fixture.capability === "booking.session.v1" &&
      fixture.request.method === "PATCH"
    ) {
      const request = bookingSessionActionRequestSchema.safeParse(
        fixture.request.body,
      );
      if (!request.success) {
        for (const issue of request.error.issues) {
          context.addIssue({
            code: "custom",
            message: `Invalid booking.session.v1 action request: ${issue.message}`,
            path: ["request", "body", ...issue.path],
          });
        }
      }
    }
    if (fixture.state === "networkError") {
      if (result.transport !== "networkError")
        mismatch("networkError must use the network transport result.");
      return;
    }
    if (fixture.state === "malformed") {
      if (result.transport !== "malformed")
        mismatch("malformed must preserve the raw malformed response.");
      return;
    }
    if (result.transport !== "http") {
      mismatch(`${fixture.state} must use an HTTP result.`);
      return;
    }
    const body = result.body;
    if ((body.kind === "error") !== result.status >= 400) {
      mismatch(
        "HTTP errors require an error status and successful bodies require a success status.",
      );
      return;
    }

    const expected: Partial<
      Record<
        typeof fixture.state,
        {
          capability: typeof fixture.capability;
          kind?: typeof body.kind;
          code?: string;
          status?: string;
        }
      >
    > = {
      priced: { capability: "catalog.pricing.v1", kind: "offer" },
      unpriced: {
        capability: "catalog.pricing.v1",
        kind: "error",
        code: "unpriced",
      },
      available: {
        capability: "catalog.availability.v1",
        kind: "availability",
      },
      soldOut: {
        capability: "catalog.availability.v1",
        kind: "error",
        code: "sold_out",
      },
      invalid: {
        capability: fixture.capability,
        kind: "error",
        code: "invalid_request",
      },
      created: {
        capability: "booking.session.v1",
        kind: "bookingSession",
        status: "draft",
      },
      held: {
        capability: "booking.session.v1",
        kind: "bookingSession",
        status: "held",
      },
      committed: {
        capability: "booking.session.v1",
        kind: "bookingSession",
        status: "committed",
      },
      missing: {
        capability: "booking.session.v1",
        kind: "error",
        code: "session_missing",
      },
      expired: {
        capability: "booking.session.v1",
        kind: "error",
        code: "session_expired",
      },
      revisionConflict: {
        capability: "booking.session.v1",
        kind: "error",
        code: "revision_conflict",
      },
      idempotencyConflict: {
        capability: "booking.session.v1",
        kind: "error",
        code: "idempotency_conflict",
      },
      checkoutReady: {
        capability: "checkout.v1",
        kind: "checkout",
        status: "ready",
      },
      paymentPending: {
        capability: "checkout.v1",
        kind: "checkout",
        status: "paymentPending",
      },
      paymentSucceeded: {
        capability: "checkout.v1",
        kind: "checkout",
        status: "paymentSucceeded",
      },
      paymentFailed: {
        capability: "checkout.v1",
        kind: "error",
        code: "payment_failed",
      },
      providerError: {
        capability: fixture.capability,
        kind: "error",
        code: "provider_error",
      },
    };
    const rule = expected[fixture.state];
    if (!rule) return;
    if (fixture.capability !== rule.capability || body.kind !== rule.kind) {
      mismatch(
        `${fixture.state} does not match its capability response shape.`,
      );
      return;
    }
    if (rule.code && (body.kind !== "error" || body.code !== rule.code)) {
      mismatch(`${fixture.state} must use the ${rule.code} error code.`);
    }
    if (
      rule.status &&
      ((body.kind !== "bookingSession" && body.kind !== "checkout") ||
        body.status !== rule.status)
    ) {
      mismatch(`${fixture.state} must use the ${rule.status} status.`);
    }
  });

export const tourSellingFixtureMatrixSchema = z.strictObject({
  version: z.literal("v1"),
  fixtures: z.array(tourSellingFixtureSchema).min(1),
});

export type TourFixtureError = z.infer<typeof tourFixtureErrorSchema>;
export type TourFixtureResult = z.infer<typeof tourFixtureResultSchema>;
export type TourSellingFixture = z.infer<typeof tourSellingFixtureSchema>;
export type TourSellingFixtureMatrix = z.infer<
  typeof tourSellingFixtureMatrixSchema
>;

export interface TourFixtureAdapter {
  get(id: string): TourSellingFixture | undefined;
  list(surface?: TourSellingFixture["surface"]): TourSellingFixture[];
  respond(id: string): Response;
}

export class TourFixtureNetworkError extends Error {
  override readonly name = "TourFixtureNetworkError";

  constructor(
    readonly code: "connection_refused" | "connection_reset" | "timeout",
    message: string,
  ) {
    super(message);
  }
}

function cloneFixture(fixture: TourSellingFixture): TourSellingFixture {
  return structuredClone(fixture);
}

/**
 * Creates a deterministic in-memory adapter for stories, previews, and tests.
 * Scenario selection is explicit by fixture id: requests never carry a magic
 * provider selector, and no fixture is eligible for publication as page data.
 */
export function createTourFixtureAdapter(input: unknown): TourFixtureAdapter {
  const matrix = tourSellingFixtureMatrixSchema.parse(input);
  const byId = new Map<string, TourSellingFixture>();
  for (const fixture of matrix.fixtures) {
    if (byId.has(fixture.id)) {
      throw new Error(`Duplicate tour fixture id '${fixture.id}'.`);
    }
    byId.set(fixture.id, fixture);
  }

  return {
    get(id) {
      const fixture = byId.get(id);
      return fixture ? cloneFixture(fixture) : undefined;
    },
    list(surface) {
      return matrix.fixtures
        .filter(
          (fixture) => surface === undefined || fixture.surface === surface,
        )
        .map(cloneFixture);
    },
    respond(id) {
      const fixture = byId.get(id);
      if (!fixture) throw new Error(`Unknown tour fixture id '${id}'.`);
      if (fixture.surface !== "live") {
        return Response.json(fixture.response, {
          status: fixture.response.status,
        });
      }
      if (fixture.result.transport === "networkError") {
        throw new TourFixtureNetworkError(
          fixture.result.code,
          fixture.result.message,
        );
      }
      if (fixture.result.transport === "malformed") {
        return new Response(fixture.result.rawBody, {
          status: fixture.result.status,
          headers: { "Content-Type": fixture.result.contentType },
        });
      }
      return Response.json(fixture.result.body, {
        status: fixture.result.status,
      });
    },
  };
}
