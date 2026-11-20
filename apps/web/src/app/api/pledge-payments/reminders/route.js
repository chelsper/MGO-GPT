import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { pledgeScope, readPledgeCache } from "@/app/api/utils/pledgePaymentStore";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { OPEN_PLEDGE_QUERY_ID, pledgeWorklist } from "@/utils/pledgePayments";
import { PLEDGE_REMINDER_LIMIT, REMINDER_FIELDS, pledgeReminderIssue, pledgeReminderRecipient } from "@/utils/pledgeReminders";
import { calendarDate } from "@/utils/prospectActivity";
import { pledgeReminderEmailRecipient, reminderEmailText, reminderPdfFilename } from "@/utils/pledgeReminderHandoff";
import { renderPledgeReminderPdf } from "@/app/api/utils/pledgeReminderPdf";
import { createReminderLogStore } from "@/app/api/utils/pledgeReminderLogStore";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message, status = 409) => Object.assign(new Error(message), { publicStatus: status });
function selectedRows(cache, body, today) {
  if (cache.requiresQueryRefresh || String(cache.source?.queryId) !== OPEN_PLEDGE_QUERY_ID || cache.job?.id !== body.jobId ||
    !cache.job?.discoveryComplete || !["completed", "completed_with_errors"].includes(cache.job.status) || body.today !== today)
    throw fail("The saved worklist changed or is still refreshing. Reload it before preparing reminders.");
  const rows = pledgeWorklist(cache.records, today)[body.view];
  return body.pledges.map(ref => {
    const matches = rows.filter(row => row.id === ref.id);
    if (matches.length !== 1 || matches[0].refreshedAt !== ref.refreshedAt) throw fail("A selected pledge changed or is no longer due in this view. Reload the worklist.");
    const issue = pledgeReminderIssue(matches[0]);
    if (issue) throw fail(issue);
    return matches[0];
  });
}
export async function POST(request) {
  try {
    const origin = new URL(request.url).origin;
    if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json")) throw fail("Open pledge reminders in the app before continuing.", 403);
    const session = await auth();
    if (!session?.user?.email) throw fail("Please sign in.", 401);
    await ensureAppSchema();
    const { sessionUser: user } = await getWorkspaceUser(session, request);
    if (!user || user.active !== true || !isReviewerRole(user.role)) throw fail("Pledge reminders are restricted to Advancement Services and admins.", 403);
    const raw = await request.text();
    if (raw.length > 40000) throw fail("Select fewer pledges.", 413);
    let body; try { body = JSON.parse(raw); } catch { throw fail("Invalid reminder request.", 400); }
    if (!body || !["prepare", "check", "pdf"].includes(body.operation) || !["pastDue", "upcoming"].includes(body.view) ||
      typeof body.jobId !== "string" || !Array.isArray(body.pledges) || !body.pledges.length || body.pledges.length > PLEDGE_REMINDER_LIMIT ||
      (body.operation !== "check" && body.pledges.length !== 1) || new Set(body.pledges.map(ref => ref?.id)).size !== body.pledges.length ||
      body.pledges.some(ref => !ref || typeof ref.id !== "string" || !/^[1-9]\d{0,18}$/.test(ref.id) || typeof ref.refreshedAt !== "string" || ref.refreshedAt.length > 40))
      throw fail("Choose saved pledges from this worklist.", 400);
    if (body.operation === "pdf" && (body.confirm !== true || calendarDate(body.letterDate) !== body.letterDate ||
      !body.fields || typeof body.fields !== "object" || Array.isArray(body.fields) ||
      REMINDER_FIELDS.some(key => typeof body.fields[key] !== "string" || body.fields[key].length > 500)))
      throw fail("Review the recipient, letter date and saved pledge amounts before preparing the PDF.", 400);
    const today = getStandingsPeriods().asOf;
    const scope = pledgeScope(user.id, origin);
    const rows = selectedRows(await readPledgeCache(scope), body, today);
    if (body.operation === "check") return Response.json({ verified: true }, { headers });
    const row = rows[0];
    const profile = await blackbaudApiFetch(`/constituent/v1/constituents/${row.constituentId}`, {
      userId: user.id, authUserId: user.id, origin, method: "GET", timeoutMs: 15000, maxRetries: 0,
    });
    const recipient = pledgeReminderRecipient(profile, row.constituentId, today);
    if (body.operation === "pdf") {
      const fields = Object.fromEntries(REMINDER_FIELDS.map(key => [key, body.fields[key].trim()]));
      const draft = { pledge: row, ...recipient, fields };
      const pdf = await renderPledgeReminderPdf(draft, { letterDate: body.letterDate, today, view: body.view });
      selectedRows(await readPledgeCache(scope), body, today);
      const email = pledgeReminderEmailRecipient(profile, row.constituentId);
      const filename = reminderPdfFilename(row, body.letterDate);
      let recording = null;
      if (!email.reason) {
        try { recording = await createReminderLogStore().prepare({ ownerId: user.id, origin, draft, email: email.address,
          letterDate: body.letterDate, today, view: body.view, filename }); } catch { /* PDF/email preparation still works if local tracking is unavailable. */ }
      }
      return Response.json({ handoff: {
        pledgeId: row.id, refreshedAt: row.refreshedAt, letterDate: body.letterDate, checkedAt: new Date().toISOString(),
        filename, pdf: pdf.toString("base64"), recording,
        email, ...reminderEmailText(fields.Addressee),
      } }, { headers });
    }
    selectedRows(await readPledgeCache(scope), body, today);
    return Response.json({ draft: { pledge: row, ...recipient, checkedAt: new Date().toISOString() } }, { headers });
  } catch (error) {
    return Response.json({ error: error.publicStatus ? error.message : "Mailing details could not be verified. Saved pledges are unchanged. Check your NXT connection, then continue preparation." },
      { status: error.publicStatus || 503, headers });
  }
}
