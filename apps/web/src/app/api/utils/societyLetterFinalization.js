import { createHash, randomUUID } from "node:crypto";
import { letterSelectionSummary } from "@/utils/societyLetterBatchSummary";
import {
  assertNxtAppealComments,
  compactLetterAppealComment,
  legacyLetterAppealComment,
  NXT_APPEAL_COMMENT_LIMIT,
} from "@/utils/societyLetterAppealComments";
import {
  beginAutomaticAppealCheck,
  finishAutomaticAppealCheck,
  assertLetterAppealPauseEnded,
} from "@/utils/societyLetterVerification";
import {
  relationshipOnlyReceipt,
  settledLetterAppealMember,
  completeLetterAppealMembers,
} from "@/utils/societyLetterAppealMembers";
import { getGivingSocietyConfigurationSignature } from "./givingSocietyDefinitions";
import { recipientReviewForRow } from "./societyLetterRecipients";
import { renderSocietyLetter } from "./societyLetterDocuments";
import { readinessReader, letterRecordId } from "./societyLetterReadinessNxt";
import {
  letterReadinessBlocker,
  evaluateLetterReadiness,
} from "./societyLetterReadiness";
import {
  exclusionAppealClient,
  exclusionFailureDiagnostic,
} from "./societyLetterExclusionAppeals";
import {
  letterDisposition,
  letterError,
  letterHierarchy,
  letterPeriod,
} from "@/utils/societyLetters";

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hierarchySignature = (hierarchy) =>
  hash(hierarchy.map((d) => [d.key, d.displayOrder]));
const policySignature = (policy) =>
  policy
    ? hash([
        policy.periodKey,
        policy.hierarchySignature,
        Object.entries(policy.appeals || {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, appeal]) => [
            key,
            appeal.id,
            appeal.lookupId || "",
            appeal.description,
          ]),
      ])
    : null;
const verified = (member) => member.status === "verified";
const matching = (rows, appeal) =>
  rows.filter((row) => String(row.appeal?.id) === appeal.id);
const exact = (row, receipt, member) =>
  row.comments === (member.submittedComments ?? receipt.comments) &&
  row.date?.slice(0, 10) === receipt.date &&
  (!member.assignmentId || String(row.id) === member.assignmentId);

function recoveryError(message, recoveryAction) {
  return Object.assign(letterError(message), { recoveryAction });
}

function currentAppeal(catalog, configured) {
  const found = catalog.filter((a) => String(a.id) === configured.id);
  if (
    found.length !== 1 ||
    found[0].inactive !== false ||
    found[0].description !== configured.description ||
    (configured.lookupId && found[0].lookup_id !== configured.lookupId) ||
    catalog.filter(
      (a) =>
        a.description?.trim().toLowerCase() ===
        configured.description.trim().toLowerCase(),
    ).length !== 1
  )
    throw recoveryError(
      "The letter appeal changed or its description is not unique in NXT. Verify the appeal settings before continuing.",
      "appeals",
    );
}

export function previewFinalPostalLetter(
  state,
  definitions,
  today,
  body,
  letterDate = today,
) {
  const blocker = letterReadinessBlocker(state, definitions, today);
  if (blocker) {
    const error = letterError(blocker.message);
    error.blockers = [blocker];
    throw error;
  }
  const source = state.snapshot.rows.find(
    (r) => r.householdId === body.householdId,
  );
  if (
    !source ||
    letterDisposition(source, state.history, state.exclusions).status !==
      "ready"
  )
    throw letterError(
      "This recipient is excluded, covered, or already has a reserved letter. Reload history before continuing.",
      409,
    );
  if (
    !Array.isArray(source.members) ||
    !source.members.length ||
    source.members.length > 2 ||
    new Set(source.members).size !== source.members.length
  )
    throw letterError(
      "Review the household system record IDs before creating a letter.",
    );
  source.members.forEach(letterRecordId);
  const signature = hash([
    state.settings,
    getGivingSocietyConfigurationSignature(definitions),
  ]);
  const review = recipientReviewForRow(state, source, signature);
  if (review?.status !== "saved")
    throw letterError("Review and save the recipient choices first.");
  // Document review uses saved recipient choices. Fresh NXT checks still run
  // immediately before any appeal writes, not as a separate whole-list prerequisite.
  const hierarchy = letterHierarchy(definitions, state.settings);
  const rank = hierarchy.findIndex((d) => d.key === source.societyKey);
  if (
    rank < 0 ||
    !source.qualifiedKeys?.includes(source.societyKey) ||
    hierarchy.some((d, i) => i < rank && source.qualifiedKeys.includes(d.key))
  )
    throw letterError(
      "Refresh all society queries to resolve the highest qualifying letter.",
    );
  const hierarchyKey = hierarchySignature(hierarchy);
  if (
    state.history.some(
      (item) =>
        item.status !== "cancelled" &&
        item.period.key === source.period.key &&
        item.hierarchySignature !== hierarchyKey,
    )
  )
    throw letterError(
      "The hierarchy changed after letters were prepared. Review the existing letter history first.",
    );
  const template = Object.values(state.templates)
    .filter((t) => t.societyKey === source.societyKey)
    .sort((a, b) => b.sequence - a.sequence)[0];
  if (!template) throw letterError("Save this society's Word template first.");
  const row = {
    ...source,
    ...review.values,
    members: [...source.members],
    memberNames: source.memberNames,
    rank,
    coveredKeys: hierarchy.slice(rank).map((d) => d.key),
    hierarchySignature: hierarchyKey,
    templateVersion: template.version,
    templateFilename: template.filename,
    letterDate,
    channel: "post",
  };
  renderSocietyLetter(template, row, letterDate);
  const appeal = state.readiness.policy.appeals[source.societyKey];
  const selectionSummary = letterSelectionSummary(state, [row]);
  return {
    row,
    appeal,
    hierarchy,
    selectionSummary,
    token: hash([
      state.revision,
      row,
      appeal,
      state.readiness.policy,
      state.readiness.exclusionPolicy,
      selectionSummary,
    ]),
  };
}

