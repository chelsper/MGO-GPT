import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { getBlackbaudConfigIssues } from "@/app/api/utils/blackbaud";
import { getClosedFiscalYearDiagnostic } from "@/app/api/utils/closedFyGiftTotals";
import { isReviewerRole } from "@/utils/workspaceRoles";

function normalizeText(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function normalizeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function findTargetUser(searchParams, fallbackUser) {
  const userId = normalizeInteger(searchParams.get("userId"));
  if (userId) {
    const rows = await sql`
      SELECT id, name, email, role, active, blackbaud_constituent_id, blackbaud_lookup_id
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const email = normalizeText(searchParams.get("email"));
  if (email) {
    const rows = await sql`
      SELECT id, name, email, role, active, blackbaud_constituent_id, blackbaud_lookup_id
      FROM users
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const blackbaudConstituentId = normalizeText(searchParams.get("blackbaudConstituentId"));
  if (blackbaudConstituentId) {
    const rows = await sql`
      SELECT id, name, email, role, active, blackbaud_constituent_id, blackbaud_lookup_id
      FROM users
      WHERE blackbaud_constituent_id = ${blackbaudConstituentId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const blackbaudLookupId = normalizeText(searchParams.get("blackbaudLookupId"));
  if (blackbaudLookupId) {
    const rows = await sql`
      SELECT id, name, email, role, active, blackbaud_constituent_id, blackbaud_lookup_id
      FROM users
      WHERE blackbaud_lookup_id = ${blackbaudLookupId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  return fallbackUser || null;
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth(request);
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser } = await getWorkspaceUser(session, request);
    if (!sessionUser || !isReviewerRole(sessionUser.role)) {
      return Response.json({ error: "Forbidden - reviewers only" }, { status: 403 });
    }

    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    const configIssues = getBlackbaudConfigIssues(origin);
    if (configIssues.length > 0) {
      return Response.json(
        { error: "Blackbaud is not configured", configIssues },
        { status: 400 },
      );
    }

    const fiscalYearLabel = normalizeText(requestUrl.searchParams.get("fiscalYear"));
    const targetUser = await findTargetUser(requestUrl.searchParams, workspaceUser);
    if (!targetUser) {
      return Response.json({ error: "Target user not found" }, { status: 404 });
    }

    const diagnostic = await getClosedFiscalYearDiagnostic({
      workspaceUser: targetUser,
      authUserId: sessionUser.id,
      origin,
      fiscalYearLabel,
    });

    return Response.json(
      {
        targetUser: {
          id: targetUser.id,
          name: targetUser.name || null,
          email: targetUser.email || null,
          role: targetUser.role || null,
          active: targetUser.active !== false,
          blackbaudConstituentId: targetUser.blackbaud_constituent_id || null,
          blackbaudLookupId: targetUser.blackbaud_lookup_id || null,
        },
        ...diagnostic,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Closed FY diagnostic error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load closed fiscal year diagnostic.",
      },
      { status: 500 },
    );
  }
}
