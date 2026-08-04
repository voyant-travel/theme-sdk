import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CONTRACT_VERSION,
  contentContextSchema,
  homeContextSchema,
  themeContextResponseSchema,
  themePageContextSchema,
} from "../src/index.js";

function homeContext(extra: Record<string, unknown> = {}) {
  return {
    kind: "home",
    path: "/",
    locale: "en",
    site: { name: "Northstar" },
    navigation: [],
    menus: {},
    seo: { title: "Home" },
    settings: {},
    title: "Home",
    sections: [],
    ...extra,
  };
}

describe("published context forward compatibility", () => {
  it("accepts a context field this SDK release has never heard of", () => {
    const future = homeContext({
      // Whatever Voyant adds next. A deployed theme must render the fields it
      // knows and ignore the rest.
      breadcrumbs: [{ label: "Home", href: "/" }],
      seo: { title: "Home", canonical: "https://northstar.example/" },
    });

    const parsed = themeContextResponseSchema.parse({
      contractVersion: CONTRACT_VERSION,
      context: future,
    });

    expect(parsed.context.kind).toBe("home");
    // Unknown keys survive parsing, so a theme can opt into a field before the
    // SDK types it.
    expect(parsed.context).toMatchObject({
      breadcrumbs: [{ label: "Home", href: "/" }],
      seo: { canonical: "https://northstar.example/" },
    });
  });

  it("would have failed under the closed context schema it replaces", () => {
    // The v1alpha1 shape, reconstructed: identical fields, strict object.
    const closed = z.strictObject(homeContextSchema.shape);
    const future = homeContext({ breadcrumbs: [] });

    expect(closed.safeParse(future).success).toBe(false);
    expect(homeContextSchema.safeParse(future).success).toBe(true);
  });

  it("keeps the response envelope closed so a reader cannot change the frame", () => {
    expect(
      themeContextResponseSchema.safeParse({
        contractVersion: CONTRACT_VERSION,
        context: homeContext(),
        cacheHint: "public",
      }).success,
    ).toBe(false);
    expect(
      themeContextResponseSchema.safeParse({
        contractVersion: "v1alpha1",
        context: homeContext(),
      }).success,
    ).toBe(false);
  });

  it("still rejects a context whose known fields are wrong", () => {
    expect(
      themePageContextSchema.safeParse(homeContext({ locale: "en_us" }))
        .success,
    ).toBe(false);
    expect(
      themePageContextSchema.safeParse(homeContext({ seo: {} })).success,
    ).toBe(false);
    expect(
      themePageContextSchema.safeParse(homeContext({ kind: "post" })).success,
    ).toBe(false);
  });
});

describe("published context fields", () => {
  it("carries the full seo projection, not just a title", () => {
    const parsed = homeContextSchema.parse(
      homeContext({
        seo: {
          title: "Home",
          description: "Trips worth taking",
          noIndex: true,
        },
      }),
    );

    expect(parsed.seo).toEqual({
      title: "Home",
      description: "Trips worth taking",
      noIndex: true,
    });
  });

  it("defaults noIndex so a theme never has to test for undefined", () => {
    expect(homeContextSchema.parse(homeContext()).seo.noIndex).toBe(false);
  });

  it("accepts named menus nested to arbitrary depth", () => {
    const parsed = homeContextSchema.parse(
      homeContext({
        menus: {
          primary: [
            {
              label: "Trips",
              href: "/trips",
              items: [
                {
                  label: "Antarctica",
                  href: "/trips/antarctica",
                  items: [{ label: "January", href: "/trips/antarctica/jan" }],
                },
              ],
            },
          ],
          footer: [{ label: "Terms", href: "/terms" }],
        },
      }),
    );

    expect(parsed.menus.primary?.[0]?.items?.[0]?.items?.[0]?.label).toBe(
      "January",
    );
    expect(parsed.menus.footer).toHaveLength(1);
  });

  it("defaults menus so a theme can read context.menus unconditionally", () => {
    const { menus, ...withoutMenus } = homeContext();
    expect(menus).toEqual({});
    expect(homeContextSchema.parse(withoutMenus).menus).toEqual({});
  });

  it("passes operator code injection through verbatim", () => {
    const head = '<script src="https://tags.example/a.js"></script>';
    const parsed = contentContextSchema.parse({
      ...homeContext(),
      kind: "content",
      path: "/journal/one",
      slug: "one",
      body: "Body",
      codeInjection: { head, bodyEnd: "<!-- end -->" },
    });

    expect(parsed.codeInjection).toEqual({ head, bodyEnd: "<!-- end -->" });
  });

  it("treats openGraph as optional", () => {
    expect(homeContextSchema.parse(homeContext()).openGraph).toBeUndefined();
    expect(
      homeContextSchema.parse(
        homeContext({
          openGraph: {
            title: "Northstar",
            image: { src: "/social.png", alt: "" },
          },
        }),
      ).openGraph?.image?.src,
    ).toBe("/social.png");
  });
});