function validateReceipt(item) {
  const receipt = item?.letterAppeals;
  if (
    !receipt ||
    item.channel !== "post" ||
    item.status !== "prepared" ||
    !receipt.members?.length ||
    receipt.members.length > 2 ||
    hash(receipt.members.map((m) => m.id).sort()) !==
      hash([...item.members].sort())
  )
    throw letterError("Choose the reserved postal letter from history.", 409);
  receipt.members.forEach((m) => letterRecordId(m.id));
  return receipt;
}

function reconcileMembers(receipt, histories) {
  for (const member of receipt.members) {
    if (relationshipOnlyReceipt(member)) continue;
    const matches = matching(histories[member.id], receipt.appeal);
    if (matches.length > 1)
      throw letterError(
        "Multiple copies of the letter appeal exist in NXT. None will be added; review that member's appeal history.",
      );
    if (matches.length) {
      if (!member.attemptedAt || !exact(matches[0], receipt, member))
        throw letterError(
          "An existing letter appeal does not match this saved letter. It was not changed; review NXT before continuing.",
        );
      member.status = "verified";
      member.assignmentId = String(matches[0].id);
      member.verifiedAt = new Date().toISOString();
    } else if (member.status !== "pending") {
      throw letterError(
        "An earlier appeal submission is unconfirmed or was removed. It will not be sent again. Verify NXT before continuing.",
      );
    }
  }
}

async function freshCheck(
  state,
  item,
  definitions,
  today,
  reader,
  client,
  recovery = false,
) {
  const receipt = item.letterAppeals;
  if (
    receipt.periodKey !== letterPeriod(state.settings, today).key ||
    receipt.hierarchySignature !==
      hierarchySignature(letterHierarchy(definitions, state.settings)) ||
    policySignature(receipt.policy) !==
      policySignature(state.readiness?.policy) ||
    policySignature(receipt.exclusionPolicy) !==
      policySignature(state.readiness?.exclusionPolicy)
  )
    throw letterError(
      "The period, hierarchy, or appeal settings changed. Review this reserved letter before continuing.",
    );
  if (
    letterDisposition(
      item,
      state.history.filter((i) => i.id !== item.id),
      state.exclusions,
    ).status !== "ready"
  )
    throw letterError(
      "This recipient is now excluded or covered by another letter. No further appeals will be added.",
    );
  currentAppeal(await client.catalog(), receipt.appeal);
  const members = {};
  for (const id of item.members) members[id] = await reader.member(id);
  // Preserve every household member for grouping/history. Only a confirmed
  // relationship-only spouse has no separate appeal assignment; never erase
  // an earlier submission when a record's constituent status changes.
  for (const member of receipt.members) {
    if (members[member.id].profile.is_constituent === false) {
      if (
        member.attemptedAt ||
        member.assignmentId ||
        member.status === "uncertain" ||
        verified(member)
      )
        throw letterError(
          "A previously submitted appeal belongs to a record whose constituent status changed. Verify NXT history before continuing.",
        );
    } else if (relationshipOnlyReceipt(member)) {
      if (members[member.id].profile.is_constituent !== true)
        throw letterError(
          "NXT did not confirm this spouse's current constituent status. No new appeal was submitted.",
        );
      member.status = "pending";
      delete member.reason;
      delete member.checkedAt;
    }
  }
  if (recovery)
    reconcileMembers(
      receipt,
      Object.fromEntries(item.members.map((id) => [id, members[id].appeals])),
    );
  // Ignore only this letter's exact, verified assignments during recovery.
  // Other same/higher appeals and all restrictions still block another write.
  const checking = structuredClone(members);
  for (const member of receipt.members) {
    if (verified(member))
      checking[member.id].appeals = checking[member.id].appeals.filter(
        (a) => String(a.id) !== member.assignmentId,
      );
  }
  const result = evaluateLetterReadiness(
    item,
    state.templates[item.templateVersion],
    checking,
    receipt.policy,
    receipt.hierarchy,
    today,
    "post",
    receipt.exclusionPolicy,
  );
  if (result.status !== "ready_for_preview")
    throw recoveryError(
      result.reasons.join(" "),
      result.recoveryAction || "status",
    );
  for (const member of receipt.members) {
    if (members[member.id].profile.is_constituent === false) {
      member.status = "not_applicable";
      member.reason = "relationship_only";
      member.checkedAt = new Date().toISOString();
    }
  }
}

