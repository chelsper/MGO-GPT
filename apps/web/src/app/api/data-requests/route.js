import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import {
  normalizeDataRequestType,
  upsertOpenDataRequest,
} from "@/app/api/utils/dataRequests";

function cleanText(value) {
  return String(value || "").trim();
}

async function resolveProspectContext({ userId, prospectId }) {
  if (!prospectId) return null;

  const rows = await sql`
    SELECT
      p.id,
      p.user_id,
      p.constituent_id,
      p.prospect_name,
      COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS blackbaud_constituent_id
    FROM prospects p
    LEFT JOIN constituents c ON c.id = p.constituent_id
    WHERE p.id = ${prospectId}
      AND p.user_id = ${userId}
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const isReviewer = isReviewerRole(user.role);

    const rows = isReviewer
      ? await sql`
          SELECT
            dcr.*,
            requester.name AS requester_name,
            requester.email AS requester_email,
            owner_user.name AS owner_user_name,
            owner_user.email AS owner_user_email,
            reviewer.name AS reviewed_by_name
          FROM data_change_requests dcr
          LEFT JOIN users requester ON requester.id = dcr.requester_user_id
          LEFT JOIN users owner_user ON owner_user.id = dcr.owner_user_id
          LEFT JOIN users reviewer ON reviewer.id = dcr.reviewed_by
          WHERE (${status || null}::TEXT IS NULL OR dcr.status = ${status || null})
          ORDER BY
            CASE dcr.status
              WHEN 'Open' THEN 0
              WHEN 'In Progress' THEN 1
              WHEN 'Completed' THEN 2
              ELSE 3
            END,
            dcr.updated_at DESC
        `
      : await sql`
          SELECT
            dcr.*,
            requester.name AS requester_name,
            requester.email AS requester_email,
            owner_user.name AS owner_user_name,
            owner_user.email AS owner_user_email,
            reviewer.name AS reviewed_by_name
          FROM data_change_requests dcr
          LEFT JOIN users requester ON requester.id = dcr.requester_user_id
          LEFT JOIN users owner_user ON owner_user.id = dcr.owner_user_id
          LEFT JOIN users reviewer ON reviewer.id = dcr.reviewed_by
          WHERE (dcr.requester_user_id = ${user.id} OR dcr.owner_user_id = ${user.id})
            AND (${status || null}::TEXT IS NULL OR dcr.status = ${status || null})
          ORDER BY dcr.updated_at DESC
        `;

    return Response.json(rows);
  } catch (error) {
    console.error("Error fetching data requests:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch data requests" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const prospect = await resolveProspectContext({
      userId: user.id,
      prospectId: body?.prospectId || null,
    });

    const requestNote = cleanText(body?.requestNote);
    const providedData = body?.providedData && typeof body.providedData === "object"
      ? body.providedData
      : null;

    const result = await upsertOpenDataRequest({
      sql,
      requesterUserId: sessionUser?.id || user.id,
      ownerUserId: user.id,
      prospectId: prospect?.id || body?.prospectId || null,
      prospectPoolId: body?.prospectPoolId || null,
      constituentId: prospect?.constituent_id || body?.constituentId || null,
      blackbaudConstituentId:
        prospect?.blackbaud_constituent_id || cleanText(body?.blackbaudConstituentId) || null,
      constituentName:
        prospect?.prospect_name || cleanText(body?.constituentName) || "Unknown constituent",
      requestType: normalizeDataRequestType(body?.requestType),
      requestNote,
      providedData,
      sourceContext: cleanText(body?.sourceContext) || "app",
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating data request:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create data request" },
      { status: 500 },
    );
  }
}
