import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import workspaceWritePermissionError from "@/app/api/utils/workspaceWritePermission";
import sql from "@/app/api/utils/sql";

function validDate(value) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
    await ensureAppSchema();
    const context = await getWorkspaceUser(session, request);
    const permissionError = workspaceWritePermissionError(context);
    if (permissionError) return permissionError;
    const { workspaceUser: user } = context;
    const body = await request.json().catch(() => null);
    if (!body || Array.isArray(body) || !["complete", "reopen", "reschedule"].includes(body.action) || !/^[1-9]\d*$/.test(String(params.id))) {
      return Response.json({ error: "Choose a valid next-step action." }, { status: 400 });
    }
    const allowedFields = ["action", "expectedWorkspaceId", "expectedUpdatedAt", ...(body.action === "reschedule" ? ["dueDate"] : [])];
    if (Object.keys(body).some(key => !allowedFields.includes(key)) || (body.action === "reschedule" && !validDate(body.dueDate))) {
      return Response.json({ error: "Choose a valid due date or No date. Only the selected quick action can be changed here." }, { status: 400 });
    }
    if (String(body.expectedWorkspaceId) !== String(user.id)) {
      return Response.json({ error: "The selected workspace changed. Reload this page before continuing." }, { status: 409 });
    }
    if (typeof body.expectedUpdatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]/.test(body.expectedUpdatedAt) || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
      return Response.json({ error: "Reload this next step before continuing." }, { status: 400 });
    }

    const reopening = body.action === "reopen";
    const completing = body.action === "complete";
    // Keep the reminder, its legacy primary summary, and dashboard cache atomic.
    // No discussion or NXT records are touched. Reopen restores an additional task,
    // never an old primary next step over the constituent's newer plan.
    const [result] = await sql`
      WITH target AS MATERIALIZED (
        SELECT * FROM pending_actions
        WHERE id = ${params.id} AND owner_user_id = ${user.id}
        FOR UPDATE
      ), primary_prospect AS MATERIALIZED (
        SELECT p.* FROM prospects p JOIN target t ON p.id = t.prospect_id
        WHERE p.user_id = ${user.id} AND t.is_primary AND NOT ${reopening}
        FOR UPDATE OF p
      ), updated AS (
        UPDATE pending_actions pa
        SET status = ${completing ? "Done" : "Open"},
            due_date = CASE WHEN ${body.action === "reschedule"} THEN ${body.dueDate ?? null}::date ELSE pa.due_date END,
            completed_at = CASE WHEN ${completing} THEN NOW() WHEN ${reopening} THEN NULL ELSE pa.completed_at END,
            is_primary = CASE WHEN ${reopening} THEN FALSE ELSE pa.is_primary END,
            updated_at = NOW()
        FROM target t
        WHERE pa.id = t.id AND pa.owner_user_id = ${user.id}
          AND pa.updated_at = ${body.expectedUpdatedAt}::timestamptz
          AND pa.status = ${reopening ? "Done" : "Open"}
          AND (
            ${reopening} OR NOT t.is_primary OR t.prospect_id IS NULL OR EXISTS (
              SELECT 1 FROM primary_prospect p
              WHERE p.next_action_text IS NOT DISTINCT FROM t.title
                AND p.next_action_due_date IS NOT DISTINCT FROM t.due_date
                AND p.next_action_completed_at IS NULL
            )
          )
        RETURNING pa.*
      ), mirrored AS (
        UPDATE prospects p
        SET next_action_text = CASE WHEN u.status = 'Open' THEN u.title ELSE NULL END,
            next_action_due_date = CASE WHEN u.status = 'Open' THEN u.due_date ELSE NULL END,
            next_action_completed_at = u.completed_at,
            updated_at = NOW()
        FROM updated u, primary_prospect locked
        WHERE p.id = u.prospect_id AND p.id = locked.id AND p.user_id = ${user.id} AND u.is_primary
        RETURNING p.id
      ), invalidated AS (
        UPDATE users SET blackbaud_summary_cache = NULL, blackbaud_summary_cache_key = NULL,
          blackbaud_summary_cached_at = NULL, updated_at = NOW()
        WHERE id = ${user.id} AND EXISTS (SELECT 1 FROM updated)
        RETURNING id
      )
      SELECT EXISTS (SELECT 1 FROM target) AS found,
        (SELECT json_build_object('id', id, 'status', status, 'due_date', due_date,
          'is_primary', is_primary, 'updated_at', updated_at::text) FROM updated) AS item
    `;
    if (!result?.found) return Response.json({ error: "Next step not found in this workspace." }, { status: 404 });
    if (!result.item) return Response.json({ error: "This next step or its primary plan changed. Nothing was saved. Reload the saved list to review the current version." }, { status: 409 });
    return Response.json(result.item, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error applying next-step quick action:", error);
    return Response.json({ error: "The next-step update could not be confirmed. Reload the saved list before trying again." }, { status: 500 });
  }
}