async function applyMembers(item, store, client) {
  const receipt = item.letterAppeals;
  for (const member of receipt.members) {
    if (settledLetterAppealMember(member)) continue;
    if (member.status !== "pending")
      throw letterError(
        "Verify the uncertain submission first. It will not be sent again.",
      );
    let comments = member.submittedComments ?? receipt.comments;
    // Only migrate our exact legacy generated note after fresh reconciliation.
    // Keep it for audit and preserve the exact text of every earlier submission.
    if (
      member.submittedComments === undefined &&
      !member.assignmentId &&
      (!member.attemptedAt ||
        [400, 401, 403, 404, 413, 415, 422, 429].includes(
          member.failure?.httpStatus,
        )) &&
      comments?.length > NXT_APPEAL_COMMENT_LIMIT &&
      comments === legacyLetterAppealComment(item)
    )
      comments = compactLetterAppealComment(item);
    assertNxtAppealComments(comments);
    member.submittedComments = comments;
    member.status = "uncertain";
    member.attemptedAt = new Date().toISOString();
    await store.saveLetterAppeals(item);
    let result;
    try {
      result = await client.create(
        member.id,
        receipt.appeal,
        receipt.date,
        member.submittedComments,
      );
    } catch (error) {
      member.failure = exclusionFailureDiagnostic(error);
      if ([400, 401, 403, 404, 413, 415, 422, 429].includes(error.httpStatus))
        member.status = "pending";
      const failure = letterError(member.failure.message);
      failure.httpStatus = member.failure.httpStatus;
      failure.retryAfterMs = member.failure.retryAfterMs;
      failure.unconfirmed = !member.failure.httpStatus;
      throw failure;
    }
    if (!result?.id)
      throw letterError(
        "NXT did not confirm the assignment. Verify the saved submission; it will not be sent again.",
      );
    member.assignmentId = letterRecordId(result.id);
    await store.saveLetterAppeals(item);
    const matches = matching(await client.appeals(member.id), receipt.appeal);
    if (matches.length !== 1 || !exact(matches[0], receipt, member))
      throw letterError(
        "NXT accepted an appeal but read-back did not confirm its details. Verify status; no duplicate will be sent.",
      );
    member.status = "verified";
    member.verifiedAt = new Date().toISOString();
    delete member.failure;
    await store.saveLetterAppeals(item);
  }
}

function receiptStatus(item, error = null) {
  const receipt = item.letterAppeals;
  if (error) {
    receipt.verificationFailure = exclusionFailureDiagnostic(error);
    receipt.recoveryAction =
      error.recoveryAction ||
      (!error.status && !error.httpStatus ? "retry" : "status");
  } else {
    delete receipt.verificationFailure;
    delete receipt.recoveryAction;
  }
  receipt.status = error
    ? "needs_review"
    : completeLetterAppealMembers(receipt.members)
      ? "complete"
      : "pending";
  receipt.message = error
    ? error.status && !error.httpStatus
      ? error.message
      : receipt.verificationFailure.message
    : receipt.status === "complete"
      ? "Letter created and appeal confirmed for every full constituent. Relationship-only spouses remain included in the household; no separate appeal is assigned to them. This does not mean it has been mailed."
      : "Saved submissions checked. Continue only the remaining member updates; no new letter will be created.";
  receipt.checkedAt = new Date().toISOString();
}

