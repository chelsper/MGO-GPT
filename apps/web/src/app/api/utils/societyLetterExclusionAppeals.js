import { createHash } from "node:crypto";
import { blackbaudApiFetch } from "./blackbaud";
import { letterRecordId } from "./societyLetterReadinessNxt";
import {
  assertNxtAppealComments,
  NXT_APPEAL_COMMENT_LIMIT,
} from "@/utils/societyLetterAppealComments";
import {
  beginAutomaticAppealCheck,
  finishAutomaticAppealCheck,
  assertLetterAppealPauseEnded,
} from "@/utils/societyLetterVerification";
import {
  completeAppealCatalog,
  appealByLookupCode,
} from "./societyLetterAppealCatalog";
import {
  letterError,
  letterHierarchy,
  letterPeriod,
} from "@/utils/societyLetters";

const signature = (hierarchy) =>
  createHash("sha256")
    .update(JSON.stringify(hierarchy.map((d) => [d.key, d.displayOrder])))
    .digest("hex");
const finished = (member) => ["verified", "existing"].includes(member.status);
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

// Keep transport evidence, never provider messages that may echo donor data.
export function exclusionFailureDiagnostic(error) {
  const httpStatus =
    Number.isInteger(error?.httpStatus) &&
    error.httpStatus >= 400 &&
    error.httpStatus <= 599
      ? error.httpStatus
      : null;
  const guidance = {
    400: "NXT rejected the appeal fields. The date, comments, or another NXT validation rule needs review.",
    401: "NXT did not authorize the appeal request. Check the Blackbaud connection and API subscription access.",
    403: "NXT denied this appeal request. Ask an NXT administrator to check the connected user's Data Integration and appeal-write permissions.",
    404: "NXT could not find the requested resource. Check the constituent, appeal, and API endpoint before retrying.",
    413: "NXT rejected the request size. Review the appeal comments before retrying.",
    415: "NXT rejected the request format. The integration needs review before retrying.",
    422: "NXT rejected the appeal fields. Review the date, comments, and NXT validation requirements.",
    429: "Blackbaud temporarily rate-limited the appeal request. Wait for its cooldown before continuing.",
  };
  return {
    httpStatus,
    checkedAt: new Date().toISOString(),
    ...(typeof error?.blackbaudErrorName === "string" &&
    /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(error.blackbaudErrorName) &&
    Number.isSafeInteger(error.blackbaudErrorCode)
      ? {
          providerCode: error.blackbaudErrorCode,
          providerName: error.blackbaudErrorName,
        }
      : {}),
    ...(Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0
      ? { retryAfterMs: Math.min(error.retryAfterMs, 86400000) }
      : {}),
    message:
      guidance[httpStatus] ||
      "The NXT result could not be confirmed. Verify the existing submission; do not submit it again.",
  };
}

function rejectionMessage(member) {
  const failure = member.lastWriteFailure;
  return failure
    ? `${failure.message}${failure.httpStatus ? ` (HTTP ${failure.httpStatus}.)` : ""} The household remains excluded.`
    : "An earlier appeal request was rejected, but its error details were not recorded. A read-only check does not repeat the assignment. The household remains excluded.";
}

export function exclusionAppealWorkspace(state, definitions, today) {
  const policy = state.readiness?.exclusionPolicy;
  const current =
    !!state.settings &&
    !!policy &&
    policy.periodKey === letterPeriod(state.settings, today).key &&
    policy.hierarchySignature ===
      signature(letterHierarchy(definitions, state.settings));
  return { policy: policy || null, current };
}

