import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

const NXT_MANUAL_REQUIRED_MESSAGE =
  "NXT opportunity gift-link write support has not been verified yet. Link this gift to the opportunity manually in NXT if required.";

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeGift(gift) {
  if (typeof gift === "string" || typeof gift === "number") {
    return {
      blackbaudGiftId: String(gift).trim(),
      giftDate: null,
      giftAmount: null,
      giftType: null,
      giftFund: null,
      appliedAmount: null,
    };
  }

  if (!gift || typeof gift !== "object") return null;

  const blackbaudGiftId = String(
    gift.blackbaudGiftId || gift.blackbaud_gift_id || gift.giftId || gift.id || "",
  ).trim();
  if (!blackbaudGiftId) return null;

  const giftAmount = toFiniteNumberOrNull(
    gift.giftAmount ?? gift.gift_amount ?? gift.amount ?? null,
  );
  const appliedAmount = toFiniteNumberOrNull(
    gift.appliedAmount ?? gift.applied_amount ?? gift.amount ?? giftAmount ?? null,
  );

  return {
    blackbaudGiftId,
    giftDate: gift.giftDate || gift.gift_date || gift.date || null,
    giftAmount,
    giftType: gift.giftType || gift.gift_type || gift.type || null,
    giftFund: gift.giftFund || gift.gift_fund || gift.fund || null,
    appliedAmount,
  };
}

async function getGiftLinks(prospectOpportunityId) {
  return sql`
    SELECT links.*
    FROM prospect_opportunity_gift_links links
    WHERE links.prospect_opportunity_id = ${prospectOpportunityId} OR (
      links.prospect_opportunity_id IS NULL AND EXISTS (
        SELECT 1 FROM prospect_opportunities po JOIN prospects p ON p.id = po.prospect_id
        WHERE po.id = ${prospectOpportunityId}
          AND links.workspace_user_id = p.user_id
          AND links.blackbaud_opportunity_id = po.blackbaud_opportunity_id
      ) AND NOT EXISTS (
        SELECT 1 FROM prospect_opportunity_gift_links direct_link
        WHERE direct_link.prospect_opportunity_id = ${prospectOpportunityId}
          AND direct_link.blackbaud_gift_id = links.blackbaud_gift_id
      )
    )
    ORDER BY links.gift_date DESC NULLS LAST, links.created_at DESC
  `;
}

