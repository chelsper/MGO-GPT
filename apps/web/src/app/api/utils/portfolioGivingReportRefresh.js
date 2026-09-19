import { randomUUID } from "node:crypto";
import { GET as getPortfolio } from "@/app/api/blackbaud/portfolio/route";
import { GET as getGiving } from "@/app/api/blackbaud/current-fy-giving/route";
import { GET as getProfile } from "@/app/api/blackbaud/constituents/[constituentId]/summary/route";
import { getClosedFiscalYearSummary } from "@/app/api/utils/closedFyGiftTotals";
import { getReportGiftOpportunities } from "@/app/api/utils/reportGiftOpportunities";
import {
  buildPortfolioGivingReport,
  getPortfolioPeople,
  getReportProfileIds,
} from "./portfolioGivingReportData";

export function newPortfolioReportJob(period) {
  return {
    id: randomUUID(),
    status: "pending",
    stage: "portfolio",
    period,
    startedAt: new Date().toISOString(),
    givingOffset: 0,
    profileOffset: 0,
    people: [],
    byConstituentId: {},
    credits: {},
    profiles: {},
    profileIds: [],
    warnings: [],
    opportunities: {},
    opportunityOffset: 0,
  };
}

async function readResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw Object.assign(
      new Error(
        "NXT could not verify this refresh batch. No replacement report was published.",
      ),
      {
        retryAfterMs:
          payload?.retryAfterMs ||
          Number(response.headers.get("Retry-After")) * 1000,
        providerStatus: payload?.providerStatus || response.status,
        quotaPaused: payload?.quotaPaused,
      },
    );
  }
  return payload;
}

export function pausePortfolioReportJob(job, error) {
  const throttled =
    error.quotaPaused ||
    Number(error.providerStatus || error.httpStatus) === 429;
  return {
    ...job,
    status: "paused",
    message: throttled
      ? "Blackbaud has paused requests. Your saved report is unchanged. Resume after the retry time."
      : error.message ||
        "The refresh could not finish. Your saved report is unchanged. Resume to retry this batch.",
    retryAt: new Date(
      Date.now() +
        Math.max(Number(error.retryAfterMs) || 0, throttled ? 60_000 : 5_000),
    ).toISOString(),
  };
}

