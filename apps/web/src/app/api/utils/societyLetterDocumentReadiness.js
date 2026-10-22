import { letterTemplateRequirements } from "./societyLetterDocuments";
import { letterMergeBlockers } from "@/utils/societyLetterDocumentReadiness";

// Inspect once per active template per workspace read, not once per recipient.
export function inspectDocumentRequirements(template) {
  if (!template)
    return {
      blockers: [
        {
          code: "template_missing",
          action: "templates",
          label: "Set up letter",
          message: "Save this society's Word letter first.",
        },
      ],
    };
  try {
    return {
      fields: letterTemplateRequirements(template),
      templateVersion: template.version,
    };
  } catch {
    return {
      templateVersion: template.version,
      blockers: [
        {
          code: "template_invalid",
          action: "templates",
          label: "Check merge settings",
          message:
            "Check this society's saved letter and merge-field mappings.",
        },
      ],
    };
  }
}

export function documentReadinessForRow(row, review, requirements) {
  const blockers = [...(requirements.blockers || [])];
  if (review?.status !== "saved")
    blockers.push({
      code: "recipient_review_required",
      action: "recipient",
      label: "Review recipient",
      message:
        review?.reason === "expired"
          ? "Renew this recipient's review; it is over 15 days old."
          : "Review and save this recipient's choices.",
    });
  if (requirements.fields)
    blockers.push(...letterMergeBlockers(row, requirements.fields));
  return {
    status: blockers.length ? "blocked" : "ready",
    templateVersion: requirements.templateVersion,
    blockers: blockers.map((item) => ({
      ...item,
      householdId: row.householdId,
    })),
  };
}