export async function GET(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const opportunityRows = await sql`
      SELECT po.id
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE po.id = ${params.id} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    if (!opportunityRows.length) {
      return Response.json({ error: "Opportunity not found" }, { status: 404 });
    }

    return Response.json({ giftLinks: await getGiftLinks(params.id) });
  } catch (error) {
    console.error("Error fetching opportunity gift links:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to fetch opportunity gift links",
      },
      { status: 500 },
    );
  }
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const gifts = Array.isArray(body?.gifts)
      ? body.gifts.map(normalizeGift).filter(Boolean)
      : [];

    if (!gifts.length) {
      return Response.json(
        { error: "Select at least one gift to link" },
        { status: 400 },
      );
    }

    const opportunityRows = await sql`
      SELECT po.*, p.user_id
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE po.id = ${params.id} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    const opportunity = opportunityRows[0] || null;
    if (!opportunity) {
      return Response.json({ error: "Opportunity not found" }, { status: 404 });
    }

    for (const gift of gifts) {
      await sql`
        INSERT INTO prospect_opportunity_gift_links (
          prospect_opportunity_id,
          blackbaud_opportunity_id,
          constituent_id,
          blackbaud_gift_id,
          gift_date,
          gift_amount,
          gift_type,
          gift_fund,
          applied_amount,
          nxt_sync_state,
          nxt_sync_error,
          created_by,
          updated_at
        ) VALUES (
          ${opportunity.id},
          ${opportunity.blackbaud_opportunity_id || null},
          ${opportunity.constituent_id || null},
          ${gift.blackbaudGiftId},
          ${gift.giftDate || null},
          ${gift.giftAmount},
          ${gift.giftType || null},
          ${gift.giftFund || null},
          ${gift.appliedAmount},
          'manual_required',
          ${NXT_MANUAL_REQUIRED_MESSAGE},
          ${user.id},
          NOW()
        )
        ON CONFLICT (prospect_opportunity_id, blackbaud_gift_id)
        DO UPDATE SET
          blackbaud_opportunity_id = EXCLUDED.blackbaud_opportunity_id,
          constituent_id = EXCLUDED.constituent_id,
          gift_date = EXCLUDED.gift_date,
          gift_amount = EXCLUDED.gift_amount,
          gift_type = EXCLUDED.gift_type,
          gift_fund = EXCLUDED.gift_fund,
          applied_amount = EXCLUDED.applied_amount,
          nxt_sync_state = EXCLUDED.nxt_sync_state,
          nxt_sync_error = EXCLUDED.nxt_sync_error,
          updated_at = NOW()
      `;
      if (opportunity.blackbaud_opportunity_id) {
        await sql`
          DELETE FROM prospect_opportunity_gift_links
          WHERE prospect_opportunity_id IS NULL AND workspace_user_id = ${user.id}
            AND blackbaud_opportunity_id = ${opportunity.blackbaud_opportunity_id}
            AND blackbaud_gift_id = ${gift.blackbaudGiftId}
        `;
      }
    }

    return Response.json({
      giftLinks: await getGiftLinks(opportunity.id),
      nxtSync: {
        state: "manual_required",
        message: NXT_MANUAL_REQUIRED_MESSAGE,
      },
    });
  } catch (error) {
    console.error("Error saving opportunity gift links:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to save opportunity gift links",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user } = await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const giftLinkId =
      body?.giftLinkId || body?.gift_link_id || body?.id || null;
    const blackbaudGiftId = String(
      body?.blackbaudGiftId || body?.blackbaud_gift_id || body?.giftId || "",
    ).trim();

    if (!giftLinkId && !blackbaudGiftId) {
      return Response.json(
        { error: "A gift link ID or Blackbaud gift ID is required" },
        { status: 400 },
      );
    }

    const opportunityRows = await sql`
      SELECT po.id
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE po.id = ${params.id} AND p.user_id = ${user.id}
      LIMIT 1
    `;

    const opportunity = opportunityRows[0] || null;
    if (!opportunity) {
      return Response.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const deletedRows = giftLinkId
      ? await sql`
          DELETE FROM prospect_opportunity_gift_links
          WHERE id = ${giftLinkId}
            AND (prospect_opportunity_id = ${opportunity.id} OR (
              prospect_opportunity_id IS NULL AND workspace_user_id = ${user.id}
              AND blackbaud_opportunity_id = (SELECT blackbaud_opportunity_id FROM prospect_opportunities WHERE id = ${opportunity.id})
            ))
          RETURNING id
        `
      : await sql`
          DELETE FROM prospect_opportunity_gift_links
          WHERE blackbaud_gift_id = ${blackbaudGiftId}
            AND (prospect_opportunity_id = ${opportunity.id} OR (
              prospect_opportunity_id IS NULL AND workspace_user_id = ${user.id}
              AND blackbaud_opportunity_id = (SELECT blackbaud_opportunity_id FROM prospect_opportunities WHERE id = ${opportunity.id})
            ))
          RETURNING id
        `;

    if (!deletedRows.length) {
      return Response.json({ error: "Gift link not found" }, { status: 404 });
    }

    return Response.json({
      giftLinks: await getGiftLinks(opportunity.id),
      message:
        "Gift unlinked in JUMGOGPT. If this relationship was also added in NXT, remove it there manually.",
    });
  } catch (error) {
    console.error("Error unlinking opportunity gift:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to unlink opportunity gift",
      },
      { status: 500 },
    );
  }
}
