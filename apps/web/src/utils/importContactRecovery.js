import { getImportWriteResults, hasImportRetryHold } from "./importWriteResults";
import { validateNewRecordContacts } from "./newConstituentImport";

const text = (value) => String(value ?? "").trim();
const id = (value) => /^[1-9]\d*$/.test(text(value)) ? text(value) : "";
const kinds = [
  { key: "emailUpdates", label: "Email", writeType: "email_address", valueKey: "address", fields: [["email", "emailType", "emailMakePrimary"], ["email2", "email2Type", "email2MakePrimary"]], defaultKey: "emailType" },
  { key: "phoneUpdates", label: "Phone", writeType: "phone", valueKey: "number", fields: [["phoneNumber", "phoneType", "phoneMakePrimary"], ["phone2Number", "phone2Type", "phone2MakePrimary"]], defaultKey: "phoneType" },
];

function primaryFlag(value) {
  const flag = text(value).toLowerCase();
  if (!flag) return null;
  if (["yes", "true", "1", "y"].includes(flag)) return true;
  if (["no", "false", "0", "n"].includes(flag)) return false;
  return flag; // Keep invalid flags visible to validation, never silently turn them off.
}

export function getContactRecoveryRows(run, rows, defaults = {}) {
  const mapped = (row, field) => text(run.mappings?.[field] ? row.raw_row?.[run.mappings[field]] : "");
  return rows.filter((row) => row.created_blackbaud_constituent_id || row.quick_create_status === "uncertain").map((row) => {
    const preview = row.preview || {};
    const input = preview.input || {};
    const writes = [...(row.requested_writes || []), ...(preview.writePlan || []), ...getImportWriteResults(row.blackbaud_result)];
    const targetId = id(row.created_blackbaud_constituent_id);
    const entry = {
      sourceRowId: String(row.id), rowNumber: row.row_number,
      name: preview.match?.name || input.constituentName || row.constituent_name || "Unnamed constituent",
      targetId, recoveryRunId: id(run.defaults?.contactRecoveryRuns?.[row.id]),
      emailUpdates: [], phoneUpdates: [], stagedKinds: [], errors: [],
    };
    if (!targetId || row.quick_create_status === "uncertain") entry.errors.push("Verify the original creation result before recovering contacts.");
    if (["Applying", "Creating"].includes(row.status)) entry.errors.push("Wait for the current import operation to finish, then check again.");
    if (hasImportRetryHold(row.blackbaud_result)) entry.errors.push("Verify the original uncertain write before preparing a correction.");
    if ([row.matched_blackbaud_constituent_id, preview.match?.blackbaudConstituentId].some((value) => value && text(value) !== targetId)) {
      entry.errors.push("The saved target differs from the created ID. Review the original record first.");
    }
    for (const kind of kinds) {
      // Only recover omitted fields. An original staged/attempted contact must
      // remain in its own checkpointed retry flow, not acquire a second writer.
      const staged = input[kind.key]?.length || writes.some((write) => write?.type === kind.writeType || write?.type === "contact_detail_review");
      if (staged) {
        entry.stagedKinds.push(kind.label);
        continue;
      }
      entry[kind.key] = kind.fields.flatMap(([valueField, typeField, primaryField]) => {
        const value = mapped(row, valueField);
        return value ? [{ [kind.valueKey]: value, type: mapped(row, typeField) || text(defaults[kind.defaultKey]), makePrimary: primaryFlag(mapped(row, primaryField)) }] : [];
      });
    }
    entry.hasOmittedContacts = Boolean(entry.emailUpdates.length || entry.phoneUpdates.length);
    entry.blockers = [...entry.errors];
    try {
      validateNewRecordContacts(entry);
    } catch (error) {
      entry.errors.push(error.message);
    }
    entry.eligible = Boolean(entry.hasOmittedContacts && !entry.errors.length && !entry.recoveryRunId);
    return entry;
  });
}

export function buildContactRecoveryPreview(source, entry, { runId, userId, now }) {
  const original = source.preview || {};
  const input = {
    blackbaudConstituentId: entry.targetId,
    lookupId: text(source.created_blackbaud_lookup_id || source.matched_lookup_id || original.match?.lookupId),
    constituentName: entry.name,
    firstName: text(original.match?.firstName || original.input?.firstName),
    lastName: text(original.match?.lastName || original.input?.lastName),
    emailUpdates: entry.emailUpdates,
    phoneUpdates: entry.phoneUpdates,
  };
  const contactReviewDecisions = {};
  for (const [kind, key] of [["email", "emailUpdates"], ["phone", "phoneUpdates"]]) {
    contactReviewDecisions[kind] = Object.fromEntries(input[key].map((value, index) => [String(index), { mode: "add", makePrimary: value.makePrimary === true }]));
  }
  const pendingKinds = [entry.emailUpdates.length && "emails", entry.phoneUpdates.length && "phones"].filter(Boolean);
  const writePlan = [{ type: "contact_detail_review", action: "load_current", requiresReview: true, deferredHydration: true,
    contactDecisions: contactReviewDecisions, pendingKinds,
    validationMessage: "Load current NXT contacts and review the missing information before sending." }];
  return {
    rowNumber: entry.rowNumber, status: "Needs Review", importIntent: "updates", input,
    matchStatus: "matched", matchMethod: "Created ID from original import", confidence: 100,
    match: { ...original.match, blackbaudConstituentId: entry.targetId, lookupId: input.lookupId,
      name: entry.name, firstName: input.firstName, lastName: input.lastName },
    contactRecovery: { sourceRunId: String(runId), sourceRowId: String(source.id), preparedByUserId: String(userId), preparedAt: now, targetId: entry.targetId },
    intentDisposition: { key: "existing_update", label: "Contact correction only", allowApply: true },
    contactReviewDecisions, contactSnapshotStatus: { emails: false, phones: false, addresses: false },
    currentContacts: { emails: [], phones: [], addresses: [] }, contactsSnapshotLoaded: false,
    deferredHydration: { contacts: true }, writePlan,
    reasons: ["Recover omitted contacts using the ID created by the original import. No constituent, name, or constituency code will be created or resent."],
  };
}

export function contactRecoverySnapshot(rows) {
  return rows.map((row) => ({
    id: String(row.id), status: row.status, createdId: row.created_blackbaud_constituent_id ?? null,
    matchedId: row.matched_blackbaud_constituent_id ?? null,
    quickCreateStatus: row.quick_create_status ?? null, preview: row.preview ?? null,
    rawRow: row.raw_row ?? null, writes: row.requested_writes ?? null, result: row.blackbaud_result ?? null,
  }));
}
