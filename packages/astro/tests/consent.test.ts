import { describe, expect, it } from "vitest";

import {
  injectConsentBootstrap,
  parseThemeConsentConfiguration,
  renderConsentBootstrap,
  type ThemeConsentConfiguration,
} from "../src/consent.js";

const configuration: ThemeConsentConfiguration = {
  schemaVersion: 1,
  surface: "theme",
  hostname: "www.example.com",
  regime: "strict_opt_in",
  provider: { mode: "external_gtm", gtmContainerId: "GTM-ABC123" },
  profile: null,
  presentationOverrides: null,
};

describe("managed Theme consent", () => {
  it("validates a capability-scoped configuration for the requested hostname", () => {
    expect(
      parseThemeConsentConfiguration(configuration, "www.example.com"),
    ).toEqual(configuration);
    expect(
      parseThemeConsentConfiguration(configuration, "other.example.com"),
    ).toBeNull();
  });

  it("injects the consent default at the start of head", () => {
    const html = injectConsentBootstrap(
      "<html><head><script data-theme></script></head><body></body></html>",
      configuration,
    );
    expect(html.indexOf("data-voyant-consent-bootstrap")).toBeLessThan(
      html.indexOf("data-theme"),
    );
    expect(html).toContain("GTM-ABC123");
  });

  it("renders an executable self-contained bootstrap", () => {
    const script = renderConsentBootstrap(configuration)
      .replace(/^<script[^>]*>/, "")
      .replace(/<\/script>$/, "");
    expect(() => new Function(script)).not.toThrow();
  });

  it("escapes closing-tag input in serialized configuration", () => {
    expect(
      renderConsentBootstrap({
        ...configuration,
        provider: { mode: "voyant_managed" },
        profile: {
          id: "profile_1",
          organizationId: "org_1",
          policyRevision: "policy_1",
          presentationRevision: "presentation_1",
          lifetimeDays: 180,
          defaultLocale: "en",
          content: {},
          appearance: {
            accentColor: "#111111",
            backgroundColor: "#ffffff",
            textColor: "#111111",
            mutedTextColor: "#666666",
            borderColor: "#dddddd",
            buttonRadiusPx: 8,
            position: "bottom",
            customCss: "</script><script>alert(1)</script>",
          },
        },
      }),
    ).not.toContain("</script><script>alert");
  });
});
