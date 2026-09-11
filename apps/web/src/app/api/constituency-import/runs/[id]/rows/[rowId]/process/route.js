import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { hasImportWriteHistory } from "@/utils/importWriteResults";
import { verifyImportTargetIdentity } from "@/app/api/utils/importTargetIdentity";
import { quickImportApprovalBlocker, quickImportApplyBlocker } from "@/utils/quickImportWorkflow";
import { POST as create } from "../create/route";
import { POST as details } from "../details/route";
import { POST as apply } from "../../../apply/route";
import { POST as reconcile } from "../../../reconcile/route";

// One bounded step per request. Existing handlers retain their authorization,
// row claims, live identity checks, and durable per-write checkpoints.
export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: "Unauthorized", paused: true }, { status: 401 });
    const { sessionUser: user } = await getWorkspaceUser(session, request);
    if (!user || !isReviewerRole(user.role)) return Response.json({ error: "Only Advancement Services and Admin users can process imports.", paused: true }, { status: 403 });
    const { id: runId, rowId } = params;
    if (!/^\d+$/.test(runId) || !/^\d+$/.test(rowId)) return Response.json({ error: "Invalid import run or row ID" }, { status: 400 });
    const [row] = await sql`SELECT * FROM constituency_import_rows WHERE id = ${rowId} AND run_id = ${runId} LIMIT 1`;
    if (!row) return Response.json({ error: "Import row not found" }, { status: 404 });
    const origin = new URL(request.url).origin;
    const base = `/api/constituency-import/runs/${runId}`;
    function stepRequest(path, body) {
      return new Request(`${origin}${path}`, { method: "POST", headers: request.headers,
        ...(body ? { body: JSON.stringify(body) } : {}) });
    }
    if (!row.created_blackbaud_constituent_id) {
      return await create(stepRequest(`${base}/rows/${rowId}/create?mode=clear_nonmatches&complete=1`), { params });
    }
    const blocker = quickImportApprovalBlocker(row);
    if (blocker) return Response.json({ error: blocker, held: true }, { status: 409 });
    const workflow = row.preview.quickImportWorkflow;
    async function savePhase(phase, extra = {}, verification = null) {
      if (phase === "complete" && !verification?.verifiedAt) throw new Error("The saved verification checkpoint is missing.");
      const next = { ...workflow, ...extra, phase, updatedAt: new Date().toISOString() };
      const changed = await sql`UPDATE constituency_import_rows
        SET preview = jsonb_set(preview, '{quickImportWorkflow}', ${JSON.stringify(next)}::jsonb), updated_at = NOW()
        WHERE id = ${rowId} AND run_id = ${runId}
          AND preview->'quickImportWorkflow' = ${JSON.stringify(workflow)}::jsonb
          AND preview->'input' = ${JSON.stringify(row.preview.input)}::jsonb
          AND matched_blackbaud_constituent_id = ${row.created_blackbaud_constituent_id}
          AND created_blackbaud_constituent_id = ${row.created_blackbaud_constituent_id}
          AND (${phase !== "complete"} OR (requested_writes IS NOT DISTINCT FROM ${JSON.stringify(row.requested_writes)}::jsonb
            AND blackbaud_result->'reconciliation' IS NOT DISTINCT FROM ${verification ? JSON.stringify(verification) : null}::jsonb))
          AND status NOT IN ('Creating', 'Applying', 'Skipped', 'Conflict')
        RETURNING id`;
      if (!changed.length) throw new Error("Progress changed in another request. Reopen the saved run before continuing.");
    }
    async function hold(message) {
      await savePhase("review", { message });
      return Response.json({ error: message, held: true }, { status: 409 });
    }
    if (workflow.phase === "complete") return Response.json({ done: true });
    if (workflow.phase === "review") return Response.json({ error: workflow.message || "Review this record individually.", held: true }, { status: 409 });

    // A saved apply checkpoint always wins over stale workflow progress. Never
    // rebuild the plan or resend it after a lost response.
    const phase = hasImportWriteHistory(row) ? "verify" : workflow.phase;
    if (phase === "details") {
      const scopes = workflow.scopes || [];
      if (!scopes.length) {
        await savePhase("apply");
        return Response.json({ next: "apply" });
      }
      const response = await details(stepRequest(`${base}/rows/${rowId}/details`, { scopes: [scopes[0]] }), { params });
      const result = await response.json();
      if (!response.ok || !result.complete) return Response.json({ error: result.error || result.message || "NXT details could not be loaded. Resume to retry this read-only step.", paused: true }, { status: 503 });
      const remaining = scopes.slice(1);
      const next = remaining.length ? "details" : "apply";
      await savePhase(next, { scopes: remaining });
      return Response.json({ next, message: `Loaded ${scopes[0]}.` });
    }
    if (phase === "apply") {
      const unsafe = quickImportApplyBlocker(row);
      if (unsafe) return hold(unsafe);
      const response = await apply(stepRequest(`${base}/apply`, { rowIds: [rowId], quickImport: true }), { params: { id: runId } });
      const result = await response.json();
      if (!response.ok) return Response.json({ error: result.error || "The addition step did not finish. Reopen this row; no writes will be blindly retried.", paused: true }, { status: response.status });
      await savePhase("verify");
      return Response.json({ next: "verify" });
    }
    if (phase === "verify") {
      const identity = await verifyImportTargetIdentity({ request, user, row });
      if (!identity.ok && identity.diagnostic?.code === "identity_read_failed") return Response.json({ error: "NXT identity verification is unavailable. Resume to retry this read-only check; no writes will be repeated.", paused: true }, { status: 503 });
      if (!identity.ok) return hold(identity.message || "The saved NXT identity could not be confirmed. Review this record before continuing.");
      const response = await reconcile(stepRequest(`${base}/reconcile`, { rowIds: [rowId], completeIfMatches: row.status !== "Applied" }), { params: { id: runId } });
      const result = await response.json();
      if (!response.ok) return hold(result.error || "Compare this row with NXT before continuing. No writes were retried.");
      if (result.reconciliationSummary?.needsReview !== 0 || result.reconciliationSummary?.verifiedRows !== 1 ||
        (row.status !== "Applied" && result.reconciliationSummary?.completedRows !== 1)) {
        return hold(result.reconciliationSummary?.message || "Some details could not be verified. Review this row; no writes were retried.");
      }
      await savePhase("complete", { identityConfirmedAt: new Date().toISOString(), message: "Verified in NXT. No further approval or resend is needed." }, result.rows?.[0]?.reconciliation);
      return Response.json({ done: true, message: "Verified and complete." });
    }
    return hold("This saved processing step is not recognized. Review the row without recreating it.");
  } catch (error) {
    console.error("Import workflow paused", { rowId: params?.rowId, errorClass: error?.name });
    return Response.json({ error: "Processing paused before progress could be confirmed. Reopen the saved run; completed or uncertain NXT writes will not be repeated.", paused: true }, { status: 500 });
  }
}
