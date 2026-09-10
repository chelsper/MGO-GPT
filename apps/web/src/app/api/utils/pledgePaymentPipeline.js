import { randomUUID } from "node:crypto";
import { finishPledge, normalizeApplications, normalizeInstallments, normalizePaymentGift, normalizePledge, pledgeDataError, pledgeId } from "@/utils/pledgePayments";

export const PLEDGE_LIST_URL = "https://api.sky.blackbaud.com/gift/v1/gifts?gift_type=Pledge&limit=200";
export const pendingPledgeJob = (job) => ["discovering", "running", "paused"].includes(job?.status);
export function newPledgeJob() {
  return { id: randomUUID(), status: "discovering", discoveryComplete: false, nextUrl: PLEDGE_LIST_URL,
    seenPages: [], startedAt: new Date().toISOString(), completedAt: null, error: null, resumeAfter: null };
}
export function validatePledgePage(response, currentUrl, seenPages) {
  if (!Array.isArray(response?.value)) throw pledgeDataError();
  if (response.count != null && (!Number.isSafeInteger(response.count) || response.count < 0)) throw pledgeDataError("invalid_pagination");
  const ids = response.value.map((gift) => pledgeId(gift?.id));
  const settledIds = response.value.filter((gift) => gift.type === "Pledge" && gift.balance?.value === 0 &&
    typeof gift.amount?.value === "number" && Number.isFinite(gift.amount.value) && gift.amount.value >= 0).map((gift) => String(gift.id));
  let nextUrl = null;
  if (response.next_link) {
    const url = new URL(response.next_link, "https://api.sky.blackbaud.com");
    if (url.origin !== "https://api.sky.blackbaud.com" || url.pathname !== "/gift/v1/gifts" || url.username || url.password || url.hash) throw pledgeDataError("invalid_pagination");
    if (url.searchParams.get("gift_type") !== "Pledge") throw pledgeDataError("invalid_pagination");
    nextUrl = url.href;
    if (nextUrl === currentUrl || seenPages.includes(nextUrl) || ids.length === 0) throw pledgeDataError("repeated_page");
  }
  return { ids: [...new Set(ids)], settledIds, nextUrl, expectedCount: response.count ?? 0 };
}

export function safePledgeFailure(error, stage) {
  const status = Number(error?.httpStatus) || (error?.name === "BlackbaudQuotaExceededError" ? 403 : null);
  return { stage, httpStatus: status, code: error?.pledgeCode || (status ? "blackbaud_request_failed" : "request_failed"),
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

export async function runPledgeBatch({ job, store, read, maxSteps = 6, now = () => Date.now() }) {
  const started = now();
  if (!pendingPledgeJob(job) || (job.resumeAfter && Date.parse(job.resumeAfter) > now())) return job;
  job = { ...job, status: job.discoveryComplete ? "running" : "discovering", error: null, resumeAfter: null };
  await store.saveJob(job);
  if (!job.discoveryComplete) {
    let page;
    try { page = validatePledgePage(await read(job.nextUrl), job.nextUrl, job.seenPages); }
    catch (error) { return pauseJob(error, "gift_list", job, store, now); }
    // Upserts are idempotent if interrupted between saving a page and its cursor.
    await store.discover(job.id, page.ids, page.settledIds);
    job.expectedCount = Math.max(job.expectedCount || 0, page.expectedCount);
    if (!page.nextUrl && (await store.counts(job.id)).total < job.expectedCount) {
      return pauseJob(pledgeDataError("incomplete_gift_list"), "gift_list", job, store, now);
    }
    job.seenPages.push(job.nextUrl);
    job.nextUrl = page.nextUrl;
    job.discoveryComplete = !page.nextUrl;
    job.status = page.nextUrl ? "discovering" : "running";
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
