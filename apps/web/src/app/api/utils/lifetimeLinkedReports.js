import { randomUUID, createHash } from "node:crypto";
import sql from "./sql";
import { lifetimeError } from "@/utils/lifetimeSocieties";
import { LIFETIME_LIMITS } from "./lifetimeSocietyHistory";
import { lifetimeRecordKey, lifetimeMilestoneKey, lifetimeDecisionIndexes } from "./lifetimeRecordDecisions";
import { lifetimeGiftReviewEvidence, readLifetimeState, readLifetimeRules, lifetimeTransport } from "./lifetimeSocieties";
import { newLifetimeCheck, advanceLifetimeCheck, reconcileLifetimeGraph, analyzeReconciledLifetime, summarizeReconciledLifetime, canCheckLifetimeGift } from "./lifetimeLinkedHistory";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const CACHE_KEY = "report:lifetime-giving-societies:v1";
export async function checkLifetimeLinkedHistory({ revision, milestoneKey, giftId, operation, user, origin, db = sql,
  rules = readLifetimeRules, transport = () => lifetimeTransport(origin), now = () => new Date() }) {
  const before = await readLifetimeState(db), societies = await rules(db);
  const evidence = lifetimeGiftReviewEvidence(before, societies, { milestoneKey, revision });
  if (!evidence.available || evidence.row.archived) throw lifetimeError("Choose an active recipient's saved gift history.", 409);
  const selected = evidence.items.find(item => item.giftId === giftId);
  if (!selected || !canCheckLifetimeGift(selected.type)) throw lifetimeError("Choose a pledge, payment or write-off from this recipient's saved history.", 400);
  const scope = lifetimeRecordKey(evidence.row), previous = before.snapshot.giftReview.linkedScopes?.[scope] || { checks: [] };
  let job = previous.job;
  if (operation === "restart-linked" || !job || (job.seed !== giftId && ["complete", "attention"].includes(job.status))) job = { ...newLifetimeCheck(giftId, now()), status: "running" };
  if (job.seed !== giftId) throw lifetimeError("Finish or restart the current linked-history check before choosing another gift.", 409);
  if (job.status === "complete") return { state: before, societies };
  if (job.status === "attention" && operation !== "restart-linked") return { state: before, societies };
  job = { ...job, status: "running", message: null };
  const options = society => ({ sources: society.countSources, fullRecognition: before.snapshot.source.fullRecognition, today: evidence.asOf });
  let checks = [...(previous.checks || [])];
  let blockedChecks = [...(previous.blockedChecks || [])];
  const provider = await transport();
  for (let step = 0; step < 5 && job.stage !== "complete"; step++) {
    try { job = await advanceLifetimeCheck(job, evidence.history, provider.read, now()); }
    catch (error) {
      job.status = error.lifetimeSafe ? "attention" : "paused";
      job.message = error.lifetimeSafe ? error.message : "NXT is temporarily unavailable for this check. Progress is saved; continue when the connection is available. No new dates were published.";
      break;
    }
  }
  let completed = false;
  if (job.stage === "complete" && job.status === "running") {
    try {
      for (const society of societies) reconcileLifetimeGraph(evidence.history, job, options(society));
      const ids = new Set(Object.keys(job.data).filter(path => path.startsWith("/gift/")));
      checks = checks.filter(check => !Object.keys(check.data).some(path => ids.has(path)));
      if (checks.length >= 50) throw lifetimeError("This recipient reached the saved-check limit. Staff review is needed.", 413);
      job = { ...job, status: "complete", message: "Linked history verified. Earlier payments keep their dates; pledges and payments are not counted twice. Other unresolved gifts may still need review." };
      checks.push(job);
      blockedChecks = blockedChecks.filter(block => !(block.giftIds || [block.seed]).every(id => ids.has(`/gift/v1/gifts/${id}`)));
      completed = true;
    } catch (error) { checks = previous.checks || []; job.status = "attention"; job.message = error.lifetimeSafe ? error.message : "Linked evidence needs staff review. Unconfirmed dates are withheld; confirmed dates stay locked."; }
  }
  if (job.status === "attention") {
    const paths = new Set(job.queue);
    const invalid = checks.filter(check => Object.keys(check.data).some(path => path.startsWith("/gift/") && paths.has(path)));
    for (const check of invalid) for (const path of Object.keys(check.data)) paths.add(path);
    checks = checks.filter(check => !invalid.includes(check));
    const giftIds = [...new Set([...(blockedChecks.find(block => block.seed === job.seed)?.giftIds || []),
      ...[...paths].filter(path => path.startsWith("/gift/")).map(path => path.split("/").at(-1))])];
    blockedChecks = [...blockedChecks.filter(block => block.seed !== job.seed), { seed: job.seed, giftIds, reason: job.message }];
  }
  const state = structuredClone(before);
  state.snapshot.giftReview.linkedScopes ||= {};
  state.snapshot.giftReview.linkedScopes[scope] = { job, checks, blockedChecks };
  if (completed || job.status === "attention") {
    const confirmations = lifetimeDecisionIndexes(state.recordDecisions).milestones;
    for (const row of [...state.snapshot.rows, ...(state.snapshot.sharedGroups || []).flatMap(group => group.rows)]) {
      if (lifetimeRecordKey(row) !== scope) continue;
      const society = societies.find(society => society.key === row.societyKey);
      const analysis = analyzeReconciledLifetime(evidence.history, options(society), checks, blockedChecks);
      if (state.snapshot.source.restrictedHistory) analysis.reasons.push("Gift-level criteria may exclude earlier qualifying gifts.");
      if (!society.countSources.includes("committed") || society.countSources.some(source => !["committed", "recognition_credit"].includes(source)))
        analysis.reasons.push("This society's saved recognition rule needs a separate historical calculation.");
      Object.assign(row, summarizeReconciledLifetime(analysis, row.thresholdCents, confirmations.has(lifetimeMilestoneKey(row))));
      if (completed) row.linkedHistoryCheckedAt = job.checkedAt;
    }
    state.snapshot.provisionalCount = state.snapshot.rows.filter(row => row.date).length;
    state.snapshot.reviewCount = state.snapshot.rows.filter(row => !row.date).length;
  }
  if (Buffer.byteLength(JSON.stringify(state.snapshot.giftReview)) > LIFETIME_LIMITS.bytes) throw lifetimeError("Saved linked evidence exceeds the supported history size. Previous results are unchanged.", 413);
  if (hash(societies) !== hash(await rules(db))) throw lifetimeError("Society rules changed during the check. Reload saved results.", 409);
  state.revision = randomUUID(); state.updatedBy = user.id;
  state.linkedAudit = [...(state.linkedAudit || []), { scope, giftId, status: job.status, reads: job.reads, at: now().toISOString(), userId: user.id }].slice(-200);
  const saved = await db`UPDATE report_snapshots_cache SET payload=${JSON.stringify(state)}::jsonb,updated_at=NOW()
    WHERE report_key=${CACHE_KEY} AND payload->>'revision'=${revision} RETURNING report_key`;
  if (!saved.length) throw lifetimeError("Saved history changed during the check. Reload the report; another update was not overwritten.", 409);
  return { state, societies };
}