// The Data Integration create endpoint resolves appeals by description, not ID.
// Revalidate that the exact description is unique before any constituent write.
export function exclusionAppealClient(
  ctx,
  fetcher = blackbaudApiFetch,
  recoveryArea = "Excluded",
) {
  let calls = 0;
  const deadline = Date.now() + 75000;
  async function request(path, method = "GET", body) {
    if (++calls > 16 || Date.now() > deadline)
      throw letterError(
        `NXT check paused. Continue from ${recoveryArea}; no automatic resubmission will occur.`,
      );
    return fetcher(path, {
      userId: ctx.user.id,
      origin: ctx.origin,
      method,
      body,
      timeoutMs: 5000,
      maxRetries: 0,
    });
  }
  async function appeals(id) {
    id = letterRecordId(id);
    const result = await request(`/constituent/v1/constituents/${id}/appeals`);
    if (
      !Array.isArray(result?.value) ||
      !Number.isInteger(result.count) ||
      result.count !== result.value.length ||
      result.count > 2000 ||
      result.next_link ||
      result.nextLink ||
      result.continuation_token ||
      result.value.some(
        (r) => !r?.id || String(r.constituent_id) !== id || !r.appeal?.id,
      ) ||
      new Set(result.value.map((r) => String(r.id))).size !== result.count
    )
      throw letterError(
        "NXT appeal history is incomplete. No duplicate appeal will be added.",
      );
    return result.value;
  }
  return {
    async catalog() {
      const result = await request(
        "/fundraising/v1/appeals?include_inactive=true&limit=5000",
      );
      return completeAppealCatalog(result);
    },
    appeals,
    async profile(id) {
      id = letterRecordId(id);
      const profile = await request(`/constituent/v1/constituents/${id}`);
      if (
        String(profile?.id) !== id ||
        !["Individual", "Organization"].includes(profile.type)
      )
        throw letterError(
          "The constituent identity could not be verified. No appeal was added.",
        );
      return profile;
    },
    create(id, appeal, date, comments) {
      id = letterRecordId(id);
      assertNxtAppealComments(comments);
      if (Number(id) > 2147483647)
        throw letterError(
          "This constituent ID cannot be used with the NXT appeal endpoint.",
        );
      return request("/nxt-data-integration/v1/re/constitappeals", "POST", {
        constituent_id: Number(id),
        appeal_description: appeal.description,
        appeal_date: date,
        comments,
      });
    },
  };
}

function resolveAppeal(catalog, requested) {
  const appeal = appealByLookupCode(catalog, requested, "exclusion");
  return {
    id: letterRecordId(appeal.id),
    lookupId: appeal.lookup_id,
    description: appeal.description,
  };
}

export async function saveExclusionAppealPolicy(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  client = exclusionAppealClient(ctx),
) {
  if (!state.settings || body.confirm !== true)
    throw letterError(
      "Confirm these are dedicated exclusion appeals for this period, not letter-sent appeals.",
    );
  const hierarchy = letterHierarchy(definitions, state.settings);
  if (
    state.settings.sourceMode !== "society_queries" ||
    definitions.some(
      (d) =>
        d.active &&
        d.basis === "annual" &&
        !hierarchy.some((h) => h.key === d.key),
    )
  )
    throw letterError(
      "Include every active annual society in the combined membership queries before configuring exclusion appeals.",
    );
  if (!hierarchy.length || hierarchy.length > 10)
    throw letterError("Configure 1-10 societies first.");
  if (["running", "paused"].includes(state.readiness?.job?.status))
    throw letterError(
      "Stop the readiness check before changing exclusion appeal settings.",
      409,
    );
  const catalog = await client.catalog();
  const appeals = {};
  const ids = new Set(
    Object.values(state.readiness?.policy?.appeals || {}).map((a) => a.id),
  );
  for (const tier of hierarchy) {
    const appeal = resolveAppeal(catalog, body.appeals?.[tier.key]);
    if (ids.has(appeal.id))
      throw letterError(
        "Each society needs a distinct exclusion appeal, separate from letter-sent appeals.",
      );
    ids.add(appeal.id);
    appeals[tier.key] = appeal;
  }
  state.readiness = {
    ...state.readiness,
    results: {},
    exclusionPolicy: {
      appeals,
      periodKey: letterPeriod(state.settings, today).key,
      hierarchySignature: signature(hierarchy),
      savedAt: new Date().toISOString(),
      savedBy: ctx.user.id,
    },
  };
  await store.save(state);
}

