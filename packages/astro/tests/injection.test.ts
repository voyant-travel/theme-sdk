import { describe, expect, it } from "vitest";

import { injectThemeCode, isInjectableDocument } from "../src/injection.js";

const DOCUMENT = `<!DOCTYPE html><html><head><title>x</title></head><body class="t"><main></main></body></html>`;

describe("injectThemeCode", () => {
  it("returns the document untouched when there is no injection", () => {
    expect(injectThemeCode(DOCUMENT, undefined)).toBe(DOCUMENT);
    expect(injectThemeCode(DOCUMENT, {})).toBe(DOCUMENT);
  });

  it("treats whitespace-only markup as nothing to inject", () => {
    expect(injectThemeCode(DOCUMENT, { head: "   \n" })).toBe(DOCUMENT);
  });

  it("puts head markup last in the head", () => {
    const output = injectThemeCode(DOCUMENT, { head: "<meta name=v>" });
    expect(output).toContain("<title>x</title><meta name=v></head>");
  });

  it("puts bodyStart markup immediately after the body tag, keeping attributes", () => {
    const output = injectThemeCode(DOCUMENT, { bodyStart: "<span>a</span>" });
    expect(output).toContain(`<body class="t"><span>a</span><main>`);
  });

  it("puts bodyEnd markup last in the body", () => {
    const output = injectThemeCode(DOCUMENT, { bodyEnd: "<script></script>" });
    expect(output).toContain("</main><script></script></body>");
  });

  it("applies all three at once without disturbing each other", () => {
    const output = injectThemeCode(DOCUMENT, {
      head: "<!--h-->",
      bodyStart: "<!--s-->",
      bodyEnd: "<!--e-->",
    });
    expect(output).toContain("<!--h--></head>");
    expect(output).toContain(`<body class="t"><!--s-->`);
    expect(output).toContain("<!--e--></body>");
  });

  it("matches anchors case-insensitively", () => {
    const shouty = `<HTML><HEAD></HEAD><BODY></BODY></HTML>`;
    const output = injectThemeCode(shouty, {
      head: "<!--h-->",
      bodyStart: "<!--s-->",
      bodyEnd: "<!--e-->",
    });
    expect(output).toContain("<!--h--></HEAD>");
    expect(output).toContain("<BODY><!--s-->");
    expect(output).toContain("<!--e--></BODY>");
  });

  it("leaves a fragment alone rather than appending markup arbitrarily", () => {
    const fragment = "<div>no document here</div>";
    expect(injectThemeCode(fragment, { head: "<!--h-->" })).toBe(fragment);
  });

  it("injects only at the first head, not inside later markup", () => {
    const output = injectThemeCode(DOCUMENT, { head: "<!--h-->" });
    expect(output.match(/<!--h-->/g)).toHaveLength(1);
  });
});

describe("isInjectableDocument", () => {
  it("accepts an HTML response with a body", () => {
    const response = new Response("<html></html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    expect(isInjectableDocument(response)).toBe(true);
  });

  it("rejects JSON", () => {
    const response = new Response("{}", {
      headers: { "content-type": "application/json" },
    });
    expect(isInjectableDocument(response)).toBe(false);
  });

  it("rejects a response with no content type", () => {
    expect(isInjectableDocument(new Response("x"))).toBe(false);
  });

  it("rejects a bodyless response such as a redirect", () => {
    const response = new Response(null, {
      status: 308,
      headers: { "content-type": "text/html", location: "/en/" },
    });
    expect(isInjectableDocument(response)).toBe(false);
  });
});
