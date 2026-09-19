import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  getReportAccessForUser,
  PORTFOLIO_GIVING_REPORT_KEY,
} from "@/app/api/utils/reportAccess";
import { getCurrentFiscalYearWindow } from "@/app/api/utils/currentFyGiving";
import { getReportCacheHeaders } from "@/app/api/utils/reportCache";
import {
  portfolioReportKeys,
  readPortfolioReport,
  publicPortfolioReport,
  claimPortfolioReport,
  checkpointPortfolioReport,
} from "@/app/api/utils/portfolioGivingReportStore";

export const maxDuration = 300;
const reply = (payload, status = 200) =>
  Response.json(payload, { status, headers: getReportCacheHeaders("saved") });

async function context(request) {
  const session = await auth(request);
  if (!session?.user?.email)
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  await ensureAppSchema();
  const { workspaceUser, sessionUser, invalidActingUserId } =
    await getWorkspaceUser(session, request);
  if (
    !workspaceUser ||
    !sessionUser ||
    workspaceUser.active === false ||
    sessionUser.active === false ||
    invalidActingUserId
  )
    throw Object.assign(new Error("This workspace is not available."), {
      status: 403,
    });
  const access = await getReportAccessForUser(
    PORTFOLIO_GIVING_REPORT_KEY,
    sessionUser,
  );
  if (!access.canView)
    throw Object.assign(new Error("This report is not shared with you."), {
      status: 403,
    });
  const period = getCurrentFiscalYearWindow();
  return {
    workspaceUser,
    sessionUser,
    period,
    keys: portfolioReportKeys(
      workspaceUser,
      new URL(request.url).origin,
      period,
    ),
  };
}

function failure(error) {
  return reply(
    {
      error: error.status
        ? error.message
        : "Could not load the saved report. Please try again.",
    },
    error.status || 500,
  );
}

// Deliberately no NXT imports/calls on the read path, even for refresh=1.
export async function GET(request) {
  try {
    const { keys, period } = await context(request);
    return reply(
      publicPortfolioReport(await readPortfolioReport(keys), period),
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== url.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return reply({ error: "Refresh must be requested from this app." }, 403);
    const body = await request.json().catch(() => null);
    if (!body || !["start", "continue"].includes(body.action))
      return reply({ error: "Invalid refresh command." }, 400);
    const { workspaceUser, sessionUser, keys, period } = await context(request);
    let saved = await readPortfolioReport(keys);
    if (
      saved.job?.leaseUntil > Date.now() ||
      new Date(saved.job?.retryAt || 0).getTime() > Date.now()
    )
      return reply(publicPortfolioReport(saved, period));
    if (
      body.action === "continue" &&
      (!saved.job ||
        body.jobId !== saved.job.id ||
        saved.job.status === "complete")
    )
      return reply(publicPortfolioReport(saved, period));
    const {
      newPortfolioReportJob,
      advancePortfolioReportJob,
      pausePortfolioReportJob,
    } = await import("@/app/api/utils/portfolioGivingReportRefresh");
    if (
      !workspaceUser.blackbaud_constituent_id &&
      !workspaceUser.blackbaud_lookup_id
    )
      return reply(
        {
          error:
            "Connect this fundraiser's NXT identity in Setup before refreshing their report.",
        },
        409,
      );
    const next =
      !saved.job ||
      saved.job.status === "complete" ||
      saved.job.period?.endDate !== period.endDate
        ? newPortfolioReportJob(period)
        : saved.job;
    const claimed = await claimPortfolioReport(keys, saved.job, next);
    if (!claimed)
      return reply(
        publicPortfolioReport(await readPortfolioReport(keys), period),
      );
    const working = structuredClone(claimed);
    try {
      const result = await advancePortfolioReportJob({
        job: working,
        request,
        workspaceUser,
        authUserId: sessionUser.id,
      });
      // Recheck permission, acting workspace, fiscal date, and fundraiser mapping
      // after external reads, before either checkpointing or publishing.
      const current = await context(request);
      if (
        current.keys.snapshot !== keys.snapshot ||
        current.period.endDate !== period.endDate
      )
        throw new Error(
          "Workspace or report date changed. Reload the report and start a fresh refresh.",
        );
      await checkpointPortfolioReport(
        keys,
        claimed,
        result.job,
        result.snapshot,
      );
    } catch (error) {
      await checkpointPortfolioReport(
        keys,
        claimed,
        pausePortfolioReportJob(working, error),
      );
      if (error.status === 401 || error.status === 403) throw error;
    }
    saved = await readPortfolioReport(keys);
    return reply(publicPortfolioReport(saved, period));
  } catch (error) {
    return failure(error);
  }
}
