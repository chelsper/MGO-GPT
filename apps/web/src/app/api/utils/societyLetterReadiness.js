import { createHash, randomUUID } from "node:crypto";
import { isBlackbaudQuotaExceededError } from "./blackbaud";
import { readinessReader, letterRecordId } from "./societyLetterReadinessNxt";
import { recipientReviewForRow } from "./societyLetterRecipients";
import { getGivingSocietyConfigurationSignature } from "./givingSocietyDefinitions";
import { exclusionAppealWorkspace } from "./societyLetterExclusionAppeals";
import { matchesPreferredLetterAddress } from "./societyLetterAddressMatch";
import { isOptionalLetterMergeField } from "@/utils/societyLetterDocumentReadiness";
import {
  letterDisposition,
  letterError,
  letterHierarchy,
  letterPeriod,
  letterMergeData,
} from "@/utils/societyLetters";

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const DAY = 86400000;
const sourceSignature = (state, definitions) =>
  hash([state.settings, getGivingSocietyConfigurationSignature(definitions)]);
const templateFor = (state, key) =>
  Object.values(state.templates || {})
    .filter((t) => t.societyKey === key)
    .sort((a, b) => b.sequence - a.sequence)[0];
const keyFor = (row, channel) =>
  hash([row.period.key, [...row.members].sort(), channel]);
const recent = (date) =>
  Number.isFinite(Date.parse(date)) &&
  Date.now() - Date.parse(date) >= 0 &&
  Date.now() - Date.parse(date) < DAY;
const review = (reason) => ({ status: "needs_review", reasons: [reason] });

function sourceBlocker(state, definitions, today) {
  if (state.settings?.sourceMode !== "society_queries")
    return {
      code: "source_unconfigured",
      action: "settings",
      label: "Configure membership queries",
      message:
        "Use the combined society queries to check the full letter hierarchy.",
    };
  const hierarchy = letterHierarchy(definitions, state.settings);
  const annual = definitions.filter((d) => d.active && d.basis === "annual");
  if (annual.some((d) => !hierarchy.some((h) => h.key === d.key)))
    return {
      code: "hierarchy_incomplete",
      action: "settings",
      label: "Review society hierarchy",
      message:
        "Include every active annual society in the hierarchy before checking readiness.",
    };
  if (state.job && state.job.status !== "complete")
    return {
      code: "refresh_incomplete",
      action: state.job.status === "running" ? "resume" : "refresh",
      label:
        state.job.status === "running"
          ? "Resume membership refresh"
          : "Restart membership refresh",
      message:
        "Finish the membership refresh before preparing letters. Saved recipient reviews are kept when their details are unchanged.",
    };
  const period = letterPeriod(state.settings, today);
  if (
    state.snapshot?.signature !== sourceSignature(state, definitions) ||
    state.snapshot?.period?.key !== period.key ||
    !recent(state.snapshot?.generatedAt) ||
    hierarchy.some(
      (d) =>
        !(state.snapshot?.sources || []).some((s) => s.societyKey === d.key),
    )
  )
    return {
      code: "membership_stale",
      action: "refresh",
      label: "Refresh membership and keep my reviews",
      message:
        "Refresh all society membership queries for this period before checking readiness (saved membership must be less than 24 hours old).",
    };
  return null;
}

function sourceProblem(state, definitions, today) {
  return sourceBlocker(state, definitions, today)?.message || null;
}

export function letterPolicyBlocker(state, definitions, today) {
  if (
    state.readiness?.exclusionPolicy &&
    !exclusionAppealWorkspace(state, definitions, today).current
  )
    return {
      code: "exclusion_appeals_unconfigured",
      action: "excluded",
      label: "Verify exclusion appeals",
      message:
        "Verify the exclusion appeal settings for this period before checking NXT.",
    };
  const policy = state.readiness?.policy;
  if (
    !policy ||
    policy.periodKey !== letterPeriod(state.settings, today).key ||
    policy.hierarchySignature !==
      hash(
        letterHierarchy(definitions, state.settings).map((d) => [
          d.key,
          d.displayOrder,
        ]),
      ) ||
    letterHierarchy(definitions, state.settings).some(
      (d) => !policy.appeals?.[d.key]?.id,
    )
  )
    return {
      code: "appeals_unconfigured",
      action: "appeals",
      label: "Configure appeals",
      message:
        "Save the letter appeal settings for this period before checking NXT.",
    };
  return null;
}

