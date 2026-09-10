import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { acquirePledgeStore, pledgeScope, readPledgeCache } from "@/app/api/utils/pledgePaymentStore";
import { newPledgeJob, pendingPledgeJob, runPledgeBatch } from "@/app/api/utils/pledgePaymentPipeline";
import { isPledgeQueryJob, pledgeQueryTransport } from "@/app/api/utils/pledgeQuerySource";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message, status) => Object.assign(new Error(message), { publicStatus: status });
async function contextFor(request) {
  const session = await auth();
  if (!session?.user?.email) throw fail("Please sign in.", 401);
  await ensureAppSchema();
  const { sessionUser } = await getWorkspaceUser(session, request);
  if (!sessionUser || sessionUser.active === false || !isReviewerRole(sessionUser.role)) throw fail("This worklist is restricted to Advancement Services and admins.", 403);
  const origin = new URL(request.url).origin;
  return { userId: sessionUser.id, authUserId: sessionUser.id, origin, scope: pledgeScope(sessionUser.id, origin) };
}
const responseFor = async (scope) => Response.json({ ...await readPledgeCache(scope), today: getStandingsPeriods().asOf }, { headers });
const failure = (error) => Response.json({ error: error.publicStatus ? error.message : "Could not load pledge payments. Saved progress is preserved; try Resume." }, { status: error.publicStatus || 500, headers });

export async function GET(request) {
  try { const context = await contextFor(request); return await responseFor(context.scope); }
  catch (error) { return failure(error); }
}

export async function POST(request) {
  let store;
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw fail("Invalid request origin.", 403);
    const context = await contextFor(request);
    let body;
    try { body = await request.json(); } catch { throw fail("Invalid refresh request.", 400); }
    const { action } = body || {};
    if (!["start", "resume", "retry_failed", "cancel"].includes(action)) throw fail("Choose a valid refresh action.", 400);
    store = await acquirePledgeStore(context.scope, context.userId);
    if (!store) throw fail("Another batch is running. Wait a moment, then resume.", 409);
    let job = store.job;
    if (action === "start") {
      if (pendingPledgeJob(job) && isPledgeQueryJob(job)) throw fail("A refresh is already saved. Resume or cancel it first.", 409);
      job = newPledgeJob();
      await store.saveJob(job);
    } else {
      if (!job || body.jobId !== job.id) throw fail("This refresh has changed. Reload the page.", 409);
      if (action === "cancel") {
        await store.saveJob({ ...job, status: "cancelled", resumeAfter: null });
        return await responseFor(context.scope);
      }
      if (!isPledgeQueryJob(job)) throw fail("This saved refresh used the old all-pledges source. Select Use query 12033 to start the query-scoped worklist. Cached results are preserved.", 409);
      if (action === "retry_failed") {
        if (!job.discoveryComplete) throw fail("Finish finding pledges before retrying failed items.", 409);
        await store.retryFailed(job.id);
        job = { ...job, status: "running", completedAt: null, error: null };
      }
    }
    await runPledgeBatch({ job, store, query: pledgeQueryTransport(context), read: (url) => blackbaudApiFetch(url, {
      userId: context.userId, authUserId: context.authUserId, origin: context.origin,
      timeoutMs: 12000, maxRetries: 1,
    }) });
    return await responseFor(context.scope);
  } catch (error) { return failure(error); }
  finally { if (store) await store.release().catch(() => {}); }
}
