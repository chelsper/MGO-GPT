import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { getBlackbaudConfigIssues } from "@/app/api/utils/blackbaud";
import { getClosedFiscalYearWindowForLabel } from "@/app/api/utils/closedFyGiftTotals";
import { getNxtActionSummaryDiagnostic } from "@/app/api/utils/nxtActionTotals";
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
      SELECT id, name, email, role, active, blackbaud_constituent_id, blackbaud_lookup_id, blackbaud_fundraiser_alias_ids
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const email = normalizeText(searchParams.get("email"));
  if (email) {
    const rows = await sql`
      SELECT id, name, email, role, active, blackbaud_constituent_id, blackbaud_lookup_id, blackbaud_fundraiser_alias_ids
      FROM users
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const blackbaudConstituentId = normalizeText(searchParams.get("blackbaudConstituentId"));
  if (blackbaudConstituentId) {
    const rows = await sql`
      SELECT id, name, email, role, active, blackbaud_constituent_id, blackbaud_lookup_id, blackbaud_fundraiser_alias_ids
      FROM users
      WHERE blackbaud_constituent_id = ${blackbaudConstituentId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const blackbaudLookupId = normalizeText(searchParams.get("blackbaudLookupId"));
  if (blackbaudLookupId) {
    const rows = await sql`
      SELECT id, name, email, role, active, blackbaud_constituent_id, blackbaud_lookup_id, blackbaud_fundraiser_alias_ids
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

    const fiscalYearLabel = normalizeText(requestUrl.searchParams.get("fiscalYear")) || "FY27";
    const fiscal =
      getClosedFiscalYearWindowForLabel(fiscalYearLabel) || {
        fiscalYearLabel: fiscalYearLabel,
        fiscalYearStart: "2026-07-01",
        fiscalYearEnd: "2027-06-30",
      };
    const targetUser = await findTargetUser(requestUrl.searchParams, workspaceUser);
    if (!targetUser) {
      return Response.json({ error: "Target user not found" }, { status: 404 });
    }

    const diagnostic = await getNxtActionSummaryDiagnostic({
      workspaceUsers: [targetUser],
      authUserId: sessionUser.id,
      origin,
      fiscalYearStart: fiscal.fiscalYearStart,
      fiscalYearEnd: fiscal.fiscalYearEnd,
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
          blackbaudFundraiserAliasIds: Array.isArray(targetUser.blackbaud_fundraiser_alias_ids)
            ? targetUser.blackbaud_fundraiser_alias_ids
            : [],
        },
        fiscalYearLabel: fiscal.fiscalYearLabel,
        ...diagnostic,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("NXT action diagnostic error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load NXT action diagnostic.",
      },
      { status: 500 },
    );
  }
}