function policyProblem(state, definitions, today) {
  return letterPolicyBlocker(state, definitions, today)?.message || null;
}

export function letterReadinessBlocker(state, definitions, today) {
  return (
    sourceBlocker(state, definitions, today) ||
    letterPolicyBlocker(state, definitions, today)
  );
}

export function letterReadinessIssue(state, definitions, today) {
  return letterReadinessBlocker(state, definitions, today)?.message || null;
}

function inputs(state, definitions, row, channel) {
  const recipient = recipientReviewForRow(
    state,
    row,
    sourceSignature(state, definitions),
  );
  const template = templateFor(state, row.societyKey);
  const token = hash([
    1,
    sourceSignature(state, definitions),
    state.snapshot?.generatedAt,
    row,
    recipient?.status,
    recipient?.values,
    recipient?.savedAt,
    template?.version,
    state.readiness?.policy,
    state.readiness?.exclusionPolicy,
    channel,
    state.history,
    state.exclusions,
  ]);
  return { recipient, template, token };
}

export function letterReadinessForRow(state, definitions, today, row, channel) {
  const disposition = letterDisposition(row, state.history, state.exclusions);
  if (disposition.status === "covered")
    return { status: "already_acknowledged", reasons: [disposition.reason] };
  if (disposition.status !== "ready") return review(disposition.reason);
  const problem = sourceProblem(state, definitions, today);
  if (problem) return review(problem);
  const { token } = inputs(state, definitions, row, channel);
  const result = state.readiness?.results?.[keyFor(row, channel)];
  if (!result) return { status: "unchecked", reasons: [] };
  if (result.token !== token || !recent(result.checkedAt))
    return review(
      "Details changed or the check expired. Check readiness again.",
    );
  return result;
}

export function letterReadinessWorkspace(state, definitions, today) {
  if (!state.settings || state.settings.sourceMode !== "society_queries")
    return null;
  const blocker = letterReadinessBlocker(state, definitions, today);
  const job = state.readiness?.job;
  return {
    policy: state.readiness?.policy || null,
    issue: blocker?.message || null,
    blocker,
    policyCurrent: !letterPolicyBlocker(state, definitions, today),
    job: job
      ? {
          id: job.id,
          status: job.status,
          checked: job.cursor,
          total: job.householdIds.length,
          channel: job.channel,
          message: job.message,
          retryAt: job.retryAt,
        }
      : null,
  };
}

export async function saveReadinessPolicy(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  reader = readinessReader(ctx),
) {
  if (["running", "paused"].includes(state.readiness?.job?.status))
    throw letterError(
      "Stop the current readiness check before changing appeal settings.",
      409,
    );
  if (state.settings?.sourceMode !== "society_queries" || body.confirm !== true)
    throw letterError(
      "Confirm the period-specific appeal settings before saving.",
    );
  const hierarchy = letterHierarchy(definitions, state.settings);
  if (!hierarchy.length || hierarchy.length > 10)
    throw letterError("Configure 1-10 annual societies first.");
  const appeals = {};
  const ids = new Set();
  const exclusionIds = new Set(
    Object.values(state.readiness?.exclusionPolicy?.appeals || {}).map(
      (a) => a.id,
    ),
  );
  for (const tier of hierarchy) {
    const requested = body.appeals?.[tier.key] || {};
    const lookupId = String(requested.lookupId || "").trim();
    const requestedId = String(requested.id || "").trim();
    const description = String(requested.description || "").trim();
    if (
      (!lookupId && !requestedId) ||
      (lookupId && requestedId) ||
      lookupId.length > 100 ||
      !description ||
      description.length > 300
    )
      throw letterError(
        `Enter either the appeal code or numeric system record ID and the exact description for ${tier.name}.`,
      );
    const found = lookupId
      ? await reader.appealByCode(lookupId, description)
      : await reader.appeal(letterRecordId(requestedId));
    const id = letterRecordId(found.id);
    if (ids.has(id) || exclusionIds.has(id))
      throw letterError(
        "Use a distinct period-specific letter-sent appeal ID, separate from exclusion appeals, and its exact description for each society.",
      );
    ids.add(id);
    if (found.description !== description)
      throw letterError(
        `The appeal description for ${tier.name} does not match NXT. Check the ID and exact description.`,
      );
    appeals[tier.key] = found;
  }
  const next = {
    ...state,
    readiness: {
      ...state.readiness,
      policy: {
        appeals,
        periodKey: letterPeriod(state.settings, today).key,
        hierarchySignature: hash(hierarchy.map((d) => [d.key, d.displayOrder])),
        savedAt: new Date().toISOString(),
        savedBy: ctx.user.id,
      },
      job: null,
      results: {},
    },
  };
  await store.save(next);
  Object.assign(state, next);
}