export function prepareExclusionAppeal(state, definitions, today, body) {
  const { policy, current } = exclusionAppealWorkspace(
    state,
    definitions,
    today,
  );
  if (!current || body.confirmNxt !== true)
    throw letterError(
      "Verify the exclusion appeal settings and confirm the NXT update first.",
    );
  const row = state.snapshot?.rows?.find(
    (r) => r.householdId === body.householdId,
  );
  const appeal = policy.appeals?.[row?.societyKey];
  if (
    !row ||
    !appeal ||
    !row.members?.length ||
    row.members.length > 2 ||
    new Set(row.members).size !== row.members.length
  )
    throw letterError(
      "Refresh and review this household and its highest qualifying society first.",
    );
  const hierarchy = letterHierarchy(definitions, state.settings);
  if (
    state.settings.sourceMode !== "society_queries" ||
    definitions.some(
      (d) =>
        d.active &&
        d.basis === "annual" &&
        !hierarchy.some((h) => h.key === d.key),
    ) ||
    hierarchy.some(
      (tier) =>
        !(state.snapshot?.sources || []).some((s) => s.societyKey === tier.key),
    )
  )
    throw letterError(
      "Refresh every annual society query before choosing the highest exclusion appeal.",
    );
  const highest = hierarchy.find((tier) =>
    (row.qualifiedKeys || [row.societyKey]).includes(tier.key),
  );
  if (highest?.key !== row.societyKey)
    throw letterError(
      "The society hierarchy changed. Refresh membership before recording the exclusion.",
    );
  if (!validDate(body.exclusionDate) || body.exclusionDate > today)
    throw letterError("Enter a valid exclusion date, no later than today.");
  if (
    typeof body.reason !== "string" ||
    !body.reason.trim() ||
    body.reason.trim().length > NXT_APPEAL_COMMENT_LIMIT
  )
    throw letterError(
      "Enter an exclusion reason of 1-50 characters for the NXT comments.",
    );
  const generatedAt = Date.parse(state.snapshot?.generatedAt);
  if (
    !Number.isFinite(generatedAt) ||
    Date.now() - generatedAt < 0 ||
    Date.now() - generatedAt > 86400000 ||
    (state.job && state.job.status !== "complete")
  )
    throw letterError(
      "Finish a membership refresh less than 24 hours old before recording exclusions in NXT.",
    );
  return {
    appeal: { ...appeal },
    societyKey: row.societyKey,
    societyName: row.societyName,
    date: body.exclusionDate,
    comments: body.reason.trim(),
    memberNames: row.memberNames || [],
    members: row.members.map((id) => ({
      id: letterRecordId(id),
      status: "pending",
    })),
    status: "pending",
    message: "Excluded in the app. NXT appeal updates are pending.",
  };
}

const matching = (rows, appeal) =>
  rows.filter((r) => String(r.appeal.id) === appeal.id);
const exact = (row, nxt) =>
  row.comments === nxt.comments && row.date?.slice(0, 10) === nxt.date;