// One bounded phase per request. Checkpoints contain server-verified inputs;
// no browser-supplied totals or partial reports are accepted for publication.
export async function advancePortfolioReportJob({
  job,
  request,
  workspaceUser,
  authUserId,
}) {
  const origin = new URL(request.url).origin;
  const nestedRequest = (path, parameters = {}) => {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(parameters))
      url.searchParams.set(key, String(value));
    return new Request(url, { headers: request.headers });
  };
  job.status = "pending";
  job.message = "";
  job.retryAt = null;
  if (job.stage === "portfolio") {
    const payload = await readResponse(
      await getPortfolio(nestedRequest("/api/blackbaud/portfolio")),
    );
    if (payload.portfolioMeta?.assignmentDataStatus !== "live")
      throw new Error(
        "A verified NXT assignment list is needed. Sync this fundraiser's portfolio, then resume the report refresh.",
      );
    job.people = getPortfolioPeople(payload).map(
      ({ constituentId, name, assignmentTypes }) => ({
        constituentId,
        name,
        assignmentTypes,
      }),
    );
    if (job.people.length > 2_000)
      throw new Error(
        "This portfolio exceeds the supported report refresh size.",
      );
    job.assignmentsCheckedAt =
      payload.portfolioMeta?.cachedAt || new Date().toISOString();
    job.stage = job.people.length ? "giving" : "totals";
  } else if (job.stage === "giving") {
    const ids = job.people
      .slice(job.givingOffset, job.givingOffset + 5)
      .map((person) => String(person.constituentId));
    const payload = await readResponse(
      await getGiving(
        nestedRequest("/api/blackbaud/current-fy-giving", {
          constituentIds: ids.join(","),
          report: "portfolio-fy-giving",
          portfolio_refresh: "1",
        }),
      ),
    );
    if (
      payload.period?.startDate !== job.period.startDate ||
      payload.period?.endDate !== job.period.endDate
    )
      throw new Error(
        "The report date changed during refresh. Start a fresh report for today's date.",
      );
    if (
      Object.entries(payload.warnings || {}).some(
        ([key, value]) => key !== "funds" && value,
      )
    )
      throw new Error(
        "Some fiscal-year gift records could not be verified. Resume to retry; saved figures have not changed.",
      );
    if (payload.warnings?.funds) job.warnings = [payload.warnings.funds];
    for (const id of ids) {
      if (!Array.isArray(payload.byConstituentId?.[id]?.directGifts))
        throw new Error(
          "A constituent's giving response was incomplete. The saved report is unchanged.",
        );
      job.byConstituentId[id] = {
        directGifts: payload.byConstituentId[id].directGifts,
      };
    }
    if (!Array.isArray(payload.acknowledgmentCredits))
      throw new Error(
        "The soft-credit response was incomplete. The saved report is unchanged.",
      );
    for (const credit of payload.acknowledgmentCredits) {
      if (
        !credit.giftId ||
        !credit.hardCreditConstituentId ||
        !credit.recipientConstituentId
      )
        throw new Error(
          "A soft-credit gift could not be identified. The saved report is unchanged.",
        );
      job.credits[
        JSON.stringify([
          credit.giftId,
          credit.hardCreditConstituentId,
          credit.recipientConstituentId,
        ])
      ] = credit;
    }
    job.givingOffset += ids.length;
    if (job.givingOffset >= job.people.length) {
      job.profileIds = getReportProfileIds(
        {
          byConstituentId: job.byConstituentId,
          acknowledgmentCredits: Object.values(job.credits),
        },
        workspaceUser,
      );
      job.stage = job.profileIds.length ? "profiles" : "totals";
    }
  } else if (job.stage === "profiles") {
    const ids = job.profileIds.slice(job.profileOffset, job.profileOffset + 4);
    for (const id of ids) {
      const payload = await readResponse(
        await getProfile(
          nestedRequest(
            `/api/blackbaud/constituents/${encodeURIComponent(id)}/summary`,
            { report_profile: "true", refresh: "1" },
          ),
          { params: { constituentId: id } },
        ),
      );
      const profile = payload.mapped?.constituent;
      if (
        String(payload.constituentId || "") !== id ||
        !profile?.name ||
        profile.constituencyCodesVerified !== true
      )
        throw new Error(
          "A donor's name or constituency codes could not be verified. Resume to retry; the saved report is unchanged.",
        );
      job.profiles[id] = {
        name: profile.name,
        constituencies: profile.constituencies,
        constituencyCodesVerified: true,
      };
      job.profileOffset += 1;
    }
    if (job.profileOffset >= job.profileIds.length) job.stage = "opportunities";
  } else if (job.stage === "opportunities") {
    const ids = job.profileIds.slice(
      job.opportunityOffset,
      job.opportunityOffset + 25,
    );
    Object.assign(
      job.opportunities,
      await getReportGiftOpportunities(ids, {
        userId: workspaceUser.id,
        authUserId,
        origin,
      }),
    );
    job.opportunityOffset += ids.length;
    if (job.opportunityOffset >= job.profileIds.length) job.stage = "totals";
  } else if (job.stage === "totals") {
    // Preserve the existing full-FY, explicit-fundraiser commitment definition.
    // This is the only phase that reads the shared closed-gift calculation.
    job.closedGiftSummary = await getClosedFiscalYearSummary({
      workspaceUser,
      authUserId,
      origin,
      requireComplete: true,
    });
    if (job.closedGiftSummary?.currentFY !== job.period.yearLabel)
      throw new Error(
        "The fiscal year changed during refresh. Start a fresh report.",
      );
    job.stage = "publish";
  } else if (job.stage !== "publish") {
    throw new Error("Unknown report checkpoint. Start a new refresh.");
  }
  if (job.stage !== "publish") return { job, snapshot: null };
  const snapshot = {
    ...buildPortfolioGivingReport({
      people: job.people,
      givingPayload: {
        period: job.period,
        byConstituentId: job.byConstituentId,
        acknowledgmentCredits: Object.values(job.credits),
      },
      profilesById: job.profiles,
      workspaceUser,
      closedGiftSummary: job.closedGiftSummary,
    }),
    generatedAt: new Date().toISOString(),
    assignmentsCheckedAt: job.assignmentsCheckedAt,
    workspaceUserId: workspaceUser.id,
    warnings: job.warnings,
    opportunities: job.opportunities,
  };
  return {
    snapshot,
    job: {
      ...job,
      status: "complete",
      stage: "complete",
      byConstituentId: {},
      credits: {},
      profiles: {},
      opportunities: {},
      closedGiftSummary: null,
    },
  };
}
