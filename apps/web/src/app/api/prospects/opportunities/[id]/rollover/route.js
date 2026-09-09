import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { buildBlackbaudOpportunityPayload, getBlackbaudOpportunity, updateBlackbaudOpportunity } from "@/app/api/utils/blackbaud";
import { calendarDate, canRollOpportunityForward } from "@/utils/prospectActivity";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const conflict = (error) => Response.json({ error }, { status: 409 });

export async function POST(request, { params }) {
  let nxtWriteAttempted = false;
  let stage = "authorization";
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { workspaceUser: user, isActing } = await getWorkspaceUser(session, request);
    if (!user || isActing) return Response.json({ error: "Switch to your own workspace to update an opportunity." }, { status: 403 });
    const body = await request.json().catch(() => null);
    const { fiscalYear } = getStandingsPeriods();
    const originalDate = calendarDate(body?.expectedDate);
    if (body?.confirmed !== true || !originalDate || body?.fiscalYear !== fiscalYear.label) {
      return Response.json({ error: "Confirm the expected date and current fiscal year before updating." }, { status: 400 });
    }
    await ensureAppSchema();
    stage = "local_read";
    const [existing] = await sql`
      SELECT po.*, po.updated_at::text AS revision,
        COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS blackbaud_constituent_id
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE po.id = ${params.id} AND p.user_id = ${user.id}
      LIMIT 1
    `;
    if (!existing) return Response.json({ error: "Opportunity not found" }, { status: 404 });
    if (!existing.blackbaud_opportunity_id || !existing.blackbaud_constituent_id) return conflict("Link this opportunity to NXT before using the fiscal-year update.");
    const targetDate = fiscalYear.endsOn;
    const localDate = calendarDate(existing.expected_date);
    if (![originalDate, targetDate].includes(localDate) || !canRollOpportunityForward({ ...existing, expected_date: originalDate })) {
      return conflict("This opportunity has changed or is no longer eligible. Reload it before continuing.");
    }
    const context = {
      userId: user.id, authUserId: user.id, origin: new URL(request.url).origin,
      opportunityId: existing.blackbaud_opportunity_id,
    };
    stage = "nxt_read";
    const live = await getBlackbaudOpportunity(context);
    if (String(live?.id) !== String(existing.blackbaud_opportunity_id) ||
      String(live?.constituent_id) !== String(existing.blackbaud_constituent_id) ||
      !canRollOpportunityForward({ status: live?.status, expected_date: originalDate })) {
      return conflict("The NXT opportunity is no longer eligible or does not match this constituent. No dates were changed.");
    }
    const liveDate = calendarDate(live.expected_date);
    if (![originalDate, targetDate].includes(liveDate)) return conflict("The expected date changed in NXT. Reload and review it before continuing.");
    // Retry after a partial success reconciles the local date without a second NXT write.
    if (liveDate !== targetDate) {
      if (localDate === targetDate) return conflict("NXT and the app have different dates. Reload and review the opportunity.");
      stage = "nxt_write";
      nxtWriteAttempted = true;
      await updateBlackbaudOpportunity({ ...context, payload: buildBlackbaudOpportunityPayload({ expectedDate: targetDate }) });
    }
    stage = "nxt_verify";
    const verified = liveDate === targetDate ? live : await getBlackbaudOpportunity(context);
    if (calendarDate(verified?.expected_date) !== targetDate ||
      String(verified?.id) !== String(existing.blackbaud_opportunity_id) ||
      String(verified?.constituent_id) !== String(existing.blackbaud_constituent_id) ||
      !canRollOpportunityForward({ status: verified?.status, expected_date: originalDate })) {
      return conflict("NXT could not confirm the expected-date update. The local date was retained. Reload and review before retrying.");
    }
    stage = "local_save";
    const [updated] = await sql`
      UPDATE prospect_opportunities SET expected_date = ${targetDate}::date, updated_at = NOW()
      WHERE id = ${existing.id} AND prospect_id = ${existing.prospect_id}
        AND updated_at::text IS NOT DISTINCT FROM ${existing.revision}
        AND expected_date IS NOT DISTINCT FROM ${existing.expected_date}::date
      RETURNING *
    `;
    if (!updated) return conflict("NXT has the new expected date, but the local opportunity changed during the update. Reload and retry to reconcile it; other fields were not overwritten.");
    return Response.json({ opportunity: updated, fiscalYear: fiscalYear.label, expectedDate: targetDate, blackbaudSync: { status: "synced" } });
  } catch (error) {
    console.error("Opportunity fiscal-year update failed", { stage, httpStatus: Number(error?.httpStatus || error?.status) || null });
    return Response.json({ error: nxtWriteAttempted || stage === "local_save"
      ? "NXT may have the new expected date, but the app could not confirm both saves. Reload and retry to reconcile safely. Other opportunity fields were not changed."
      : "Could not verify the opportunity with NXT. No local date was changed. Try again when the connection is available." }, { status: 502 });
  }
}
