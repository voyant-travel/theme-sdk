import { z } from "zod";

/**
 * Host-neutral contract exchanged between the Voyant platform, CLI, and the
 * project-pinned Theme SDK for one connected local development session.
 *
 * This is deliberately unrelated to `ThemeBuildRuntime`, which describes an
 * immutable production artifact for a concrete hosting platform.
 */
export const THEME_DEVELOPMENT_RUNTIME_SCHEMA_VERSION =
  "voyant.theme-development-runtime.v1" as const;

/** The first editor message protocol understood by this SDK generation. */
export const THEME_EDITOR_PROTOCOL_VERSION = "voyant.theme-editor.v1" as const;

const opaqueIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "Must be an opaque identifier without whitespace.",
  );

const remoteEndpointSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "Connected development endpoints must use HTTPS.",
      });
    }
    if (url.username || url.password || url.search || url.hash) {
      context.addIssue({
        code: "custom",
        message:
          "Connected development endpoints must not contain credentials, query parameters, or fragments.",
      });
    }
  });

/**
 * Every endpoint in this descriptor is routing metadata only. Its complete URL,
 * including every path segment, must be safe to persist and log. One-time
 * handoff codes and other capabilities travel through the proprietary CLI
 * exchange, never through this schema. Path semantics are platform-owned and
 * cannot be inferred mechanically here, so issuers must enforce this rule.
 */
export const themeDevelopmentRuntimeDescriptorSchema = z.strictObject({
  schemaVersion: z.literal(THEME_DEVELOPMENT_RUNTIME_SCHEMA_VERSION),
  sessionId: opaqueIdSchema,
  themeId: opaqueIdSchema,
  siteId: opaqueIdSchema,
  installationId: opaqueIdSchema,
  manifestDigest: z
    .string()
    .regex(
      /^sha256:[a-f0-9]{64}$/,
      "Must be a lowercase SHA-256 digest with the sha256: prefix.",
    ),
  perspective: z.enum(["published", "development"]),
  contentEndpoint: remoteEndpointSchema,
  publicApiEndpoint: remoteEndpointSchema,
  editor: z.strictObject({
    baseUrl: remoteEndpointSchema,
    protocolVersion: z.literal(THEME_EDITOR_PROTOCOL_VERSION),
  }),
  expiresAt: z.string().datetime({ offset: true }),
});

export type ThemeDevelopmentRuntimeDescriptor = z.infer<
  typeof themeDevelopmentRuntimeDescriptorSchema
>;

/**
 * Validates an untrusted platform response before it reaches Astro.
 *
 * The strict schema is an intentional security property: credentials cannot
 * be smuggled into this serializable descriptor under an additional field.
 */
export function parseThemeDevelopmentRuntimeDescriptor(
  value: unknown,
): ThemeDevelopmentRuntimeDescriptor {
  return themeDevelopmentRuntimeDescriptorSchema.parse(value);
}
