const DELAYS = [5000, 30000, 120000];
const time = (value) => Date.parse(value) || 0;
const keyFor = (receipt) =>
  JSON.stringify(receipt.members.map((m) => [m.id, m.attemptedAt || null]));

export function letterAppealRetryAt(receipt) {
  const failures = [
    receipt?.verificationFailure,
    ...(receipt?.members || []).flatMap((m) => [m.failure, m.lastWriteFailure]),
  ];
  return Math.max(
    0,
    ...failures.map((failure) =>
      failure?.retryAfterMs > 0
        ? time(failure.checkedAt) + failure.retryAfterMs
        : 0,
    ),
  );
}

// Only reconcile an existing uncertain submission. Never turn a pending write
// or a completed receipt into background work.
export function automaticAppealCheck(receipt, now = Date.now()) {
  if (
    !receipt ||
    receipt.status === "complete" ||
    !receipt.members?.some((m) => m.status === "uncertain")
  )
    return null;
  const key = keyFor(receipt);
  const saved = receipt.verification?.key === key ? receipt.verification : null;
  if (
    saved?.status === "needs_review" ||
    (saved?.attempts || 0) >= DELAYS.length
  )
    return null;
  const cooldown = letterAppealRetryAt(receipt);
  const dueAt = Math.max(
    saved ? time(saved.nextCheckAt) : time(receipt.checkedAt) + DELAYS[0],
    cooldown,
  );
  return {
    key,
    attempts: saved?.attempts || 0,
    dueAt,
    delay: Math.max(0, dueAt - now),
  };
}

export function beginAutomaticAppealCheck(receipt, now = Date.now()) {
  const plan = automaticAppealCheck(receipt, now);
  if (!plan || plan.delay > 0) return false;
  // Persist the attempt before GETs so another tab or an interrupted request
  // cannot produce an unbounded verification loop.
  receipt.verification = {
    key: plan.key,
    attempts: plan.attempts + 1,
    status: "checking",
    checkedAt: new Date(now).toISOString(),
    nextCheckAt: new Date(now + 120000).toISOString(),
  };
  return true;
}

export function finishAutomaticAppealCheck(receipt, error, now = Date.now()) {
  const check = receipt.verification;
  const uncertain = receipt.members.some((m) => m.status === "uncertain");
  const permanent = [400, 401, 403, 404, 413, 415, 422].includes(
    error?.httpStatus,
  );
  check.status = !uncertain
    ? "complete"
    : permanent || check.attempts >= DELAYS.length
      ? "needs_review"
      : "waiting";
  const cooldown = Number.isFinite(error?.retryAfterMs)
    ? Math.max(0, error.retryAfterMs)
    : 0;
  check.checkedAt = new Date(now).toISOString();
  check.nextCheckAt =
    check.status === "waiting"
      ? new Date(now + Math.max(DELAYS[check.attempts], cooldown)).toISOString()
      : null;
}

export function nextAutomaticAppealCheck(data, now = Date.now()) {
  const candidates = [
    ...(data?.history || [])
      .filter((i) => i.channel === "post" && i.status === "prepared")
      .map((i) => ({
        receipt: i.letterAppeals,
        action: "verify_letter_appeals",
        deliveryId: i.id,
      })),
    ...(data?.exclusions || [])
      .filter((i) => !i.restoredAt)
      .map((i) => ({
        receipt: i.nxt,
        action: "verify_exclusion_appeal",
        exclusionId: i.id,
      })),
  ]
    .map(({ receipt, ...body }) => {
      const plan = automaticAppealCheck(receipt, now);
      return plan && { ...plan, body: { ...body, automatic: true } };
    })
    .filter(Boolean);
  return candidates.sort((a, b) => a.dueAt - b.dueAt)[0] || null;
}
