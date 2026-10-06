import { canFinishImportWithoutSending } from "./importCompletion";
import { IMPORT_CONTACT_GROUPS, importContactMappingKey, mappedImportContacts } from "./importContactPreflight";
import { getImportWriteResults, hasImportRetryHold, hasImportWriteHistory, importWritePlanKey } from "./importWriteResults";
import { quickImportInputKey, quickImportResumeCandidate } from "./quickImportWorkflow";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const labels = {
  firstName: "First name", lastName: "Last name", preferredName: "Preferred name",
  title: "Title", gender: "Gender", ethnicity: "Ethnicity", birthDate: "Birth date", suffix: "Suffix",
  addressee: "Addressee", salutation: "Salutation",
};
export const IMPORT_FIELD_RESULT_LABELS = {
  verified: "Verified", awaiting: "Awaiting verification", attention: "Needs attention",
  skipped: "Intentionally skipped", ready: "Not sent", unchanged: "No change planned", linked: "See correction",
};
const contactKinds = [
  { type: "email_address", kind: "email", input: "emailUpdates", label: "Email", value: "address" },
  { type: "phone", kind: "phone", input: "phoneUpdates", label: "Phone", value: "number" },
  { type: "address", kind: "address", input: "addressUpdates", label: "Mailing address", value: "addressLine1" },
];
const contactValue = (value, kind) => kind.kind === "address"
  ? [value.addressLine1, value.addressLine2, value.city, value.state, value.postalCode, value.country].filter(Boolean).join(", ")
  : text(value[kind.value]);

// Read only the saved mappings, not guessed CSV headers. Expose omitted contacts
// to the existing reviewer response without returning the rest of the raw upload.
export function savedImportContactContext(row, run) {
  const preview = row.preview || row;
  const writes = [...list(row.requested_writes), ...list(preview.writePlan), ...getImportWriteResults(row.blackbaud_result || row.blackbaudResult)];
  const omissions = IMPORT_CONTACT_GROUPS.flatMap((group) => {
    const type = group.key === "email" ? "email_address" : "phone";
    if (list(preview.input?.[group.inputKey]).length || writes.some((write) => [type, "contact_detail_review"].includes(write.type))) return [];
    const intentional = run.defaults?.contactMatchingOnly?.[group.key] === importContactMappingKey(run.mappings || {}, group);
    return mappedImportContacts(row.raw_row, run.mappings || {}, run.defaults || {}, group).map((value) => ({
      kind: group.key, value: value[group.valueKey], type: value.type, makePrimary: value.makePrimary, intentional,
    }));
  });
  const correction = text(run.defaults?.contactRecoveryRuns?.[row.id]);
  return { omissions, correctionRunId: /^[1-9]\d*$/.test(correction) ? correction : null };
}

function describeWrite(write) {
  if (["constituent_name", "constituent_profile"].includes(write.type)) {
    const keys = write.type === "constituent_name" ? ["firstName", "lastName", "preferredName"] : ["title", "gender", "ethnicity", "birthDate", "suffix"];
    return keys.filter((key) => text(write[key])).map((key) => ({ field: labels[key], value: text(write[key]), fieldKey: key }));
  }
  if (write.type === "constituent_name_format") return [{ field: labels[write.kind] || "Name format", value: text(write.value), fieldKey: write.kind }];
  const kind = contactKinds.find((kind) => kind.type === write.type);
  if (kind) {
    const value = contactValue(write, kind) || (write.targetId ? `NXT contact ID ${write.targetId}` : "Contact selection needed");
    const type = write.emailType || write.phoneType || write.addressType;
    const fields = [{ field: kind.label, value }];
    if (type) fields.push({ field: `${kind.label} type`, value: type, setting: "type" });
    if (write.makePrimary === true || write.action === "set_primary") fields.push({ field: `${kind.label} primary setting`, value: `Make primary: ${value}` });
    if (write.demoteExistingPrimary) fields.push({ field: `${kind.label} previous primary`, value: write.demotedPrimaryType || "Keep the previous contact, no longer primary", setting: "previousPrimary" });
    return fields;
  }
  const field = {
    constituent_code: "Constituency code", education_relationship: "Education", organization_relationship: "Organization relationship",
    contact_detail_review: "Contact choices", profile_detail_review: "Profile choices", name_format_detail_review: "Name-format choices",
  }[write.type] || "Other requested change";
  const value = write.type === "constituent_code"
    ? [write.action, write.sourceConstituency, write.targetConstituency, write.startDate && `start ${write.startDate}`, write.endDate && `end ${write.endDate}`].filter(Boolean).join("; ")
    : [write.institution, write.name, write.degree, write.title, write.action].filter(Boolean).join("; ");
  return [{ field, value }];
}

