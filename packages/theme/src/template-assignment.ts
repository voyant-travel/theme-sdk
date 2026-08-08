import { z } from "zod";
import { type ThemeManifest, themeContextKindSchema } from "./contract.js";

const platformIdentifierSchema = z.string().trim().min(1).max(200);
const templateIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, "Use a declared template id.");

const assignmentBase = {
  context: themeContextKindSchema,
  templateId: templateIdSchema,
};

/** Platform-owned assignment rules. Themes never author or receive these. */
export const themeTemplateAssignmentSchema = z.discriminatedUnion("scope", [
  z.strictObject({
    ...assignmentBase,
    scope: z.literal("vertical"),
    verticalId: platformIdentifierSchema,
  }),
  z.strictObject({
    ...assignmentBase,
    scope: z.literal("resourceType"),
    verticalId: platformIdentifierSchema,
    resourceTypeId: platformIdentifierSchema,
  }),
  z.strictObject({
    ...assignmentBase,
    scope: z.literal("taxonomy"),
    verticalId: platformIdentifierSchema,
    taxonomyId: platformIdentifierSchema,
    termId: platformIdentifierSchema,
    /** Higher priority wins when a resource belongs to multiple assigned terms. */
    priority: z.number().int().default(0),
  }),
  z.strictObject({
    ...assignmentBase,
    scope: z.literal("resource"),
    verticalId: platformIdentifierSchema,
    resourceTypeId: platformIdentifierSchema,
    resourceId: platformIdentifierSchema,
  }),
]);

export const themeTemplateAssignmentsSchema = z
  .array(themeTemplateAssignmentSchema)
  .max(10_000);

export const themeTemplateResolutionTargetSchema = z.strictObject({
  context: themeContextKindSchema,
  /** The id of the route selected for this request. */
  defaultTemplateId: templateIdSchema,
  verticalId: platformIdentifierSchema.optional(),
  resourceTypeId: platformIdentifierSchema.optional(),
  resourceId: platformIdentifierSchema.optional(),
  taxonomyTerms: z
    .array(
      z.strictObject({
        taxonomyId: platformIdentifierSchema,
        termId: platformIdentifierSchema,
      }),
    )
    .max(200)
    .default([]),
});

export type ThemeTemplateAssignment = z.infer<
  typeof themeTemplateAssignmentSchema
>;
export type ThemeTemplateResolutionTarget = z.input<
  typeof themeTemplateResolutionTargetSchema
>;

export interface ThemeTemplateAssignmentIssue {
  code:
    | "THEME_TEMPLATE_ASSIGNMENT_DUPLICATE"
    | "THEME_TEMPLATE_ASSIGNMENT_INVALID"
    | "THEME_TEMPLATE_CONTEXT_MISMATCH"
    | "THEME_TEMPLATE_DEFAULT_INVALID"
    | "THEME_TEMPLATE_UNKNOWN";
  message: string;
  path: string;
}

export interface ThemeTemplateAssignmentValidationResult {
  ok: boolean;
  assignments?: ThemeTemplateAssignment[];
  issues: ThemeTemplateAssignmentIssue[];
}

function templateContexts(manifest: ThemeManifest): Map<string, string> {
  return new Map([
    ...manifest.routes.map((route) => [route.id, route.context] as const),
    ...manifest.templates.map(
      (template) => [template.id, template.context] as const,
    ),
  ]);
}

function assignmentKey(assignment: ThemeTemplateAssignment): string {
  switch (assignment.scope) {
    case "vertical":
      return [assignment.context, assignment.scope, assignment.verticalId].join(
        "\u0000",
      );
    case "resourceType":
      return [
        assignment.context,
        assignment.scope,
        assignment.verticalId,
        assignment.resourceTypeId,
      ].join("\u0000");
    case "taxonomy":
      return [
        assignment.context,
        assignment.scope,
        assignment.verticalId,
        assignment.taxonomyId,
        assignment.termId,
      ].join("\u0000");
    case "resource":
      return [
        assignment.context,
        assignment.scope,
        assignment.verticalId,
        assignment.resourceTypeId,
        assignment.resourceId,
      ].join("\u0000");
  }
}

/**
 * Checks the platform declaration against the immutable theme release.
 * Shape errors remain Zod errors; these issues cover cross-record semantics.
 */
