import { randomUUID } from "node:crypto";
import { finishPledge, normalizeApplications, normalizeInstallments, normalizePaymentGift, normalizePledge, pledgeDataError, OPEN_PLEDGE_QUERY_ID } from "@/utils/pledgePayments";
import { advancePledgeDiscovery, isPledgeQueryJob } from "./pledgeQuerySource";

export const pendingPledgeJob = (job) => ["discovering", "running", "paused"].includes(job?.status);
export function newPledgeJob() {
  return { id: randomUUID(), status: "discovering", discoveryComplete: false, source: "saved_query",
    queryId: OPEN_PLEDGE_QUERY_ID, queryStage: "metadata", startedAt: new Date().toISOString(), completedAt: null, error: null, resumeAfter: null };
}

export function safePledgeFailure(error, stage) {
  const status = Number(error?.httpStatus) || (error?.name === "BlackbaudQuotaExceededError" ? 403 : null);
  return { stage, httpStatus: status, code: error?.pledgeCode || (error?.name === "BlackbaudQueryResultTooLargeError" ? "query_result_too_large" : status ? "blackbaud_request_failed" : "request_failed"),
    retryAfterMs: Math.max(0, Number(error?.retryAfterMs) || 0) };
}

// One step is at most one SKY request. Payment-heavy pledges checkpoint each
// linked gift as well, so even a single long pledge does not need a long request.
export async function advancePledge(item, read, now = new Date()) {
  const draft = structuredClone(item.draft || {});
  const v1 = "https://api.sky.blackbaud.com/gift/v1/gifts";
  const v2 = "https://api.sky.blackbaud.com/gft-gifts/v2/gifts";
  let stage = item.stage;
  if (stage === "gift") {
    draft.gift = normalizePledge(await read(`${v1}/${item.pledgeId}`), item.pledgeId);
    if (draft.gift.balanceCents === 0) return { ...item, status: "success", draft: {}, payload: null, error: null };
    stage = "installments";
  } else if (stage === "installments") {
    draft.installments = normalizeInstallments(await read(`${v2}/${item.pledgeId}/installments`), draft.gift);
    stage = "payments";
  } else if (stage === "payments") {
    draft.applications = normalizeApplications(await read(`${v2}/${item.pledgeId}/pledgepayments`), item.pledgeId, draft.installments);
    draft.paymentGifts = {};
    stage = "payment_details";
  } else if (stage === "payment_details") {
    const giftId = draft.applications.find((entry) => !draft.paymentGifts[entry.giftId])?.giftId;
    if (giftId) draft.paymentGifts[giftId] = normalizePaymentGift(await read(`${v1}/${giftId}`), giftId);
    if (draft.applications.every((entry) => draft.paymentGifts[entry.giftId])) stage = "identity";
  } else if (stage === "identity") {
    const person = await read(`https://api.sky.blackbaud.com/constituent/v1/constituents/${draft.gift.constituentId}`);
    if (String(person?.id) !== draft.gift.constituentId) throw pledgeDataError("missing_identity");
    draft.name = typeof person.name === "string" ? person.name : [person.first, person.middle, person.last].filter((s) => typeof s === "string").join(" ");
    return { ...item, status: "success", payload: finishPledge(draft, now), draft: {}, error: null };
  } else throw pledgeDataError("invalid_checkpoint");
  return { ...item, stage, draft, error: null };
}

export async function runPledgeBatch({ job, store, read, query, maxSteps = 6, now = () => Date.now() }) {
  const started = now();
  if (!pendingPledgeJob(job) || (job.resumeAfter && Date.parse(job.resumeAfter) > now())) return job;
  if (!isPledgeQueryJob(job)) return pauseJob(pledgeDataError("legacy_source_requires_refresh"), "query_source", job, store, now);
  if (job.nextPollAt && Date.parse(job.nextPollAt) > now()) return job;
  job = { ...job, status: job.discoveryComplete ? "running" : "discovering", error: null, resumeAfter: null };
  await store.saveJob(job);
  if (!job.discoveryComplete) {
    try { job = await advancePledgeDiscovery(job, store, query, now); }
    catch (error) { return pauseJob(error, `query_${job.queryStage}`, job, store, now); }
    await store.saveJob(job);
    return job;
  }
  for (let step = 0; step < maxSteps && now() - started < 45000; step++) {
    const item = await store.nextItem(job.id);
    if (!item) {
      const counts = await store.counts(job.id);
      job = { ...job, status: counts.failed ? "completed_with_errors" : "completed", completedAt: new Date(now()).toISOString() };
      await store.saveJob(job);
      break;
    }
    let updated;
    try { updated = await advancePledge(item, read, new Date(now())); }
    catch (error) {
      const safe = safePledgeFailure(error, item.stage);
      if (safe.httpStatus === 429 || safe.httpStatus === 401 || (safe.httpStatus === 403 && safe.retryAfterMs)) return pauseJob(error, item.stage, job, store, now);
      updated = { ...item, status: "failed", error: safe };
    }
    // DB failure aborts without changing the saved checkpoint or last good data.
    await store.saveItem(updated);
  }
  return job;
}

async function pauseJob(error, stage, job, store, now) {
  const safe = safePledgeFailure(error, stage);
  const throttled = safe.httpStatus === 429 || (safe.httpStatus === 403 && safe.retryAfterMs > 0);
  const paused = { ...job, status: "paused", error: safe,
    resumeAfter: throttled ? new Date(now() + Math.max(1000, safe.retryAfterMs || 60000)).toISOString() : null };
  await store.saveJob(paused);
  return paused;
}
