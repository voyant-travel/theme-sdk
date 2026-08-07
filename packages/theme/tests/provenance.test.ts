import { describe, expect, it } from "vitest";
import {
  cleanStega,
  decodeStega,
  encodeStega,
  encodeThemeContextProvenance,
  getThemeEditorContext,
  isStegaPointerAllowed,
} from "../src/index.js";

describe("stega provenance", () => {
  it("round trips an allowlisted JSON pointer", () => {
    const encoded = encodeStega("Hello", "/sections/0/settings/heading");
    expect(encoded).not.toBe("Hello");
    expect(decodeStega(encoded)).toEqual({
      value: "Hello",
      pointer: "/sections/0/settings/heading",
    });
    expect(cleanStega(encoded)).toBe("Hello");
  });

  it.each([
    "/settings/palette",
    "/path",
    "/locale",
    "/kind",
    "/slug",
    "/site/logo/src",
    "/navigation/0/href",
    "/sections/0/type",
    "/sections/0/id",
    "/codeInjection/head",
    "/_voyant/editorOrigin",
  ])("never encodes deny field %s", (pointer) => {
    expect(isStegaPointerAllowed(pointer)).toBe(false);
    expect(encodeStega("unchanged", pointer)).toBe("unchanged");
  });

  it("keeps production output byte-identical and preserves object identity", () => {
    const context = {
      kind: "content",
      locale: "en",
      path: "/hello",
      title: "Hello",
      settings: { pattern: "^[a-z]+$" },
    };
    const before = JSON.stringify(context);
    const output = encodeThemeContextProvenance(context);
    expect(output).toBe(context);
    expect(JSON.stringify(output)).toBe(before);
  });

  it("accepts only an explicit draft signal with an exact http(s) origin", () => {
    expect(
      getThemeEditorContext({
        _voyant: {
          mode: "draft",
          editorOrigin: "https://app.voyant.travel",
        },
      }),
    ).toEqual({
      mode: "draft",
      editorOrigin: "https://app.voyant.travel",
    });
    expect(
      getThemeEditorContext({
        _voyant: {
          mode: "production",
          editorOrigin: "https://app.voyant.travel",
        },
      }),
    ).toBeNull();
    expect(
      getThemeEditorContext({
        _voyant: {
          mode: "draft",
          editorOrigin: "https://app.voyant.travel/editor",
        },
      }),
    ).toBeNull();
  });

  it("encodes only allowlisted strings in an explicit draft context", () => {
    const context = {
      kind: "home",
      locale: "en",
      path: "/",
      title: "Home",
      settings: { palette: "dark" },
      sections: [
        {
          id: "hero-1",
          type: "hero",
          settings: { heading: "Explore" },
        },
      ],
      _voyant: { mode: "draft", editorOrigin: "https://app.voyant.travel" },
    };
    const encoded = encodeThemeContextProvenance(context);
    expect(decodeStega(encoded.title)?.pointer).toBe("/title");
    expect(encoded.locale).toBe("en");
    expect(encoded.path).toBe("/");
    expect(encoded.settings.palette).toBe("dark");
    expect(encoded.sections[0]?.id).toBe("hero-1");
    expect(
      decodeStega(encoded.sections[0]?.settings.heading ?? "")?.pointer,
    ).toBe("/sections/0/settings/heading");
  });
});