export function checkThemeTemplateAssignments(
  manifest: ThemeManifest,
  input: unknown,
): ThemeTemplateAssignmentValidationResult {
  const parsed = themeTemplateAssignmentsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "THEME_TEMPLATE_ASSIGNMENT_INVALID",
        message: issue.message,
        path: `$${issue.path.map((part) => `[${JSON.stringify(part)}]`).join("")}`,
      })),
    };
  }

  const contexts = templateContexts(manifest);
  const issues: ThemeTemplateAssignmentIssue[] = [];
  const seen = new Set<string>();
  parsed.data.forEach((assignment, index) => {
    const key = assignmentKey(assignment);
    if (seen.has(key)) {
      issues.push({
        code: "THEME_TEMPLATE_ASSIGNMENT_DUPLICATE",
        message: `Assignment ${index} duplicates an earlier ${assignment.scope} selector for ${assignment.context}.`,
        path: `$[${index}]`,
      });
    }
    seen.add(key);

    const declaredContext = contexts.get(assignment.templateId);
    if (declaredContext === undefined) {
      issues.push({
        code: "THEME_TEMPLATE_UNKNOWN",
        message: `Assignment ${index} references unknown template '${assignment.templateId}'.`,
        path: `$[${index}].templateId`,
      });
    } else if (declaredContext !== assignment.context) {
      issues.push({
        code: "THEME_TEMPLATE_CONTEXT_MISMATCH",
        message: `Template '${assignment.templateId}' renders ${declaredContext}, not ${assignment.context}.`,
        path: `$[${index}].templateId`,
      });
    }
  });

  return {
    ok: issues.length === 0,
    assignments: issues.length === 0 ? parsed.data : undefined,
    issues,
  };
}

function matchesTarget(
  assignment: ThemeTemplateAssignment,
  target: z.output<typeof themeTemplateResolutionTargetSchema>,
): boolean {
  if (
    assignment.context !== target.context ||
    assignment.verticalId !== target.verticalId
  ) {
    return false;
  }
  switch (assignment.scope) {
    case "vertical":
      return true;
    case "resourceType":
      return assignment.resourceTypeId === target.resourceTypeId;
    case "taxonomy":
      return target.taxonomyTerms.some(
        (term) =>
          term.taxonomyId === assignment.taxonomyId &&
          term.termId === assignment.termId,
      );
    case "resource":
      return (
        assignment.resourceTypeId === target.resourceTypeId &&
        assignment.resourceId === target.resourceId
      );
  }
}

/**
 * Resolves one id with stable precedence and no assignment data leakage.
 * Taxonomy ties use explicit priority, then stable selector order.
 */
export function resolveThemeTemplate(
  manifest: ThemeManifest,
  input: unknown,
  targetInput: ThemeTemplateResolutionTarget,
): string {
  const target = themeTemplateResolutionTargetSchema.parse(targetInput);
  const contexts = templateContexts(manifest);
  const defaultContext = contexts.get(target.defaultTemplateId);
  if (defaultContext === undefined || defaultContext !== target.context) {
    throw new ThemeTemplateAssignmentError([
      {
        code: "THEME_TEMPLATE_DEFAULT_INVALID",
        message:
          defaultContext === undefined
            ? `Default template '${target.defaultTemplateId}' is not declared.`
            : `Default template '${target.defaultTemplateId}' renders ${defaultContext}, not ${target.context}.`,
        path: "$.defaultTemplateId",
      },
    ]);
  }

  const checked = checkThemeTemplateAssignments(manifest, input);
  if (!checked.ok || !checked.assignments) {
    throw new ThemeTemplateAssignmentError(checked.issues);
  }
  const matches = checked.assignments.filter((assignment) =>
    matchesTarget(assignment, target),
  );
  const resource = matches.find(
    (assignment) => assignment.scope === "resource",
  );
  if (resource) return resource.templateId;

  const taxonomy = matches
    .filter(
      (
        assignment,
      ): assignment is Extract<
        ThemeTemplateAssignment,
        { scope: "taxonomy" }
      > => assignment.scope === "taxonomy",
    )
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.taxonomyId.localeCompare(right.taxonomyId) ||
        left.termId.localeCompare(right.termId) ||
        left.templateId.localeCompare(right.templateId),
    )[0];
  if (taxonomy) return taxonomy.templateId;

  const resourceType = matches.find(
    (assignment) => assignment.scope === "resourceType",
  );
  if (resourceType) return resourceType.templateId;
  const vertical = matches.find(
    (assignment) => assignment.scope === "vertical",
  );
  return vertical?.templateId ?? target.defaultTemplateId;
}

export class ThemeTemplateAssignmentError extends Error {
  constructor(readonly issues: ThemeTemplateAssignmentIssue[]) {
    super(
      issues.length > 0
        ? issues.map((issue) => issue.message).join(" ")
        : "Template assignments are invalid.",
    );
    this.name = "ThemeTemplateAssignmentError";
  }
}
