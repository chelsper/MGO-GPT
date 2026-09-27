import { createHash } from "node:crypto";
import { calendarDate } from "@/utils/prospectActivity";
import { pipelineAmount } from "@/utils/pipelineReport";
import { isAdminRole, isMgoRole } from "@/utils/workspaceRoles";

export function pipelineError(message, status = 409) {
  return Object.assign(new Error(message), { status, publicMessage: message });
}

export function requirePipelineEditor(copies, actor, operation = "edit") {
  if (!copies.length) throw pipelineError("Opportunity not found.", 404);
  const admin = isAdminRole(actor.role);
  if (!admin && (operation === "archive" || !isMgoRole(actor.role) || !copies.some(row => String(row.user_id) === String(actor.id)))) {
    throw pipelineError("You may edit only your own opportunities. Only Admins may archive.", 403);
  }
  const identities = [...new Set(copies.map(row => String(row.blackbaud_opportunity_id || "")).filter(Boolean))];
  const constituents = [...new Set(copies.map(row => String(row.blackbaud_constituent_id || "")))];
  if (identities.length !== 1 || !/^[1-9]\d*$/.test(identities[0]) || constituents.length !== 1 || !/^[1-9]\d*$/.test(constituents[0])) {
    throw pipelineError("Link this opportunity to one verified NXT opportunity in Top Prospects before editing here. Conflicting links require an administrator's review.");
  }
  return { nxtId: identities[0], constituentId: constituents[0] };
}

export const PIPELINE_EDIT_FIELDS = ["name", "status", "purpose", "ask_amount", "ask_date", "expected_date", "funded_amount", "funded_date"];

// Fingerprint only editable fields plus identity/active flag, not incidental
// provider metadata. Both the app revisions and the live NXT values must match.
export function remoteOpportunityValues(remote, identity) {
  if (String(remote?.id) !== identity.nxtId || String(remote?.constituent_id) !== identity.constituentId ||
      typeof remote.name !== "string" || !remote.name.trim() || typeof remote.status !== "string" || !remote.status.trim() ||
      (remote.inactive != null && typeof remote.inactive !== "boolean")) {
    throw pipelineError("NXT returned an incomplete or different opportunity. Nothing was changed.");
  }
  const values = { name: remote.name, status: remote.status, purpose: remote.purpose ?? "", inactive: remote.inactive === true };
  if (typeof values.purpose !== "string") throw pipelineError("NXT returned an invalid purpose.");
  for (const key of ["ask_amount", "funded_amount"]) {
    values[key] = remote[key] == null ? null : pipelineAmount(remote[key]?.value);
    if (remote[key] != null && values[key] === null) throw pipelineError("NXT returned an invalid amount.");
  }
  for (const key of ["ask_date", "expected_date", "funded_date"]) {
    values[key] = remote[key] == null ? null : calendarDate(remote[key]);
    if (remote[key] != null && !values[key]) throw pipelineError("NXT returned an invalid date.");
  }
  return values;
}

export function pipelineVersion(copies, values) {
  const revisions = copies.map(row => [String(row.id), row.revision, row.checked_revision, String(row.user_id), row.blackbaud_opportunity_id, row.shared_opportunity_key])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return createHash("sha256").update(JSON.stringify([revisions, values])).digest("hex");
}

export function buildPipelinePatch(body, current) {
  if (!body || !["edit", "archive"].includes(body.operation) || !/^[a-f0-9]{64}$/.test(body.version || "")) throw pipelineError("Reload the editor before saving.", 400);
  if (body.operation === "archive") {
    if (body.confirmArchive !== true) throw pipelineError("Confirm that this opportunity should be archived in NXT and the app.", 400);
    return { inactive: true };
  }
  if (current.inactive) throw pipelineError("This opportunity is inactive in NXT. Reactivate it in NXT before editing.");
  if (!body.fields || Array.isArray(body.fields) || typeof body.fields !== "object") throw pipelineError("Enter the opportunity fields.", 400);
  const patch = {};
  for (const [key, input] of Object.entries(body.fields)) {
    if (!PIPELINE_EDIT_FIELDS.includes(key)) throw pipelineError("An unsupported field was submitted.", 400);
    let value = input;
    if (["name", "status", "purpose"].includes(key)) {
      if (typeof input !== "string" || input.length > (key === "name" ? 255 : 1000) || !input.trim()) throw pipelineError("Enter a valid title, stage, and purpose.", 400);
      value = input.trim();
    } else if (key.endsWith("_amount")) {
      value = input === "" || input === null ? null : pipelineAmount(input);
      if (value === null && input !== "" && input !== null) throw pipelineError("Amounts must be nonnegative numbers with no currency symbols.", 400);
      if (value != null && value > 999999999999.99) throw pipelineError("Amount is too large.", 400);
    } else {
      value = input === "" || input === null ? null : calendarDate(input);
      if (input && (!/^\d{4}-\d{2}-\d{2}$/.test(input) || value !== input)) throw pipelineError("Enter a valid calendar date.", 400);
    }
    if (value === current[key]) continue;
    // Clearing SKY fields is not consistent across tenants. Do not guess at
    // null semantics; a deliberate clearing can be performed directly in NXT.
    if (value === null) throw pipelineError("To clear an existing amount or date, change it in NXT first, then reopen this editor.", 400);
    patch[key] = key.endsWith("_amount") ? { value } : key.endsWith("_date") ? `${value}T00:00:00Z` : value;
  }
  return patch;
}

export function pipelinePatchConfirmed(patch, values) {
  return Object.entries(patch).every(([key, expected]) => {
    const value = key.endsWith("_amount") ? expected.value : key.endsWith("_date") ? calendarDate(expected) : expected;
    return values[key] === value;
  });
}