const normalName = (s) =>
  String(s || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();

export async function syncExclusionAppeal(
  state,
  item,
  store,
  ctx,
  client = exclusionAppealClient(ctx),
  verifyOnly = false,
  automatic = false,
) {
  if (!item || item.restoredAt || !item.nxt)
    throw letterError("Choose an active NXT-linked exclusion.");
  const nxt = item.nxt;
  if (!automatic) assertLetterAppealPauseEnded([nxt]);
  if (automatic) {
    if (!verifyOnly) throw letterError("Automatic checks must be read-only.");
    if (!beginAutomaticAppealCheck(nxt)) return;
    await store.save(state);
  }
  let verificationError;
  try {
    const found = resolveAppeal(await client.catalog(), nxt.appeal);
    if (found.id !== nxt.appeal.id)
      throw letterError(
        "The exclusion appeal changed in NXT. No new assignments were made.",
      );
    const history = {};
    // Verify the entire household before posting for either member.
    for (const member of nxt.members) {
      const profile = await client.profile(member.id);
      const others = nxt.members.filter((m) => m.id !== member.id);
      const name = nxt.memberNames.find((m) => m.constituentId === member.id);
      if (
        others.length
          ? profile.type !== "Individual" ||
            String(profile.spouse?.id) !== others[0].id
          : !!profile.spouse
      )
        throw letterError(
          "The NXT spouse links changed. Review the household; no new assignments were made.",
        );
      if (
        profile.type === "Individual" &&
        (!name ||
          normalName(name.firstName) !== normalName(profile.first) ||
          normalName(name.lastName) !== normalName(profile.last))
      )
        throw letterError(
          "A constituent name changed. Review the household before continuing.",
        );
      history[member.id] = await client.appeals(member.id);
    }
    for (const member of nxt.members) {
      const matches = matching(history[member.id], nxt.appeal);
      if (matches.length > 1)
        throw letterError(
          "Multiple copies of the exclusion appeal already exist. Review NXT; none were added.",
        );
      if (member.status === "uncertain") {
        const verified =
          matches.length === 1 &&
          exact(matches[0], nxt) &&
          (!member.assignmentId ||
            String(matches[0].id) === member.assignmentId);
        if (!verified)
          throw letterError(
            "An earlier NXT submission is unconfirmed. It will not be sent again. Compare NXT before continuing.",
          );
        member.status = "verified";
        member.assignmentId = String(matches[0].id);
      } else if (matches.length) {
        member.status = finished(member) ? member.status : "existing";
        member.assignmentId = String(matches[0].id);
      } else if (finished(member)) {
        throw letterError(
          "A previously confirmed exclusion appeal is no longer in NXT. It was not recreated. Review before restoring.",
        );
      }
    }
    await store.save(state);
    if (!verifyOnly)
      for (const member of nxt.members) {
        if (finished(member)) continue;
        assertNxtAppealComments(nxt.comments);
        // Persist before POST. A timeout, process exit, or lost response must never
        // turn an uncertain create into an automatic duplicate submission.
        member.status = "uncertain";
        member.attemptedAt = new Date().toISOString();
        await store.save(state);
        let result;
        try {
          result = await client.create(
            member.id,
            nxt.appeal,
            nxt.date,
            nxt.comments,
          );
        } catch (error) {
          member.lastWriteFailure = exclusionFailureDiagnostic(error);
          // Only a definitive rejected POST can become retryable. Errors from
          // read-back verification, timeouts and 5xx remain uncertain.
          if (
            [400, 401, 403, 404, 413, 415, 422, 429].includes(error.httpStatus)
          ) {
            member.status = "pending";
            member.rejectedAt = new Date().toISOString();
            await store.save(state);
            throw letterError(rejectionMessage(member));
          }
          throw error;
        }
        if (!result?.id)
          throw letterError(
            "NXT did not confirm the appeal assignment. Verify its status; it will not be sent again.",
          );
        member.assignmentId = letterRecordId(result.id);
        await store.save(state);
        const matches = matching(await client.appeals(member.id), nxt.appeal);
        if (
          matches.length !== 1 ||
          String(matches[0].id) !== member.assignmentId ||
          !exact(matches[0], nxt)
        )
          throw letterError(
            "NXT accepted an appeal but its details need verification. It will not be sent again.",
          );
        member.status = "verified";
        await store.save(state);
      }
    nxt.status = nxt.members.every(finished) ? "complete" : "pending";
    delete nxt.verificationFailure;
    const rejected = nxt.members.find((m) => !finished(m) && m.rejectedAt);
    nxt.message =
      nxt.status === "complete"
        ? "Exclusion appeal confirmed for every household member. Existing assignments were preserved; no letter was sent."
        : rejected
          ? rejectionMessage(rejected)
          : "Existing submissions checked. Continue to apply the appeal only to remaining members.";
  } catch (error) {
    verificationError = error;
    nxt.verificationFailure = exclusionFailureDiagnostic(error);
    nxt.status = "needs_review";
    nxt.message = error.status
      ? error.message
      : "NXT could not finish this update. The household remains excluded. Verify NXT status before continuing; uncertain submissions are never resent.";
  }
  nxt.checkedAt = new Date().toISOString();
  if (automatic) finishAutomaticAppealCheck(nxt, verificationError);
  await store.save(state);
}

export async function verifyExclusionRemoval(
  item,
  ctx,
  client = exclusionAppealClient(ctx),
) {
  if (!item?.nxt) return;
  if (item.nxt.members.some((m) => m.status === "uncertain"))
    throw letterError(
      "Verify the uncertain NXT submission before restoring. An unconfirmed exclusion cannot be safely removed from the app.",
    );
  for (const member of item.nxt.members) {
    if (matching(await client.appeals(member.id), item.nxt.appeal).length)
      throw letterError(
        "Remove the exclusion appeal from each household member in NXT first, then verify removal and restore here. The app will not delete NXT history.",
      );
  }
}
