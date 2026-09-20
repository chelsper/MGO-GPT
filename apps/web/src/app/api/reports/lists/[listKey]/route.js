import {
  listContext,
  listFailure,
  listResponse,
  requireListSameOrigin,
} from "@/app/api/utils/constituentListContext";
import {
  listSnapshotKeys,
  listRefreshStatus,
} from "@/app/api/utils/constituentListRefresh";
import { listQueryRecovery } from "@/app/api/utils/listQueryRecovery";
// These snapshot/lease primitives are data-independent and preserve last-good publication.
import {
  readPortfolioReport as readSaved,
  claimPortfolioReport as claim,
  checkpointPortfolioReport as checkpoint,
} from "@/app/api/utils/portfolioGivingReportStore";
export const maxDuration = 300;

export async function GET(request, { params }) {
  try {
    const { report, origin } = await listContext(request, params.listKey);
    return listResponse({
      report,
      ...listRefreshStatus(await readSaved(listSnapshotKeys(report, origin))),
    });
  } catch (error) {
    return listFailure(error);
  }
}

export async function POST(request, { params }) {
  try {
    requireListSameOrigin(request);
    const body = await request.json().catch(() => null);
    if (
      !body ||
      !["start", "continue", "restart"].includes(body.action) ||
      Object.keys(body).some((key) => !["action", "jobId"].includes(key))
    )
      return listResponse({ error: "Invalid refresh command." }, 400);
    const { user, report, origin } = await listContext(request, params.listKey);
    const keys = listSnapshotKeys(report, origin);
    const saved = await readSaved(keys);
    const recovery = listQueryRecovery(saved.job);
    const present = async () =>
      listResponse({ report, ...listRefreshStatus(await readSaved(keys)) });
    if (
      (saved.job?.status === "needs_configuration" &&
        !(
          body.action === "restart" &&
          report.dataConfiguration.source === "saved_query"
        )) ||
      saved.job?.leaseUntil > Date.now() ||
      new Date(recovery.retryAt || 0).getTime() > Date.now()
    )
      return present();
    if (
      body.action === "continue" &&
      (!saved.job ||
        saved.job.id !== body.jobId ||
        saved.job.status === "complete" ||
        recovery.restartRequired)
    )
      return present();
    const { newListRefresh, advanceListRefresh } =
      await import("@/app/api/utils/constituentListRefresh");
    const next =
      body.action === "restart" ||
      !saved.job ||
      saved.job.status === "complete" ||
      (body.action === "start" && recovery.restartRequired)
        ? newListRefresh()
        : saved.job;
    const claimed = await claim(keys, saved.job, next);
    if (!claimed) return present();
    const working = structuredClone(claimed);
    try {
      const result = await advanceListRefresh({
        job: working,
        user,
        origin,
        source: report.dataConfiguration,
      });
      const current = await listContext(request, params.listKey);
      if (current.report.revision !== report.revision)
        return listResponse(
          { error: "List settings changed. Reload before refreshing." },
          409,
        );
      await checkpoint(keys, claimed, result.job, result.snapshot);
    } catch (error) {
      await checkpoint(keys, claimed, {
        ...working,
        status: error.restartRequired === true ? "needs_restart" : "paused",
        failureCode: error.restartRequired === true ? error.code : null,
        message:
          error.status && ![401, 403].includes(error.status)
            ? error.message
            : "NXT could not complete this phase. The previous list is retained. Resume after checking connection or quota status.",
        retryAt:
          error.restartRequired === true
            ? null
            : new Date(
                Date.now() + Math.max(60000, Number(error.retryAfterMs) || 0),
              ).toISOString(),
      });
      if ([401, 403].includes(error.status)) throw error;
    }
    // Access can change during a long provider read or error checkpoint.
    await listContext(request, params.listKey);
    return present();
  } catch (error) {
    return listFailure(error);
  }
}
