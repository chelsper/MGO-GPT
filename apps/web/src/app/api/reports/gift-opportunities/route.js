import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { getReportAccessForUser, PORTFOLIO_GIVING_REPORT_KEY } from "@/app/api/utils/reportAccess";
import { blackbaudApiFetch, getBlackbaudGift } from "@/app/api/utils/blackbaud";
import { getGiftDisplayDetails } from "@/app/api/utils/giftDisplayDetails";
import { addReportFundDescriptions } from "@/app/api/utils/reportFundDescriptions";
import { getReportGiftOpportunities, isOpenNxtOpportunity, giftBelongsToConstituent } from "@/app/api/utils/reportGiftOpportunities";

const validId = (value) => typeof value === "string" && /^\d{1,20}$/.test(value);
const response = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function authorize(request) {
  const session = await auth(request);
  if (!session?.user?.email) return { error: response({ error: "Unauthorized" }, 401) };
  await ensureAppSchema();
  const { sessionUser, workspaceUser, isActing } = await getWorkspaceUser(session, request);
  if (!workspaceUser) return { error: response({ error: "User not found" }, 404) };
  const access = await getReportAccessForUser(PORTFOLIO_GIVING_REPORT_KEY, sessionUser);
  if (!access.canView || isActing) return { error: response({ error: "Open your own workspace to use gift actions." }, 403) };
  return { userId: workspaceUser.id, authUserId: sessionUser.id, origin: new URL(request.url).origin };
}

export async function GET(request) {
  try {
    const context = await authorize(request);
    if (context.error) return context.error;
    const ids = [...new Set((new URL(request.url).searchParams.get("constituentIds") || "").split(","))];
    if (!ids.length || ids.length > 50 || !ids.every(validId)) return response({ error: "Supply 1 to 50 constituent IDs." }, 400);
    return response({ byConstituentId: await getReportGiftOpportunities(ids, context) });
  } catch {
    return response({ error: "Open opportunities could not be checked. Please retry." }, 502);
  }
}

export async function POST(request) {
  try {
    const context = await authorize(request);
    if (context.error) return context.error;
    const body = await request.json().catch(() => null);
    const { constituentId, opportunityId, giftId } = body || {};
    if (![constituentId, opportunityId, giftId].every(validId)) return response({ error: "Select a constituent, opportunity, and gift." }, 400);
    // Recheck live eligibility at save time. Never trust IDs or amounts from the browser.
    const opportunity = await blackbaudApiFetch(`/opportunity/v1/opportunities/${encodeURIComponent(opportunityId)}`, context);
    if (String(opportunity?.constituent_id) !== constituentId || !isOpenNxtOpportunity(opportunity)) {
      return response({ error: "This opportunity is no longer open on the selected constituent's record." }, 409);
    }
    const gift = await getBlackbaudGift({ ...context, giftId });
    if (!giftBelongsToConstituent(gift, constituentId)) return response({ error: "The gift is not associated with this constituent." }, 400);
    const details = getGiftDisplayDetails(gift);
    await addReportFundDescriptions({ acknowledgmentCredits: [details] }, context);
    const amount = gift?.amount?.value ?? null;
    if (amount !== null && !Number.isFinite(Number(amount))) return response({ error: "Gift amount is unavailable." }, 502);
    const existing = await sql`
      SELECT po.id, po.constituent_id FROM prospect_opportunities po
      JOIN prospects p ON p.id = po.prospect_id
      WHERE p.user_id = ${context.userId} AND po.blackbaud_opportunity_id = ${opportunityId}
      ORDER BY po.id LIMIT 1
    `;
    const local = existing[0];
    const message = "Gift link saved in JUMGOGPT. NXT linking still requires manual review.";
    // The same relationship store is used by the existing opportunity gift-link workflow.
    const values = {
      opportunityId, giftId, constituentId, amount,
      type: details.giftType, fund: details.fundDescriptions.join("; ") || null,
      date: gift.date || null,
    };
    if (local) {
      await sql`
        INSERT INTO prospect_opportunity_gift_links
          (prospect_opportunity_id, blackbaud_opportunity_id, constituent_id, blackbaud_constituent_id,
           workspace_user_id, blackbaud_gift_id, gift_date, gift_amount, gift_type, gift_fund, applied_amount,
           nxt_sync_state, nxt_sync_error, created_by)
        VALUES (${local.id}, ${opportunityId}, ${local.constituent_id}, ${constituentId},
          ${context.userId}, ${giftId}, ${values.date}, ${amount}, ${values.type}, ${values.fund}, ${amount},
          'manual_required', ${message}, ${context.authUserId})
        ON CONFLICT (prospect_opportunity_id, blackbaud_gift_id) DO UPDATE SET
          gift_date = EXCLUDED.gift_date, gift_amount = EXCLUDED.gift_amount, gift_type = EXCLUDED.gift_type,
          gift_fund = EXCLUDED.gift_fund, applied_amount = EXCLUDED.applied_amount, updated_at = NOW()
      `;
      await sql`
        DELETE FROM prospect_opportunity_gift_links
        WHERE prospect_opportunity_id IS NULL AND workspace_user_id = ${context.userId}
          AND blackbaud_opportunity_id = ${opportunityId} AND blackbaud_gift_id = ${giftId}
      `;
    } else {
      await sql`
        INSERT INTO prospect_opportunity_gift_links
          (blackbaud_opportunity_id, blackbaud_constituent_id, workspace_user_id, blackbaud_gift_id,
           gift_date, gift_amount, gift_type, gift_fund, applied_amount, nxt_sync_state, nxt_sync_error, created_by)
        VALUES (${opportunityId}, ${constituentId}, ${context.userId}, ${giftId}, ${values.date},
          ${amount}, ${values.type}, ${values.fund}, ${amount}, 'manual_required', ${message}, ${context.authUserId})
        ON CONFLICT (workspace_user_id, blackbaud_opportunity_id, blackbaud_gift_id)
          WHERE prospect_opportunity_id IS NULL
        DO UPDATE SET gift_date = EXCLUDED.gift_date, gift_amount = EXCLUDED.gift_amount,
          gift_type = EXCLUDED.gift_type, gift_fund = EXCLUDED.gift_fund,
          applied_amount = EXCLUDED.applied_amount, updated_at = NOW()
      `;
    }
    return response({ nxtSync: { state: "manual_required", message } });
  } catch {
    return response({ error: "Could not save the gift link. Please retry; existing links are retained." }, 502);
  }
}
