import { randomUUID } from "node:crypto";
import { blackbaudApiFetch } from "./blackbaud";
import { normalizeLinkedOpportunity } from "./prospectOpportunityRefresh";
import { buildPipelinePatch, pipelineError, pipelinePatchConfirmed, pipelineVersion, remoteOpportunityValues, requirePipelineEditor } from "./pipelineOpportunityValues";
import { claimPipelineChange, completePipelineChange, copySnapshot, getPipelineReceipt, loadPipelineCopies, rejectPipelineChange } from "./pipelineOpportunityStore";

const pendingMessage = "NXT confirmation is still needed. Your change is saved for verification and will not be sent again. Check sync status in a few minutes; NXT changes can take time to appear.";
const pending = () => ({ state: "pending", message: pendingMessage });

async function loadContext(id, actor, operation) {
  const copies = await loadPipelineCopies(id);
  if (copies.length > 100) throw pipelineError("Too many linked copies. Ask an administrator to review the opportunity links.");
  const identity = requirePipelineEditor(copies, actor, operation);
  return { copies, identity };
}

function provider(identity, actor, origin, method = "GET", body) {
  return blackbaudApiFetch(`/opportunity/v1/opportunities/${identity.nxtId}`, {
    userId: actor.id, authUserId: actor.id, origin, method, body, maxRetries: 0, timeoutMs: 8000,
  });
}

export async function getPipelineEditor({ id, actor, origin }) {
  const { copies, identity } = await loadContext(id, actor, "edit");
  if (copies.some(row => row.pipeline_change_id)) return pending();
  const remote = await provider(identity, actor, origin);
  const fields = remoteOpportunityValues(remote, identity);
  return { state: "ready", fields, version: pipelineVersion(copies, fields), copyCount: copies.length, nxtId: identity.nxtId };
}

async function verify(receipt, copies, actor, origin) {
  const identity = { nxtId: receipt.nxt_id, constituentId: receipt.constituent_id };
  copies = await loadPipelineCopies(receipt.opportunity_id);
  const currentIdentity = requirePipelineEditor(copies, actor, receipt.operation);
  if (currentIdentity.nxtId !== identity.nxtId || currentIdentity.constituentId !== identity.constituentId) throw pipelineError("The NXT links changed. An administrator must review this pending change.");
  if (JSON.stringify(copies.map(row => String(row.id)).sort()) !== JSON.stringify(receipt.copies.map(row => row.id).sort())) {
    throw pipelineError("The linked workspaces changed. An administrator must reconcile this saved change; it will not be resent.");
  }
  const remote = await provider(identity, actor, origin);
  const values = remoteOpportunityValues(remote, identity);
  if (!pipelinePatchConfirmed(receipt.patch, values)) return pending();
  const saved = { ...copies[0], blackbaud_opportunity_id: receipt.nxt_id };
  const next = normalizeLinkedOpportunity(remote, saved, identity.constituentId);
  if (receipt.operation === "archive") {
    next.opportunity_status = "Archived";
    // Archive is not a gift outcome. Retain the old stage, funding, and history.
    next.current_stage = values.status;
    next.closed_amount = remote.funded_amount === undefined ? saved.closed_amount : values.funded_amount;
    next.close_date = remote.funded_date === undefined ? saved.close_date : values.funded_date;
  }
  await completePipelineChange(receipt, next);
  return { state: "complete", message: receipt.operation === "archive" ? "Archived in NXT and all linked app workspaces. History was retained." : "Saved and verified in NXT and all linked app workspaces." };
}

export async function verifyPipelineChange({ id, actor, origin }) {
  const { copies } = await loadContext(id, actor, "edit");
  const receiptId = copies.find(row => row.pipeline_change_id)?.pipeline_change_id;
  if (!receiptId) return { state: "complete", message: "No pending pipeline change. Reload saved data for the latest values." };
  const receipt = await getPipelineReceipt(receiptId);
  if (!receipt || receipt.state !== "pending") throw pipelineError("The saved change requires administrator review.");
  requirePipelineEditor(copies, actor, receipt.operation);
  return verify(receipt, copies, actor, origin);
}

export async function savePipelineChange({ id, actor, origin, body }) {
  const { copies, identity } = await loadContext(id, actor, body?.operation);
  if (copies.some(row => row.pipeline_change_id)) return pending();
  const before = remoteOpportunityValues(await provider(identity, actor, origin), identity);
  const patch = buildPipelinePatch(body, before);
  if (body.version !== pipelineVersion(copies, before)) throw pipelineError("This opportunity changed in the app or NXT. Close and reopen the editor to review the latest values before saving.");
  if (!Object.keys(patch).length) return { state: "unchanged", message: "No fields changed." };
  const receipt = { id: randomUUID(), opportunity_id: id, nxt_id: identity.nxtId, constituent_id: identity.constituentId,
    actor_id: actor.id, operation: body.operation, patch, before_remote: before, copies: copySnapshot(copies) };
  await claimPipelineChange(receipt);
  try {
    await provider(identity, actor, origin, "PATCH", patch);
  } catch (error) {
    // A timeout/5xx may follow a committed write. Never unlock or replay it.
    if ([400, 401, 403, 404, 422, 429].includes(Number(error?.httpStatus))) {
      await rejectPipelineChange(receipt.id);
      throw pipelineError("NXT rejected this change. No app opportunity fields were changed. Check the NXT connection, permissions, field values, or rate limit, then reopen the editor.", 422);
    }
    return pending();
  }
  try { return await verify(receipt, copies, actor, origin); }
  catch { return pending(); }
}
