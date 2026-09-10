import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";

export async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const reviewer = await getOrCreateUser(session);
    if (reviewer.active === false || !isReviewerRole(reviewer.role)) {
      return Response.json({ error: "Reviewers only" }, { status: 403 });
    }
    const origin = new URL(request.url).origin;
    if (request.headers.get("origin") && request.headers.get("origin") !== origin) {
      return Response.json({ error: "Invalid request origin" }, { status: 403 });
    }
    const id = Number(params?.id);
    const body = await request.json().catch(() => null);
    const nxtId = String(body?.blackbaudConstituentId || "").trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !/^[1-9]\d*$/.test(nxtId) || body?.confirmLink !== true) {
      return Response.json({ error: "Select and confirm an NXT constituent match." }, { status: 400 });
    }
    await ensureAppSchema();
    const [entry] = await sql`
      SELECT pp.*, c.blackbaud_constituent_id AS local_blackbaud_constituent_id
      FROM prospect_pool pp
      LEFT JOIN constituents c ON c.id = pp.constituent_id
      WHERE pp.id = ${id}
    `;
    if (!entry) return Response.json({ error: "Pool entry not found" }, { status: 404 });
    if (entry.blackbaud_constituent_id || entry.local_blackbaud_constituent_id || !entry.assigned_user_id || entry.solicitor_assignment_sync_state === "success") {
      return Response.json({ error: "This entry is already linked, archived, or no longer assigned. Reload the pool before continuing." }, { status: 409 });
    }

    // Re-read the exact selected identity. Never infer a link from the name alone.
    let identity;
    try {
      identity = await blackbaudApiFetch(`/constituent/v1/constituents/${nxtId}`, {
        userId: reviewer.id,
        authUserId: reviewer.id,
        origin,
        method: "GET",
      });
    } catch {
      return Response.json({ error: "The selected NXT record could not be verified. Check your connection and try again; no link was saved." }, { status: 502 });
    }
    if (String(identity?.id || "") !== nxtId || !String(identity?.name || identity?.last || identity?.organization_name || "").trim()) {
      return Response.json({ error: "NXT did not confirm the selected record's identity. No link was saved." }, { status: 422 });
    }

    const debug = JSON.stringify({ operation: "link", linkedByUserId: reviewer.id, linkedAt: new Date().toISOString(), detail: "Reviewer confirmed an existing NXT record. Custom-field sync has not run." });
    // Only this pool entry changes. Preserve local identities, contacts, notes and assignment history.
    const [updated] = await sql`
      UPDATE prospect_pool pp
      SET blackbaud_constituent_id = ${nxtId},
          nxt_status_sync_state = 'pending',
          nxt_status_sync_error = NULL,
          nxt_status_sync_debug = ${debug}::jsonb,
          manual_nxt_update_required = FALSE,
          updated_at = NOW()
      WHERE pp.id = ${id}
        AND pp.assigned_user_id = ${entry.assigned_user_id}
        AND pp.constituent_id IS NOT DISTINCT FROM ${entry.constituent_id}::bigint
        AND pp.blackbaud_constituent_id IS NULL
        AND COALESCE(pp.solicitor_assignment_sync_state, '') <> 'success'
        AND NOT EXISTS (
          SELECT 1 FROM constituents c
          WHERE c.id = pp.constituent_id AND c.blackbaud_constituent_id IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM prospect_pool other
          LEFT JOIN constituents c ON c.id = other.constituent_id
          WHERE other.id <> pp.id AND other.assigned_user_id = pp.assigned_user_id
            AND other.assignment_status = 'active'
            AND COALESCE(other.blackbaud_constituent_id, c.blackbaud_constituent_id) = ${nxtId}
        )
      RETURNING pp.*
    `;
    if (!updated) {
      return Response.json({ error: "The entry changed, or this constituent is already assigned to this MGO. Reload the pool; no link was saved." }, { status: 409 });
    }
    return Response.json({ ...updated, linked_blackbaud_constituent_id: nxtId });
  } catch {
    return Response.json({ error: "Could not save the NXT link. Reload the pool before retrying." }, { status: 500 });
  }
}
