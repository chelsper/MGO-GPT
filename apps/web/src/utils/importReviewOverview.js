import { isImportVerificationComplete } from "./importCompletion";
import {
  getImportWriteResults,
  hasImportWriteHistory,
} from "./importWriteResults";
import { quickImportCandidates } from "./newConstituentImport";
import { quickImportResumeCandidate } from "./quickImportWorkflow";
import { isImportMatchRejected } from "./importMatchReview";

export const IMPORT_REVIEW_GROUPS = [
  {
    key: "new",
    label: "New records",
    description: "Still require duplicate checks and creation approval.",
  },
  {
    key: "updates",
    label: "Ready updates",
    description:
      "Prepared changes to existing NXT records. Review before sending.",
  },
  {
    key: "attention",
    label: "Needs attention",
    description: "Resolve choices, incomplete checks, or previous attempts.",
  },
  {
    key: "completed",
    label: "Completed",
    description: "Imported records. Verification is shown separately.",
  },
  {
    key: "skipped",
    label: "Skipped",
    description: "Retained in the saved batch; not included for sending.",
  },
];

// Display grouping is not authorization. Existing server checks still control every write.
export function importReviewGroup(row) {
  if (row.status === "Skipped") return "skipped";
  if (
    ["Creating", "Applying"].includes(row.status) ||
    row.quickCreateStatus === "uncertain" ||
    (row.createRequestStartedAt && !row.createdBlackbaudConstituentId) ||
    quickImportResumeCandidate(row)
  )
    return "attention";
  if (row.status === "Applied") return "completed";
  if (hasImportWriteHistory(row)) return "attention";
  if (isImportMatchRejected(row)) return "attention";
  if (quickImportCandidates([row]).length) return "new";
  if (
    row.status === "Ready" &&
    row.intentDisposition?.key !== "ready_new" &&
    row.intentDisposition?.allowApply !== false &&
    row.match?.blackbaudConstituentId &&
    row.writePlan?.length &&
    !row.writePlan.some(
      (write) =>
        write.requiresReview ||
        write.deferredHydration ||
        (write.type === "constituent_code" &&
          write.action === "replace" &&
          !write.sourceCodeId),
    ) &&
    !Object.values(row.deferredHydration || {}).some(Boolean)
  )
    return "updates";
  return "attention";
}

export function importReviewOverview(rows) {
  const groups = Object.fromEntries(
    IMPORT_REVIEW_GROUPS.map(({ key }) => [key, []]),
  );
  for (const row of rows || []) groups[importReviewGroup(row)].push(row);
  return {
    groups,
    total: (rows || []).length,
    verified: groups.completed.filter(isImportVerificationComplete).length,
  };
}

export function firstImportReviewRow(rows) {
  const { groups } = importReviewOverview(rows);
  return (
    groups.attention[0] ||
    groups.new[0] ||
    groups.updates[0] ||
    (rows || [])[0] ||
    null
  );
}

export function importReviewOutcome(row) {
  const group = importReviewGroup(row);
  if (group === "completed")
    return isImportVerificationComplete(row)
      ? "Completed and verified"
      : "Imported; not yet verified";
  if (group === "skipped") return "Skipped";
  if (["Creating", "Applying"].includes(row.status)) return "Processing";
  if (
    row.quickCreateStatus === "uncertain" ||
    (row.createRequestStartedAt && !row.createdBlackbaudConstituentId)
  )
    return "Creation needs verification";
  if (group === "new") return "New record candidate";
  if (group === "updates")
    return row.createdBlackbaudConstituentId
      ? "Created; remaining updates ready"
      : "Ready to update";
  const results = getImportWriteResults(row.blackbaudResult);
  if (
    results.some(
      (result) =>
        result.partialApplied ||
        ["applied", "success", "confirmed"].includes(result.status),
    )
  )
    return "Partially completed";
  if (hasImportWriteHistory(row)) return "Previous attempt needs review";
  if (row.createdBlackbaudConstituentId) return "Created; follow-up needed";
  return "Needs attention";
}

