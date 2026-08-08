import { describe, expect, it } from "vitest";
import {
  checkThemeTemplateAssignments,
  resolveThemeTemplate,
  ThemeTemplateAssignmentError,
  themeManifestSchema,
  themeTemplateAssignmentsSchema,
} from "../src/index.js";
import { validTheme } from "./helpers.js";

function manifest() {
  const input = validTheme().manifest;
  input.templates = [
    { id: "home-campaign", name: "Campaign home", context: "home" },
    { id: "tour-standard", name: "Standard tour", context: "tourDetail" },
    { id: "tour-vertical", name: "Tour vertical", context: "tourDetail" },
    { id: "tour-type", name: "Tour type", context: "tourDetail" },
    { id: "tour-taxonomy", name: "Tour taxonomy", context: "tourDetail" },
    {
      id: "tour-taxonomy-low",
      name: "Tour taxonomy low",
      context: "tourDetail",
    },
    { id: "tour-resource", name: "Tour resource", context: "tourDetail" },
  ];
  return themeManifestSchema.parse(input);
}

const assignments = [
  {
    scope: "vertical",
    context: "tourDetail",
    verticalId: "tours",
    templateId: "tour-vertical",
  },
  {
    scope: "resourceType",
    context: "tourDetail",
    verticalId: "tours",
    resourceTypeId: "guided-tour",
    templateId: "tour-type",
  },
  {
    scope: "taxonomy",
    context: "tourDetail",
    verticalId: "tours",
    taxonomyId: "destinations",
    termId: "romania",
    priority: 20,
    templateId: "tour-taxonomy",
  },
  {
    scope: "taxonomy",
    context: "tourDetail",
    verticalId: "tours",
    taxonomyId: "themes",
    termId: "culture",
    priority: 10,
    templateId: "tour-taxonomy-low",
  },
  {
    scope: "resource",
    context: "tourDetail",
    verticalId: "tours",
    resourceTypeId: "guided-tour",
    resourceId: "019c-tour-42",
    templateId: "tour-resource",
  },
] as const;

describe("template assignment", () => {
  it("resolves individual, taxonomy, resource type, vertical, then the route default", () => {
    const base = {
      context: "tourDetail" as const,
      defaultTemplateId: "tour-standard",
      verticalId: "tours",
      resourceTypeId: "guided-tour",
      taxonomyTerms: [
        { taxonomyId: "themes", termId: "culture" },
        { taxonomyId: "destinations", termId: "romania" },
      ],
    };

    expect(
      resolveThemeTemplate(manifest(), assignments, {
        ...base,
        resourceId: "019c-tour-42",
      }),
    ).toBe("tour-resource");
    expect(resolveThemeTemplate(manifest(), assignments, base)).toBe(
      "tour-taxonomy",
    );
    expect(
      resolveThemeTemplate(manifest(), assignments, {
        ...base,
        taxonomyTerms: [],
      }),
    ).toBe("tour-type");
    expect(
      resolveThemeTemplate(manifest(), assignments, {
        context: "tourDetail",
        defaultTemplateId: "tour-standard",
        verticalId: "tours",
      }),
    ).toBe("tour-vertical");
    expect(
      resolveThemeTemplate(manifest(), assignments, {
        context: "tourDetail",
        defaultTemplateId: "tour-standard",
        verticalId: "cruises",
      }),
    ).toBe("tour-standard");
  });

  it("uses explicit priority and stable selector order for taxonomy matches", () => {
    const samePriority = assignments.map((assignment) =>
      assignment.scope === "taxonomy"
        ? { ...assignment, priority: 10 }
        : assignment,
    );
    expect(
      resolveThemeTemplate(manifest(), samePriority, {
        context: "tourDetail",
        defaultTemplateId: "tour-standard",
        verticalId: "tours",
        taxonomyTerms: [
          { taxonomyId: "themes", termId: "culture" },
          { taxonomyId: "destinations", termId: "romania" },
        ],
      }),
    ).toBe("tour-taxonomy");
  });

  it("validates template existence, context compatibility, and duplicate selectors", () => {
    const checked = checkThemeTemplateAssignments(manifest(), [
      assignments[0],
      { ...assignments[0], templateId: "missing" },
      {
        ...assignments[1],
        context: "home",
        templateId: "tour-type",
      },
    ]);
    expect(checked.ok).toBe(false);
    expect(checked.issues.map((issue) => issue.code)).toEqual([
      "THEME_TEMPLATE_ASSIGNMENT_DUPLICATE",
      "THEME_TEMPLATE_UNKNOWN",
      "THEME_TEMPLATE_CONTEXT_MISMATCH",
    ]);
  });

  it("rejects undeclared or context-incompatible defaults", () => {
    expect(() =>
      resolveThemeTemplate(manifest(), [], {
        context: "tourDetail",
        defaultTemplateId: "missing",
      }),
    ).toThrow(ThemeTemplateAssignmentError);
    expect(() =>
      resolveThemeTemplate(manifest(), [], {
        context: "home",
        defaultTemplateId: "tour-standard",
      }),
    ).toThrow(/renders tourDetail, not home/);
  });

  it("keeps platform declarations strict and accepts opaque platform ids", () => {
    expect(themeTemplateAssignmentsSchema.parse(assignments)).toHaveLength(5);
    expect(
      themeTemplateAssignmentsSchema.safeParse([
        { ...assignments[0], endpoint: "https://provider.invalid" },
      ]).success,
    ).toBe(false);
    expect(
      themeTemplateAssignmentsSchema.safeParse([
        { ...assignments[0], verticalId: "019c97f4-89cb-7adb-9e85-opaque" },
      ]).success,
    ).toBe(true);
  });
});
