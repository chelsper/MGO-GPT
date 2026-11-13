import { getImportWriteResults, importWritePlanKey } from "./importWriteResults";
import { EXTENDED_IMPORT_NAMES } from "./importExtendedNames";
import { quickImportInputKey } from "./quickImportWorkflow";

export function canFinishImportWithoutSending(row) {
  const audit = row?.blackbaud_result || row?.blackbaudResult;
  const writes = row?.requested_writes?.length ? row.requested_writes : row?.writePlan || row?.preview?.writePlan;
  const target = row?.matched_blackbaud_constituent_id || row?.match?.blackbaudConstituentId || row?.preview?.match?.blackbaudConstituentId;
  return Boolean(["Needs Review", "Failed", "Applied"].includes(row?.status) && target &&
    Array.isArray(writes) && writes.length && getImportWriteResults(audit).length &&
    (row?.quick_create_status || row?.quickCreateStatus) !== "uncertain" &&
    (!(row?.create_request_started_at || row?.createRequestStartedAt) ||
      row?.created_blackbaud_constituent_id || row?.createdBlackbaudConstituentId) &&
    (!audit?.writePlanKey || audit.writePlanKey === importWritePlanKey(writes)));
}

export function isImportVerificationComplete(row) {
  const verification = (row?.blackbaud_result || row?.blackbaudResult)?.reconciliation;
  const input = row?.input || row?.preview?.input || {};
  const createdId = String(row?.createdBlackbaudConstituentId || row?.created_blackbaud_constituent_id || "");
  if (createdId && EXTENDED_IMPORT_NAMES.some(({ key }) => String(input[key] ?? "").trim())) {
    const target = String(row?.matched_blackbaud_constituent_id || row?.match?.blackbaudConstituentId || row?.preview?.match?.blackbaudConstituentId || "");
    if (createdId !== target || verification?.createdNames?.status !== "confirmed" ||
      verification.createdNames.constituentId !== createdId || verification.createdNames.inputKey !== quickImportInputKey(input)) return false;
  }
  const writes = row?.requested_writes?.length ? row.requested_writes : row?.writePlan || row?.preview?.writePlan;
  const workflow = row?.quickImportWorkflow || row?.preview?.quickImportWorkflow;
  const verifiedEmptyPlan = workflow?.phase === "complete" && workflow.identityConfirmedAt &&
    (row?.createdBlackbaudConstituentId || row?.created_blackbaud_constituent_id);
  return Boolean(verification?.verifiedAt && verification.createdNames?.status !== "needs_review" && Array.isArray(writes) && (writes.length || verifiedEmptyPlan) &&
    Array.isArray(verification.results) && verification.results.length === writes.length &&
    writes.every((_, index) => verification.results.some((result) => result.writeIndex === index && result.status === "confirmed")));
}