export function formatContactReviewChange(write) {
  const label = { email_address: "email", phone: "phone", address: "address" }[
    write.type
  ];
  if (!label) return null;
  const target = write.targetId
    ? ` (NXT contact ID ${write.targetId})`
    : " (choose an existing contact)";
  if (write.action === "set_primary")
    return `Set existing ${label} as primary${target}${write.demoteExistingPrimary ? "; previous primary becomes non-primary" : ""}`;
  if (write.action === "mark_previous")
    return `Mark selected address as Previous Address${target}; end ${write.validTo || "date needed"}; only after the new address is confirmed`;
  const value =
    label === "address"
      ? [
          write.addressLine1,
          write.addressLine2,
          write.city,
          write.state,
          write.postalCode,
          write.country,
        ]
          .filter(Boolean)
          .join(", ")
      : write.address || write.number;
  if (write.action === "replace")
    return `Replace selected ${label}${target}: ${value || "value needed"}; keep its existing NXT type and primary setting`;
  const type = write.emailType || write.phoneType || write.addressType;
  return `Add ${label}: ${value || "value needed"}${type ? ` (${type})` : ""}${write.makePrimary ? "; set as primary" : ""}${write.validFrom ? `; valid from ${write.validFrom}` : ""}${write.demoteExistingPrimary ? `; previous primary becomes ${write.demotedPrimaryType || "non-primary"}` : ""}`;
}

export function newRecordRequestedChanges(row) {
  if (!quickImportCandidates([row]).length || row.createdBlackbaudConstituentId)
    return [];
  const input = row.input || {};
  const lines = [];
  const fields = (object, labels) =>
    labels
      .filter(([key]) => object?.[key])
      .map(([key, label]) => `${label}: ${object[key]}`)
      .join("; ");
  const name = fields(input, [
    ["firstName", "First name"],
    ["lastName", "Last name"],
    ["preferredName", "Preferred name"],
  ]);
  if (name) lines.push(name);
  for (const [key, label, valueKey] of [
    ["emailUpdates", "Email", "address"],
    ["phoneUpdates", "Phone", "number"],
    ["addressUpdates", "Address", "addressLine1"],
  ]) {
    for (const value of input[key] || []) {
      const detail =
        key === "addressUpdates"
          ? [
              value.addressLine1,
              value.addressLine2,
              value.city,
              value.state,
              value.postalCode,
              value.country,
            ]
              .filter(Boolean)
              .join(", ")
          : value[valueKey];
      lines.push(
        `${label}: ${detail || "Value needed"} (${value.type || "Type needed"})${value.makePrimary === true ? "; primary requested" : value.makePrimary === false ? "; non-primary requested" : "; primary not specified"}`,
      );
    }
  }
  if (input.targetConstituency || input.sourceConstituency)
    lines.push(
      `Constituent code (${input.action || "add"}): ${[input.sourceConstituency, input.targetConstituency].filter(Boolean).join(" to ")}${input.startDate ? `; start ${input.startDate}` : ""}${input.endDate ? `; end ${input.endDate}` : ""}`,
    );
  for (const [key, label, labels] of [
    [
      "individualProfileUpdate",
      "Profile",
      [
        ["title", "Title"],
        ["gender", "Gender"],
        ["ethnicity", "Ethnicity"],
        ["birthDate", "Birth date"],
        ["suffix", "Suffix"],
      ],
    ],
    [
      "nameFormatUpdate",
      "Name formats",
      [
        ["addressee", "Addressee"],
        ["salutation", "Salutation"],
      ],
    ],
    [
      "newRecordNameFormats",
      "NXT format IDs",
      [
        ["addressee", "Addressee"],
        ["salutation", "Salutation"],
      ],
    ],
    [
      "educationRelationship",
      "Education",
      [
        ["institution", "Institution"],
        ["degree", "Degree"],
        ["major", "Major"],
        ["classYear", "Class year"],
      ],
    ],
    [
      "organizationRelationship",
      "Organization relationship",
      [
        ["name", "Organization"],
        ["relationshipType", "Relationship"],
        ["title", "Title"],
      ],
    ],
  ]) {
    const detail = fields(input[key], labels);
    if (detail) lines.push(`${label}: ${detail}`);
  }
  return lines;
}