const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[,\s]+/g, " ")
    .trim();
function date(value) {
  if (!value) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return "invalid";
  if (
    new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
    value.slice(0, 10)
  )
    return "invalid";
  return value.slice(0, 10);
}
function activePreference(item, today) {
  const start = date(item.start_date),
    end = date(item.end_date);
  if (start === "invalid" || end === "invalid" || (start && end && start > end))
    return true;
  return (!start || start <= today) && (!end || end >= today);
}

export function evaluateLetterReadiness(
  row,
  template,
  members,
  policy,
  hierarchy,
  today,
  channel,
  exclusionPolicy = null,
) {
  const reasons = [];
  const recoveryActions = [];
  const add = (text, action = "status") => {
    if (!reasons.includes(text)) reasons.push(text);
    recoveryActions.push(action);
  };
  const rank = hierarchy.findIndex((d) => d.key === row.societyKey);
  let acknowledged = false;
  let householdUnverified = false;
  let excludedInNxt = false;
  for (const id of row.members) {
    const data = members[id];
    const profile = data?.profile;
    if (!profile || String(profile.id) !== id) {
      householdUnverified = true;
      add("A household member could not be verified in NXT.");
      continue;
    }
    if (
      profile.inactive !== false ||
      (profile.type === "Individual" && profile.deceased !== false)
    )
      add(
        "A household member is inactive/deceased, or NXT did not confirm their status.",
      );
    const expected = row.members.filter((member) => member !== id);
    const spouseId =
      profile.spouse?.id == null ? "" : String(profile.spouse.id);
    if (
      row.members.length > 2 ||
      (expected.length
        ? profile.type !== "Individual" || spouseId !== expected[0]
        : !!profile.spouse)
    ) {
      householdUnverified = true;
      add(
        "The current NXT spouse link differs from this household. Refresh membership and review both records.",
      );
    }
    const name = row.memberNames?.find((member) => member.constituentId === id);
    if (
      profile.type === "Individual" &&
      (!name ||
        normalize(name.firstName) !== normalize(profile.first) ||
        normalize(name.lastName) !== normalize(profile.last))
    )
      add(
        "A constituent name changed in NXT. Refresh membership and review the merge fields.",
      );
    if (data.preferences.some((item) => activePreference(item, today)))
      add(
        "An active NXT solicit code needs staff review. No communication restriction is ignored automatically.",
      );
    const fullSpouse =
      expected.length === 1 &&
      members[expected[0]]?.profile?.is_constituent === true &&
      String(members[expected[0]].profile.spouse?.id) === id;
    if (
      profile.is_constituent === false &&
      (!fullSpouse ||
        profile.type !== "Individual" ||
        spouseId !== expected[0] ||
        channel !== "post")
    )
      add(
        "A relationship-only record needs a verified full-constituent spouse for a joint postal letter.",
      );
    const supportedRelationship =
      profile.is_constituent === false &&
      fullSpouse &&
      profile.type === "Individual" &&
      spouseId === expected[0] &&
      channel === "post";
    if (
      data.consents === null &&
      !(
        supportedRelationship && data.consentUnavailable === "relationship_only"
      )
    )
      add("NXT consent records could not be verified for this household.");
    // Email-only consent is not a postal-mail restriction. Unknown channels,
    // malformed records, and every potentially postal instruction still need review.
    if (
      data.consents?.some(
        (consent) =>
          !(
            channel === "post" &&
            consent.channel === "Email" &&
            consent.id &&
            ["OptIn", "OptOut", "NoResponse"].includes(
              consent.constituent_consent_response,
            ) &&
            date(consent.consent_date) &&
            date(consent.consent_date) !== "invalid" &&
            date(consent.consent_date) <= today
          ),
      )
    )
      add(
        "NXT has consent instructions that need staff review before using this letter.",
      );
    for (const appeal of data.appeals) {
      if (
        exclusionPolicy?.periodKey === row.period.key &&
        Object.values(exclusionPolicy.appeals).some(
          (a) => a.id === String(appeal.appeal?.id),
        )
      )
        excludedInNxt = true;
      if (!appeal.appeal?.id) {
        add(
          "An assigned appeal could not be identified. Review prior letter history in NXT.",
        );
        continue;
      }
      const tier = hierarchy.findIndex(
        (d) => policy.appeals[d.key]?.id === String(appeal.appeal.id),
      );
      // Dedicated appeals identify the recognition period, not the assignment date.
      if (tier >= 0 && tier <= rank) acknowledged = true;
    }
    if (channel === "email" && profile.requests_no_email !== false)
      add(
        "A household member requests no email, or NXT did not confirm the email restriction flag.",
      );
  }
  if (excludedInNxt)
    return review(
      "A household member has an exclusion appeal for this period in NXT. Review the exclusion before preparing any letter; this is not a sent acknowledgment.",
    );
  if (acknowledged && !householdUnverified)
    return {
      status: "already_acknowledged",
      reasons: [
        "A household member already has this period's same or higher society letter appeal. No new letter is needed.",
      ],
    };
  if (channel === "post") {
    const owner = members[row.addressConstituentId]?.profile;
    const address = owner?.address;
    const start = date(address?.start),
      end = date(address?.end);
    if (
      !address ||
      owner.no_valid_address !== false ||
      address.do_not_mail !== false ||
      address.inactive !== false ||
      String(address.constituent_id) !== row.addressConstituentId ||
      address.seasonal_start ||
      address.seasonal_end ||
      start === "invalid" ||
      end === "invalid" ||
      (start && start > today) ||
      (end && end <= today) ||
      !matchesPreferredLetterAddress(row.address, address)
    )
      add(
        "The saved mailing address is not a current, unrestricted preferred NXT address. Review the address before previewing.",
        "recipient",
      );
  } else {
    const email = members[row.recipientConstituentId]?.profile?.email;
    if (
      !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(row.email) ||
      !email ||
      normalize(email.address) !== normalize(row.email) ||
      String(email.constituent_id) !== row.recipientConstituentId ||
      email.do_not_email !== false ||
      email.inactive !== false
    )
      add(
        "The selected email is not a current, unrestricted primary NXT email. Review the email before previewing.",
        "recipient",
      );
  }
  if (!template) add("Upload a letter template for this society.");
  else {
    const values = letterMergeData(row, today, template.mergeSettings);
    if (
      (template.usedFields || []).some(
        (field) =>
          !isOptionalLetterMergeField(field) &&
          !String(values[field] || "").trim(),
      )
    )
      add(
        "The letter has missing merge values. Review its template and saved recipient choices.",
        "recipient",
      );
  }
  if (
    rank < 0 ||
    !row.qualifiedKeys?.includes(row.societyKey) ||
    hierarchy.some((d, i) => i < rank && row.qualifiedKeys.includes(d.key))
  )
    add(
      "The highest qualifying society is not resolved. Refresh all society queries.",
    );
  return reasons.length
    ? {
        status: "needs_review",
        reasons,
        recoveryAction: recoveryActions.every(
          (action) => action === "recipient",
        )
          ? "recipient"
          : "status",
      }
    : {
        status: "ready_for_preview",
        reasons: [
          "Read-only checks passed for the highest society in the saved queries. Review the personalized letter next; this is not permission to send.",
        ],
      };
}

