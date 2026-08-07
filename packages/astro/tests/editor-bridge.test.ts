import { describe, expect, it } from "vitest";

import {
  injectThemeEditorBridge,
  themeEditorBridgeScript,
} from "../src/editor-bridge.js";

const DOCUMENT = "<!doctype html><html><body><main>Home</main></body></html>";

describe("theme editor bridge", () => {
  it("is absent when no validated draft context handshakes", () => {
    expect(injectThemeEditorBridge(DOCUMENT, null)).toBe(DOCUMENT);
  });

  it("pins every message to the editor origin and uses the load handshake", () => {
    const script = themeEditorBridgeScript({
      mode: "draft",
      editorOrigin: "https://app.voyant.travel",
    });
    expect(script).toContain("event.origin!==origin");
    expect(script).toContain("event.source!==window.parent");
    expect(script).toContain("postMessage(data,origin)");
    expect(script).toContain("voyant:edit:load");
    expect(script).toContain("voyant:edit:ready");
    expect(script).not.toContain('postMessage(data,"*")');
  });

  it("exposes only selection and settings messages", () => {
    const script = themeEditorBridgeScript({
      mode: "draft",
      editorOrigin: "https://app.voyant.travel",
    });
    const messageTypes = [...script.matchAll(/voyant:edit:[a-z]+/g)].map(
      ([value]) => value,
    );
    expect(new Set(messageTypes)).toEqual(
      new Set([
        "voyant:edit:load",
        "voyant:edit:ready",
        "voyant:edit:select",
        "voyant:edit:settings",
      ]),
    );
  });
});
