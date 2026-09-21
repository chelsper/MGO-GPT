import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import workspaceWritePermissionError from "@/app/api/utils/workspaceWritePermission";
import { publicCreateReceipt } from "@/app/api/utils/nxtCreateReceipt";
import { matchesCreatedRecord } from "@/app/api/utils/nxtCreateVerification";
import { getBlackbaudAction, getBlackbaudOpportunity } from "@/app/api/utils/blackbaud";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function contextFor(request) {
  const session = await auth();
  if (!session?.user?.email) return reply({ error: "Please sign in." }, 401);
  await ensureAppSchema();
  const context = await getWorkspaceUser(session, request);
  if (!context.sessionUser || !context.workspaceUser || context.sessionUser.active === false || context.workspaceUser.active === false)
    return reply({ error: "Active workspace access is required." }, 403);
  return workspaceWritePermissionError(context) || context;
}

export async function GET(request) {
  try {
    const context = await contextFor(request);
    if (context instanceof Response) return context;
    const rows = await sql`SELECT * FROM nxt_create_receipts WHERE owner_user_id = ${context.workspaceUser.id}
      ORDER BY CASE WHEN state IN ('processing', 'review', 'created') THEN 0 ELSE 1 END, created_at DESC LIMIT 100`;
    return reply({ workspace: { id: context.workspaceUser.id, name: context.workspaceUser.name }, receipts: rows.map(publicCreateReceipt) });
  } catch { return reply({ error: "Saved submissions could not be loaded. No NXT request was sent." }, 500); }
}

// Only GETs to NXT; this endpoint cannot create, patch or delete provider records.
export async function POST(request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site"
      || request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
      return reply({ error: "Request must come from this app." }, 403);
    const context = await contextFor(request);
    if (context instanceof Response) return context;
    const body = await request.json().catch(() => null);
    if (!body || Object.keys(body).some(key => !["receiptId", "remoteId", "workspaceId"].includes(key))
      || !/^[1-9]\d*$/.test(String(body.receiptId || "")) || !/^[1-9]\d*$/.test(String(body.remoteId || ""))
      || String(body.workspaceId) !== String(context.workspaceUser.id))
      return reply({ error: "Reload this workspace and enter the existing NXT record's system ID." }, 400);
    const [row] = await sql`SELECT *, updated_at::text AS updated_at FROM nxt_create_receipts
      WHERE id = ${body.receiptId} AND owner_user_id = ${context.workspaceUser.id}`;
    if (!row) return reply({ error: "Submission not found in this workspace." }, 404);
    if (["complete", "verified"].includes(row.state)) return reply({ receipt: publicCreateReceipt(row) });
    if (row.remote_id && row.remote_id !== String(body.remoteId)) return reply({ error: "Use the NXT ID saved with this submission." }, 409);
    if (row.state === "processing" && Date.now() - Date.parse(row.updated_at) < 5 * 60 * 1000)
      return reply({ error: "This submission may still be running. Reload saved submissions in a few minutes." }, 409);
    const api = { userId: context.workspaceUser.id, authUserId: context.sessionUser.id, origin: new URL(request.url).origin };
    const remoteId = String(body.remoteId);
    const record = row.kind === "action" ? await getBlackbaudAction({ ...api, actionId: remoteId })
      : await getBlackbaudOpportunity({ ...api, opportunityId: remoteId });
    if (!matchesCreatedRecord(row, record, remoteId)) return reply({ error: "The existing NXT record does not match the saved submission. Nothing was resent or unlocked. Review it in NXT with an administrator." }, 409);
    const [saved] = await sql`UPDATE nxt_create_receipts SET state = 'verified', remote_id = ${remoteId},
      verified_by_user_id = ${context.sessionUser.id}, verified_at = NOW(), updated_at = NOW()
      WHERE id = ${row.id} AND owner_user_id = ${context.workspaceUser.id} AND state = ${row.state}
        AND remote_id IS NOT DISTINCT FROM ${row.remote_id} AND updated_at = ${row.updated_at}
      RETURNING *`;
    if (!saved) return reply({ error: "Submission status changed. Reload saved submissions; nothing was resent." }, 409);
    return reply({ receipt: publicCreateReceipt(saved) });
  } catch { return reply({ error: "NXT verification could not finish. The submission remains protected; nothing was resent." }, 502); }
}
