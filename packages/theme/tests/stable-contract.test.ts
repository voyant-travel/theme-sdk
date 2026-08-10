import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, READABLE_CONTRACT_VERSIONS } from "../src/index.js";

const schemaDirectory = fileURLToPath(
  new URL("../../../schemas/v1/", import.meta.url),
);

describe("stable v1 contract", () => {
  it("declares v1 while retaining every alpha publication envelope", () => {
    expect(CONTRACT_VERSION).toBe("v1");
    expect(READABLE_CONTRACT_VERSIONS).toEqual([
      "v1alpha1",
      "v1alpha2",
      "v1alpha3",
      "v1alpha4",
      "v1alpha5",
      "v1",
    ]);
  });

  it.each([
    "theme-manifest.schema.json",
    "theme-fixtures.schema.json",
    "theme-context.schema.json",
    "theme-booking-session-action-request.schema.json",
    "theme-shopping-trip-booking-request.schema.json",
    "theme-shopping-trip-booking-response.schema.json",
    "theme-template-assignments.schema.json",
    "theme-template-resolution-target.schema.json",
  ])("publishes the stable %s identity", async (fileName) => {
    const schema = JSON.parse(
      await readFile(`${schemaDirectory}${fileName}`, "utf8"),
    ) as { $id?: string; title?: string };

    expect(schema.$id).toBe(
      `https://schemas.voyant.travel/theme/v1/${fileName}`,
    );
    expect(schema.title).toContain("v1");
    expect(schema.title).not.toContain("alpha");
  });
});