export async function runLetterReadiness(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  reader = readinessReader(ctx),
) {
  const next = structuredClone(state);
  next.readiness ||= {};
  let job = next.readiness.job;
  if (body.action === "cancel_readiness") {
    if (!job || body.jobId !== job.id)
      throw letterError("Reload the saved readiness check.", 409);
    job.status = "cancelled";
    job.message = "Readiness check stopped. Saved results remain available.";
    await store.save(next);
    Object.assign(state, next);
    return;
  }
  const issue =
    sourceProblem(state, definitions, today) ||
    policyProblem(state, definitions, today);
  if (issue) throw letterError(issue);
  const signature = hash([
    sourceSignature(state, definitions),
    state.snapshot.generatedAt,
    state.readiness.policy,
    today,
  ]);
  if (body.action === "check_readiness") {
    if (!["post", "email"].includes(body.channel))
      throw letterError("Choose postal or email readiness.");
    if (job && ["running", "paused"].includes(job.status))
      throw letterError(
        "Resume or stop the existing readiness check first.",
        409,
      );
    const rows = state.snapshot.rows.filter(
      (row) =>
        letterDisposition(row, state.history, state.exclusions).status ===
        "ready",
    );
    const ids = body.householdIds || rows.map((row) => row.householdId);
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 1000 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !rows.some((row) => row.householdId === id))
    )
      throw letterError(
        "Choose current, non-excluded households for readiness checking.",
      );
    job = next.readiness.job = {
      id: randomUUID(),
      ownerId: ctx.user.id,
      status: "running",
      cursor: 0,
      householdIds: ids,
      channel: body.channel,
      signature,
      startedAt: new Date().toISOString(),
    };
    // Persist intent before any NXT reads; a lost response can safely resume.
    await store.save(next);
  } else if (
    !job ||
    body.jobId !== job.id ||
    String(job.ownerId) !== String(ctx.user.id) ||
    job.signature !== signature ||
    !["running", "paused"].includes(job.status)
  ) {
    throw letterError(
      "This check changed, expired, or belongs to another reviewer. Stop it and start a fresh check.",
      409,
    );
  }
  if (job.retryAt && Date.parse(job.retryAt) > Date.now())
    throw letterError(
      "Blackbaud is still cooling down. Resume after the displayed time.",
      429,
    );
  job.status = "running";
  job.retryAt = null;
  job.message = "Checking current NXT records. Nothing is sent or updated.";
  for (
    let localChecks = 0;
    localChecks < 10 && job.cursor < job.householdIds.length;
    localChecks++
  ) {
    const sourceRow = state.snapshot.rows.find(
      (row) => row.householdId === job.householdIds[job.cursor],
    );
    const { recipient, template, token } = inputs(
      state,
      definitions,
      sourceRow,
      job.channel,
    );
    const disposition = letterDisposition(
      sourceRow,
      state.history,
      state.exclusions,
    );
    let result;
    let contactedNxt = false;
    try {
      if (disposition.status !== "ready") result = review(disposition.reason);
      else if (recipient?.status !== "saved")
        result = review("Review and save the letter recipient choices first.");
      else {
        contactedNxt = true;
        const row = { ...sourceRow, ...recipient.values };
        const members = {};
        for (const id of row.members) members[id] = await reader.member(id);
        result = evaluateLetterReadiness(
          row,
          template,
          members,
          state.readiness.policy,
          letterHierarchy(definitions, state.settings),
          today,
          job.channel,
          state.readiness.exclusionPolicy,
        );
      }
    } catch (error) {
      const status = error.httpStatus || error.status;
      if (
        isBlackbaudQuotaExceededError(error) ||
        status === 429 ||
        !status ||
        status >= 500 ||
        status === 401 ||
        status === 403
      ) {
        job.status = "paused";
        job.message =
          "NXT checking paused. Saved results are safe; verify the connection or wait for Blackbaud, then resume.";
        if (isBlackbaudQuotaExceededError(error) || status === 429)
          job.retryAt = new Date(
            Date.now() + Math.max(60000, Number(error.retryAfterMs) || 600000),
          ).toISOString();
      } else
        result = review(
          status === 404
            ? "A household member no longer exists in NXT. Refresh membership."
            : error.httpStatus
              ? "NXT could not return the required records. Review this household before continuing."
              : error.message,
        );
    }
    if (result) {
      next.readiness.results ||= {};
      next.readiness.results[keyFor(sourceRow, job.channel)] = {
        ...result,
        token,
        checkedAt: new Date().toISOString(),
        checkedBy: ctx.user.id,
      };
      job.cursor++;
      if (job.cursor === job.householdIds.length) {
        job.status = "complete";
        job.message =
          "Readiness checks finished. No letters sent and no NXT records changed.";
      }
    }
    if (contactedNxt || job.status !== "running") break;
  }
  // Bound retention to the current snapshot and both channels.
  const keys = new Set(
    state.snapshot.rows.flatMap((row) => [
      keyFor(row, "post"),
      keyFor(row, "email"),
    ]),
  );
  next.readiness.results = Object.fromEntries(
    Object.entries(next.readiness.results || {}).filter(([key]) =>
      keys.has(key),
    ),
  );
  await store.save(next);
  Object.assign(state, next);
}