export async function finalizePostalLetter(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  reader = readinessReader(ctx),
  client = exclusionAppealClient(ctx, undefined, "Letter history"),
) {
  if (body.confirm !== true)
    throw letterError(
      "Confirm creation and the appeal update for every household member.",
    );
  const preview = previewFinalPostalLetter(state, definitions, today, body);
  if (preview.token !== body.previewToken)
    throw letterError(
      "The final letter details changed. Review the latest confirmation before continuing.",
      409,
    );
  const item = reservePostalLetter(preview, state, today, ctx);
  await freshCheck(state, item, definitions, today, reader, client);
  // A durable reservation and per-member intent must precede every NXT POST.
  await store.reserve([item]);
  try {
    await applyMembers(item, store, client);
    receiptStatus(item);
  } catch (error) {
    receiptStatus(item, error);
  }
  await store.saveLetterAppeals(item);
  return item.batchId;
}

export function reservePostalLetter(
  preview,
  state,
  today,
  ctx,
  batchId = randomUUID(),
) {
  const item = structuredClone({
    ...preview.row,
    id: randomUUID(),
    batchId,
    status: "prepared",
    preparedAt: new Date().toISOString(),
    preparedBy: ctx.user.id,
    selectionSummary: preview.selectionSummary,
    letterAppeals: {
      status: "pending",
      appeal: preview.appeal,
      date: preview.row.letterDate,
      periodKey: preview.row.period.key,
      hierarchy: preview.hierarchy,
      hierarchySignature: preview.row.hierarchySignature,
      policy: state.readiness.policy,
      exclusionPolicy: state.readiness.exclusionPolicy || null,
      members: preview.row.members.map((id) => ({ id, status: "pending" })),
    },
  });
  item.letterAppeals.comments = compactLetterAppealComment(item);
  item.letterAppeals.auditComments = legacyLetterAppealComment(item);
  return item;
}

export async function syncLetterAppeals(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  reader = readinessReader(ctx),
  client = exclusionAppealClient(ctx, undefined, "Letter history"),
) {
  const item = state.history.find((i) => i.id === body.deliveryId);
  const receipt = validateReceipt(item);
  const verifyOnly = body.action === "verify_letter_appeals";
  if (body.automatic === true && !verifyOnly)
    throw letterError("Automatic checks must be read-only.");
  const automatic = verifyOnly && body.automatic === true;
  // Do not persist another failure or extend the deadline for an early retry.
  if (!automatic) assertLetterAppealPauseEnded([receipt]);
  if (automatic) {
    if (!beginAutomaticAppealCheck(receipt)) return;
    await store.saveLetterAppeals(item);
  }
  if (!verifyOnly && body.confirm !== true)
    throw letterError(
      "Confirm applying the saved appeal only to remaining members.",
    );
  let verificationError;
  try {
    if (verifyOnly) {
      const histories = {};
      for (const member of receipt.members)
        if (!relationshipOnlyReceipt(member))
          histories[member.id] = await client.appeals(member.id);
      reconcileMembers(receipt, histories);
    } else {
      await freshCheck(state, item, definitions, today, reader, client, true);
      await store.saveLetterAppeals(item);
      await applyMembers(item, store, client);
    }
    receiptStatus(item);
  } catch (error) {
    verificationError = error;
    receiptStatus(item, error);
  }
  if (automatic) finishAutomaticAppealCheck(receipt, verificationError);
  await store.saveLetterAppeals(item);
  return {
    status: receipt.status,
    message: receipt.message,
    // A record-specific conflict can be left for staff. Connection, quota, and
    // uncertain transport failures pause the whole selection without retrying.
    stop:
      !!verificationError &&
      (!verificationError.status ||
        verificationError.unconfirmed === true ||
        [401, 403, 429].includes(verificationError.httpStatus) ||
        verificationError.httpStatus >= 500 ||
        verificationError.retryAfterMs > 0),
  };
}

export function assertLetterAppealsComplete(items) {
  if (
    items.some(
      (item) =>
        item.letterAppeals &&
        (item.letterAppeals.status !== "complete" ||
          !completeLetterAppealMembers(item.letterAppeals.members)),
    )
  )
    throw letterError(
      "Finish or verify the saved appeal updates for every household member in Letter history before downloading or marking this letter mailed.",
      409,
    );
}