export function importFieldResults(row) {
  const input = row.input || {};
  const writes = list(row.writePlan);
  const audit = row.blackbaudResult || {};
  const results = getImportWriteResults(audit);
  const reconciliation = audit.reconciliation || {};
  const lastAttemptAt = Math.max(0, ...[audit.appliedAt, ...list(audit.attempts).map((attempt) => attempt.attemptedAt)].map((value) => Date.parse(value) || 0));
  const verifiedTime = Date.parse(reconciliation.verifiedAt);
  const verificationCurrent = Number.isFinite(verifiedTime) && verifiedTime >= lastAttemptAt;
  const createdId = text(row.createdBlackbaudConstituentId);
  const targetId = text(row.match?.blackbaudConstituentId);
  const uncertainCreation = row.quickCreateStatus === "uncertain" || Boolean(row.createRequestStartedAt && !createdId);
  const conflictingTarget = Boolean(createdId && targetId && createdId !== targetId);
  const planChanged = Boolean(audit.writePlanKey && audit.writePlanKey !== importWritePlanKey(writes));
  const evidenceUsable = !planChanged && !conflictingTarget && !uncertainCreation;
  const processing = ["Applying", "Creating"].includes(row.status);
  const workflow = row.quickImportWorkflow || {};
  const quickIdentityVerified = workflow.phase === "complete" && workflow.identityConfirmedAt &&
    workflow.constituentId === createdId && workflow.inputKey === quickImportInputKey(input);
  const standardIdentityVerified = verificationCurrent && audit.completion?.method === "verified_existing_nxt" && writes.length > 0 &&
    list(reconciliation.results).length === writes.length && writes.every((write, index) => {
      const checks = reconciliation.results.filter((check) => check.writeIndex === index);
      return checks.length === 1 && checks[0].status === "confirmed" && checks[0].type === write.type;
    });
  const identityVerified = evidenceUsable && !processing && createdId && createdId === targetId && (quickIdentityVerified || standardIdentityVerified);
  const identityCheckedAt = standardIdentityVerified ? reconciliation.verifiedAt : workflow.identityConfirmedAt;
  const fields = [];
  const add = (field, value, state, detail, extra = {}) => fields.push({ key: `${fields.length}`, field, value, state, status: IMPORT_FIELD_RESULT_LABELS[state], detail, ...extra });

  if (createdId || uncertainCreation) add("Constituent record", createdId ? `NXT ID ${createdId}` : "Creation result unknown",
    identityVerified ? "verified" : "awaiting",
    identityVerified ? "Saved NXT identity check passed. Field outcomes are listed separately." : createdId
      ? "The record was created. That does not confirm its contacts or other requested fields." : "Compare the original creation attempt with NXT before doing anything else.",
    { checkedAt: identityVerified ? identityCheckedAt : null });

  for (const [index, write] of writes.entries()) {
    const result = results.find((result) => result.writeIndex === index);
    const checks = list(reconciliation.results).filter((check) => check.writeIndex === index);
    const check = checks.length === 1 && (!checks[0].type || checks[0].type === write.type) ? checks[0] : null;
    const resultMatches = !result?.type || result.type === write.type;
    let state = "ready", detail = "Prepared for review; nothing is confirmed as sent for this change.";
    if (!evidenceUsable || !resultMatches || checks.length > 1) {
      state = "attention"; detail = "Saved results do not identify this exact plan and record reliably. Compare the saved history before continuing.";
    } else if (verificationCurrent && check && (audit.writePlanKey || check.type === write.type) && !processing) {
      state = check.status === "confirmed" ? "verified" : "attention";
      detail = check.message || (state === "verified" ? "Confirmed by the saved NXT check." : "The saved NXT check did not confirm this change.");
    } else if (result) {
      state = ["applied", "started", "unconfirmed"].includes(result.status) ? "awaiting" : "attention";
      detail = state === "awaiting" ? result.status === "applied"
        ? "NXT accepted this change, but a saved verification is still needed. Do not send it again."
        : "The previous attempt is not confirmed. Check NXT before any retry."
        : result.partialApplied ? "Part of this change may already be saved. Verify before deciding what remains." : "This change needs review. See its saved send and verification results below.";
    } else if (write.requiresReview || write.deferredHydration) {
      state = "attention"; detail = write.validationMessage || "Resolve this choice before sending.";
    } else if (row.status === "Skipped") {
      state = audit.type === "import_row_skipped" ? "skipped" : "unchanged";
      detail = "This row was left out of sending. Previous attempts, if any, remain in its history.";
    } else if (hasImportWriteHistory(row)) {
      state = "attention"; detail = "No saved result confirms this part of the import. Completed changes must not be resent.";
    }
    for (const field of describeWrite(write)) {
      let fieldState = state, fieldDetail = detail;
      const fullCheck = reconciliation.scope === "requested_fields_and_settings" || audit.completion?.method === "verified_existing_nxt";
      if (field.setting === "type" && (write.action === "replace" || ["skip_existing", "set_primary"].includes(result?.action))) {
        fieldState = "unchanged"; fieldDetail = "The existing contact type is preserved by this operation; the requested type is not applied.";
      } else if (field.setting && state === "verified" && !fullCheck) {
        fieldState = "awaiting"; fieldDetail = "The saved check confirms the contact value, but does not record a full check of this setting.";
      }
      add(field.field, field.value, fieldState, fieldDetail, { writeIndex: index, checkedAt: fieldState === "verified" ? reconciliation.verifiedAt : null });
    }
  }

  // A value present in the source is not evidence that it was written. Include
  // explicit skips and requests with no write, without guessing a missing result.
  for (const [type, values] of [["constituent_name", input.nameUpdate], ["constituent_profile", input.individualProfileUpdate], ["constituent_name_format", input.nameFormatUpdate]]) {
    for (const [key, value] of Object.entries(values || {})) {
      if (!labels[key] || !text(value) || writes.some((write) => write.type === type && (type === "constituent_name_format" ? write.kind === key : text(write[key])))) continue;
      const skipped = row.fieldReviewDecisions?.[type]?.[key]?.mode === "skip";
      add(labels[key], text(value), skipped ? "skipped" : "unchanged", skipped ? "You chose to keep the existing NXT value." : "No separate change was saved for this field. This is not a field-level verification.");
    }
  }
  if (createdId) for (const key of ["firstName", "lastName", "preferredName"]) {
    if (!text(input[key]) || text(input.nameUpdate?.[key]) || writes.some((write) => write.type === "constituent_name" && text(write[key]))) continue;
    const confirmed = identityVerified && key !== "preferredName" && text(row.match?.[key]).toLowerCase() === text(input[key]).toLowerCase();
    add(labels[key], text(input[key]), confirmed ? "verified" : "awaiting", confirmed
      ? "This name matches the saved identity check." : "Requested at creation; a created ID alone does not verify this name field.",
    { checkedAt: confirmed ? identityCheckedAt : null });
  }
  for (const kind of contactKinds) {
    for (const [index, value] of list(input[kind.input]).entries()) {
      const detail = contactValue(value, kind);
      if (writes.some((write) => write.type === kind.type && contactValue(write, kind) === detail && write.action !== "set_primary")) continue;
      const decision = row.contactReviewDecisions?.[kind.kind]?.[String(index)];
      const skipped = decision?.mode === "skip";
      add(kind.label, detail, skipped ? "skipped" : "unchanged", skipped ? "You chose not to send this contact." : "No separate contact change was saved. It may already exist; the saved plan alone does not verify its type or primary setting.");
      if (!skipped && (decision?.makePrimary ?? value.makePrimary) === true) {
        add(`${kind.label} primary setting`, `Make primary: ${detail}`, "attention", "Primary was requested, but no saved write or verification covers this contact's primary setting.");
      }
    }
  }
  if ((input.targetConstituency || input.sourceConstituency) && !writes.some((write) => write.type === "constituent_code")) {
    add("Constituency code", input.targetConstituency || input.sourceConstituency, "unchanged", "No code change is in the saved plan. A pre-existing code is not a newly verified import result.");
  }
  for (const [key, type, label, name] of [["educationRelationship", "education_relationship", "Education", "institution"], ["organizationRelationship", "organization_relationship", "Organization relationship", "name"]]) {
    if (input[key]?.[name] && !writes.some((write) => write.type === type)) add(label, text(input[key][name]), "unchanged", "No relationship change is in the saved plan. This is not a verification of the requested relationship fields.");
  }
  const context = row.savedContactContext || {};
  for (const omitted of list(context.omissions)) {
    const label = omitted.kind === "email" ? "Email" : "Phone";
    const state = context.correctionRunId ? "linked" : omitted.intentional ? "skipped" : "attention";
    const detail = context.correctionRunId ? `Managed in contact correction #${context.correctionRunId}. Open that batch to see its outcome.`
      : omitted.intentional ? "You explicitly left these mapped columns out of contact updates." : "Saved in the upload, but not included in the contact write plan.";
    add(label, `${omitted.value}${omitted.type ? ` (${omitted.type})` : ""}`, state, detail);
    if (omitted.makePrimary === true) add(`${label} primary setting`, "Make primary", state, detail);
  }

  const outstanding = fields.filter((field) => ["attention", "awaiting", "ready"].includes(field.state));
  let next = null;
  if (processing) next = { kind: "wait", label: "An import step is running", detail: "Wait for it to finish, then reload the saved results." };
  else if (uncertainCreation || conflictingTarget || planChanged) next = { kind: "history", label: "Review saved results", detail: "Compare the original attempt and the NXT record. Do not create or resend this record." };
  else if (canFinishImportWithoutSending(row) && fields.some((field) => field.writeIndex !== undefined && ["attention", "awaiting"].includes(field.state))) next = {
    kind: "verify", label: row.status === "Applied" ? "Check NXT again (read-only)" : "Verify in NXT and finish",
    completeIfMatches: true,
    detail: "Check the previously attempted changes first. This only reads NXT; it never sends changes.",
  };
  else if (hasImportRetryHold(audit)) next = { kind: "history", label: "Review saved results", detail: "Resolve the uncertain attempt before preparing any other updates." };
  else if (quickImportResumeCandidate(row)) next = { kind: "resume", label: "Open saved import progress", detail: "Use the existing resume controls. This shortcut does not start or approve a send." };
  else if (context.correctionRunId) next = { kind: "correction", runId: context.correctionRunId, label: "Open saved contact correction", detail: "Its results are tracked separately. This original batch will not resend those contacts." };
  else if (createdId && list(context.omissions).some((value) => !value.intentional)) next = { kind: "recover", label: "Review missing contacts", detail: "Use the saved upload and created ID; you do not need to import the constituent again." };
  else if (outstanding.length) next = { kind: hasImportWriteHistory(row) || createdId ? "history" : "review", label: hasImportWriteHistory(row) || createdId ? "Review saved results" : "Review remaining choices", detail: "Review only what remains. This shortcut does not send changes to NXT." };
  return { fields, outstanding, next, targetId: createdId || targetId, verified: fields.filter((field) => field.state === "verified").length };
}

export function importFieldResultExport(row) {
  const result = importFieldResults(row);
  return {
    createdSystemId: text(row.createdBlackbaudConstituentId),
    resultSystemId: result.targetId,
    fieldResults: result.fields.map((field) => `${field.field}: ${field.status} | ${field.value} | ${field.detail}${field.checkedAt ? ` | Checked ${field.checkedAt}` : ""}`).join("\n"),
    outstandingFields: result.outstanding.map((field) => `${field.field}: ${field.status}`).join("; "),
    nextStep: result.next ? `${result.next.label}. ${result.next.detail}` : "No outstanding action identified in the saved results.",
    contactCorrectionRunId: row.savedContactContext?.correctionRunId || "",
  };
}
