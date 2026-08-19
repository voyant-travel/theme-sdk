import { describe, expect, it } from "vitest";
import {
  parseThemeDevelopmentRuntimeDescriptor,
  THEME_DEVELOPMENT_RUNTIME_SCHEMA_VERSION,
  THEME_EDITOR_PROTOCOL_VERSION,
  type ThemeDevelopmentRuntimeDescriptor,
} from "../src/index.js";

function descriptor(): ThemeDevelopmentRuntimeDescriptor {
  return {
    schemaVersion: THEME_DEVELOPMENT_RUNTIME_SCHEMA_VERSION,
    sessionId: "session_123",
    themeId: "theme_123",
    siteId: "site_123",
    installationId: "installation_123",
    manifestDigest: `sha256:${"a".repeat(64)}`,
    perspective: "development",
    contentEndpoint: "https://content.sandbox.onvoyant.com/v1",
    publicApiEndpoint: "https://api.sandbox.onvoyant.com/v1",
    editor: {
      baseUrl: "https://sandbox.onvoyant.com/themes/editor",
      protocolVersion: THEME_EDITOR_PROTOCOL_VERSION,
    },
    expiresAt: "2026-08-19T12:00:00.000Z",
  };
}

describe("ThemeDevelopmentRuntimeDescriptor", () => {
  it("accepts the independently versioned host-neutral contract", () => {
    expect(parseThemeDevelopmentRuntimeDescriptor(descriptor())).toEqual(
      descriptor(),
    );
  });

  it.each([
    ["wrong schema version", { schemaVersion: "voyant.theme.runtime.v1" }],
    ["invalid manifest digest", { manifestDigest: "not-a-digest" }],
    ["invalid expiry", { expiresAt: "tomorrow" }],
    ["insecure endpoint", { contentEndpoint: "http://content.example.com" }],
    [
      "credential-bearing endpoint",
      { publicApiEndpoint: "https://api.example.com/v1?token=secret" },
    ],
  ])("rejects %s", (_name, replacement) => {
    expect(() =>
      parseThemeDevelopmentRuntimeDescriptor({
        ...descriptor(),
        ...replacement,
      }),
    ).toThrow();
  });

  it("rejects capability secrets and other undeclared serializable fields", () => {
    expect(() =>
      parseThemeDevelopmentRuntimeDescriptor({
        ...descriptor(),
        capabilityToken: "must-not-be-serialized",
      }),
    ).toThrow();
  });

  it("does not accept a handoff URL or one-time handoff code", () => {
    const { editor: _editor, ...runtime } = descriptor();
    expect(() =>
      parseThemeDevelopmentRuntimeDescriptor({
        ...runtime,
        editor: {
          baseUrl: "https://sandbox.onvoyant.com/themes/editor",
          handoffUrl:
            "https://sandbox.onvoyant.com/themes/editor/handoff/one-time-code",
          handoffCode: "one-time-code",
          protocolVersion: THEME_EDITOR_PROTOCOL_VERSION,
        },
      }),
    ).toThrow();
  });
});
