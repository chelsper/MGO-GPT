import {
  executeBlackbaudListQuery,
  getBlackbaudConstituentById,
  getBlackbaudFundraiserById,
} from "@/app/api/utils/blackbaud";
import { buildStandingsActionQuery } from "@/app/api/utils/standingsActionQuery";
import { normalizeBlackbaudFundraiserAliasIds } from "@/app/api/utils/closedFyGiftTotals";
import { getNxtActionCategory, getNxtActionType, isHighValueAction } from "@/utils/highValueActions";
import { isInStandingsPeriod } from "@/utils/standingsPeriods";

function getNestedValue(source, path) {
  return path.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function firstDefined(source, paths) {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function getActionDate(action) {
  return firstDefined(action, [
    "action_date",
    "action_summary.action_date",
    "date",
    "actionDate",
  ]);
}

function getActionId(action) {
  return String(
    firstDefined(action, ["system_record_id", "id", "action_id", "actionId"]) || "",
  ).trim();
}

function getActionFundraiserId(fundraiser) {
  return String(
    firstDefined(fundraiser, [
      "system_record_id",
      "fundraiser_id",
      "fundraiserId",
      "constituent_id",
      "constituentId",
      "id",
      "lookup_id",
      "lookupId",
    ]) || "",
  ).trim();
}

function getActionFundraiserName(fundraiser) {
  const direct = String(
    firstDefined(fundraiser, [
      "fundraiser_name",
      "fundraiserName",
      "name",
      "full_name",
      "fullName",
      "display_name",
      "displayName",
    ]) || "",
  ).trim();

  if (direct) return direct;

  const first = String(
    firstDefined(fundraiser, ["first_name", "firstName", "first"]) || "",
  ).trim();
  const middle = String(
    firstDefined(fundraiser, ["middle_name", "middleName", "middle"]) || "",
  ).trim();
  const last = String(
    firstDefined(fundraiser, ["last_name", "lastName", "last"]) || "",
  ).trim();

  return [first, middle, last].filter(Boolean).join(" ").trim();
}

function getActionFundraiserCandidates(action) {
  const arrayPaths = [
    "fundraisers",
    "solicitors",
    "assigned_fundraisers",
    "assignedFundraisers",
    "fundraiser_assignments",
    "fundraiserAssignments",
    "action_fundraisers",
    "actionFundraisers",
    "fundraiser_credits",
    "fundraiserCredits",
    "solicitor_credits",
    "solicitorCredits",
  ];
  const scalarPaths = [
    "fundraiser_id",
    "fundraiserId",
    "fundraiser",
    "solicitor",
    "primary_fundraiser",
    "primaryFundraiser",
    "assigned_fundraiser",
    "assignedFundraiser",
    "fundraiser_credit",
    "fundraiserCredit",
    "solicitor_credit",
    "solicitorCredit",
    "fundraiser_name",
    "fundraiserName",
    "solicitor_name",
    "solicitorName",
  ];

  const candidates = [];

  for (const path of arrayPaths) {
    const value = getNestedValue(action, path);
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item) continue;
      if (typeof item === "string" || typeof item === "number") {
        candidates.push({ id: String(item).trim() });
      } else {
        candidates.push(item);
      }
    }
  }

  for (const path of scalarPaths) {
    const value = getNestedValue(action, path);
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string" || typeof value === "number") {
      const textValue = String(value).trim();
      if (!textValue) continue;
      if (/^\d+$/.test(textValue)) {
        candidates.push({ id: textValue });
      } else {
        candidates.push({ fundraiser_name: textValue, name: textValue });
      }
      continue;
    }
    candidates.push(value);
  }

  return candidates;
}

function getActionConstituentId(action) {
  return String(
    firstDefined(action, [
      "constituent_id",
      "constituentId",
      "constituent_summary.system_record_id",
      "constituentSummary.systemRecordId",
      "action_summary.constituent_summary.system_record_id",
      "actionSummary.constituentSummary.systemRecordId",
      "constituent_summary.lookup_id",
      "constituentSummary.lookupId",
      "constituent.id",
      "value.constituent_id",
      "value.constituentId",
      "value.constituent.id",
    ]) || "",
  ).trim();
}

function getActionConstituentName(action) {
  return String(
    firstDefined(action, [
      "constituent_name",
      "constituentName",
      "constituent_summary.formatted_name",
      "constituentSummary.formattedName",
      "action_summary.constituent_summary.formatted_name",
      "actionSummary.constituentSummary.formattedName",
      "constituent.name",
      "constituent.display_name",
      "constituent.displayName",
      "value.constituent_name",
      "value.constituentName",
      "value.constituent.name",
      "name",
    ]) || "",
  ).trim();
}

function getActionCategory(action) {
  return getNxtActionCategory(action);
}

function getActionSummary(action) {
  return String(
    firstDefined(action, [
      "summary",
      "action_summary.note_summary",
      "actionSummary.noteSummary",
      "action_summary.note",
      "actionSummary.note",
      "title",
      "description",
      "notes",
      "comment",
      "value.summary",
      "value.title",
      "value.description",
      "value.notes",
    ]) || "",
  ).trim();
}

function normalizeActionRecord(action) {
  return {
    actionId: getActionId(action),
    date: getActionDate(action),
    category: getActionCategory(action),
    type: getNxtActionType(action),
    highValue: isHighValueAction(action),
    summary: getActionSummary(action),
    blackbaudConstituentId: getActionConstituentId(action),
    constituentName: getActionConstituentName(action),
  };
}

function summarizeActionFundraisers(action) {
  return getActionFundraiserCandidates(action).map((fundraiser) => ({
    fundraiserId: getActionFundraiserId(fundraiser) || null,
    fundraiserName: getActionFundraiserName(fundraiser) || null,
    raw: fundraiser,
  }));
}

function normalizePersonName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeWorkspaceFundraiserIds(user) {
  const results = [];
  const seen = new Set();
  const candidates = [
    String(user?.blackbaud_constituent_id || "").trim(),
    // Lookup IDs are not system record IDs and must not match another solicitor.
    ...normalizeBlackbaudFundraiserAliasIds(user?.blackbaud_fundraiser_alias_ids),
  ];

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    results.push(candidate);
  }

  return results;
}

function isWorkspaceFundraiserMatchByName(fundraiserName, workspaceUser) {
  const workspaceTokens = normalizePersonName(
    workspaceUser?.name || workspaceUser?.full_name || workspaceUser?.display_name,
  );
  const fundraiserTokens = normalizePersonName(fundraiserName);

  if (workspaceTokens.length < 2 || fundraiserTokens.length < 2) {
    return false;
  }

  const workspaceFirst = workspaceTokens[0];
  const workspaceLast = workspaceTokens[workspaceTokens.length - 1];
  const fundraiserFirst = fundraiserTokens[0];
  const fundraiserLast = fundraiserTokens[fundraiserTokens.length - 1];

  if (workspaceFirst === fundraiserFirst && workspaceLast === fundraiserLast) {
    return true;
  }

  const workspaceFull = workspaceTokens.join(" ");
  const fundraiserFull = fundraiserTokens.join(" ");

  return (
    fundraiserFull === workspaceFull
  );
}

async function resolveActionFundraiserDisplayName({
  fundraiser,
  workspaceUser,
  authUserId,
  apiUserId,
  origin,
  cache,
}) {
  const directName = getActionFundraiserName(fundraiser);
  if (directName) {
    return directName;
  }

  const fundraiserId = getActionFundraiserId(fundraiser);
  if (!fundraiserId) {
    return null;
  }

  if (cache.has(fundraiserId)) {
    return cache.get(fundraiserId) || null;
  }

  const fundraiserRecord = await getBlackbaudFundraiserById({
    userId: apiUserId,
    authUserId,
    origin,
    fundraiserId,
  }).catch(() => null);

  const fundraiserRecordName = String(fundraiserRecord?.name || "").trim() || null;
  if (fundraiserRecordName) {
    cache.set(fundraiserId, fundraiserRecordName);
    return fundraiserRecordName;
  }

  const resolved = await getBlackbaudConstituentById({
    userId: apiUserId,
    authUserId,
    origin,
    constituentId: fundraiserId,
  }).catch(() => null);

  const resolvedName = String(resolved?.name || "").trim() || null;
  cache.set(fundraiserId, resolvedName);
  return resolvedName;
}

async function listScopedBlackbaudActions({
  authUserId,
  normalizedUsers,
  origin,
  pageLimit,
  maxPages,
  fiscalYearStart,
  fiscalYearEnd,
  fiscalYears,
}) {
  const fundraiserIds = [...new Set(normalizedUsers.flatMap(normalizeWorkspaceFundraiserIds))];
  const windows = fiscalYears || [{ startsOn: fiscalYearStart, endsOn: fiscalYearEnd }];
  if (!windows.length) throw new Error("Team Standings requires an action date range.");
  // Validate every window before making any NXT calls. One connection reads the
  // explicitly selected solicitors; neither errors nor empty results widen scope.
  const definitions = windows.map((window) => buildStandingsActionQuery({ fundraiserIds, ...window }));
  const actions = [];
  const attempts = [];
  for (const [index, definition] of definitions.entries()) {
    const rows = await executeBlackbaudListQuery({
      userId: authUserId,
      authUserId,
      origin,
      dataModelName: "renxt-action",
      definition,
      limit: Math.min(pageLimit, 1000),
      maxPages,
      requireComplete: true,
    });
    actions.push(...rows);
    attempts.push({ source: "list-v2-filtered", ...windows[index], totalCount: rows.length, error: null });
  }
  return {
    actions,
    connectionUserId: Number(authUserId) || null,
    source: "list-v2-filtered",
    attempts,
  };
}

export async function getNxtActionSummaryByWorkspaceUser({
  workspaceUsers,
  authUserId,
  origin,
  fiscalYearStart,
  fiscalYearEnd,
  fiscalYears,
  periods,
}) {
  const normalizedUsers = Array.isArray(workspaceUsers)
    ? workspaceUsers.filter((user) => user?.id)
    : [];

  if (!normalizedUsers.length || !origin || !authUserId) {
    return new Map();
  }

  const identitySetsByUserId = new Map();
  for (const user of normalizedUsers) {
    identitySetsByUserId.set(
      Number(user.id),
      new Set(normalizeWorkspaceFundraiserIds(user)),
    );
  }

  const { actions } = await listScopedBlackbaudActions({
    authUserId,
    normalizedUsers,
    origin,
    pageLimit: 250,
    maxPages: 20,
    fiscalYearStart,
    fiscalYearEnd,
    fiscalYears,
  });

  const countsByUserId = new Map(
    normalizedUsers.map((user) => [Number(user.id), {
      actionsThisFY: identitySetsByUserId.get(Number(user.id))?.size ? 0 : null,
      highValueActionsThisFY: identitySetsByUserId.get(Number(user.id))?.size ? 0 : null,
      actions: [],
      ...(periods ? { periods: Object.fromEntries(Object.keys(periods).map((key) => [key, {
        actions: identitySetsByUserId.get(Number(user.id))?.size ? 0 : null,
        highValueActions: identitySetsByUserId.get(Number(user.id))?.size ? 0 : null,
      }])) } : {}),
    }]),
  );
  const seenActionIds = new Set();

  for (const action of actions) {
    const actionId = getActionId(action);
    if (actionId) {
      if (seenActionIds.has(actionId)) continue;
      seenActionIds.add(actionId);
    }

    const actionDate = getActionDate(action);
    const inRange = isInStandingsPeriod(actionDate, { startsOn: fiscalYearStart, endsOn: fiscalYearEnd });
    if (!inRange) {
      continue;
    }

    const fundraiserIds = new Set(
      getActionFundraiserCandidates(action)
        .map((fundraiser) => getActionFundraiserId(fundraiser))
        .filter(Boolean),
    );

    if (!fundraiserIds.size) continue;

    const normalizedAction = normalizeActionRecord(action);
    normalizedAction.date = actionDate;

    for (const [userId, identitySet] of identitySetsByUserId.entries()) {
      if (!identitySet?.size) continue;
      const matched = Array.from(identitySet).some((identity) => fundraiserIds.has(identity));
      if (!matched) continue;
      const current = countsByUserId.get(userId) || { actionsThisFY: 0, highValueActionsThisFY: 0, actions: [] };
      if (periods) for (const [key, period] of Object.entries(periods)) {
        if (!isInStandingsPeriod(normalizedAction.date, period)) continue;
        current.periods[key].actions += 1;
        if (normalizedAction.highValue) current.periods[key].highValueActions += 1;
      }
      if (!periods || isInStandingsPeriod(normalizedAction.date, periods.current)) {
        current.actionsThisFY += 1;
        if (normalizedAction.highValue) current.highValueActionsThisFY += 1;
        current.actions.push(normalizedAction);
      }
      countsByUserId.set(userId, current);
    }
  }

  for (const current of countsByUserId.values()) {
    current.actions.sort((left, right) => {
      const leftTime = left?.date ? new Date(left.date).getTime() : Number.NaN;
      const rightTime = right?.date ? new Date(right.date).getTime() : Number.NaN;
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime;
      }
      if (Number.isFinite(rightTime)) return 1;
      if (Number.isFinite(leftTime)) return -1;
      return String(left?.summary || "").localeCompare(String(right?.summary || ""));
    });
  }

  return countsByUserId;
}

export async function getNxtActionSummaryDiagnostic({
  workspaceUsers,
  authUserId,
  origin,
  fiscalYearStart,
  fiscalYearEnd,
}) {
  const normalizedUsers = Array.isArray(workspaceUsers)
    ? workspaceUsers.filter((user) => user?.id)
    : [];

  const identitySetsByUserId = new Map();
  for (const user of normalizedUsers) {
    identitySetsByUserId.set(
      Number(user.id),
      new Set(normalizeWorkspaceFundraiserIds(user)),
    );
  }

  const { actions, connectionUserId, source, attempts } = await listScopedBlackbaudActions({
    authUserId,
    normalizedUsers,
    origin,
    pageLimit: 250,
    maxPages: 40,
    fiscalYearStart,
    fiscalYearEnd,
  });
  const resolvedNameCache = new Map();
  const samples = [];
  const fetchedDateSamples = [];
  const matchedByUserId = new Map();
  const noFundraiserCount = { count: 0 };
  const outOfRangeCount = { count: 0 };

  for (const action of actions) {
    const actionDate = getActionDate(action);
    if (fetchedDateSamples.length < 20) {
      fetchedDateSamples.push({
        actionId: getActionId(action) || null,
        date: actionDate || null,
        category: getActionCategory(action) || null,
        constituentName: getActionConstituentName(action) || null,
      });
    }
    const inRange = isInStandingsPeriod(actionDate, { startsOn: fiscalYearStart, endsOn: fiscalYearEnd });
    if (!inRange) {
      outOfRangeCount.count += 1;
      continue;
    }

    const fundraiserCandidates = getActionFundraiserCandidates(action);
    if (!fundraiserCandidates.length) {
      noFundraiserCount.count += 1;
    }

    const fundraiserIds = new Set(
      fundraiserCandidates
        .map((fundraiser) => getActionFundraiserId(fundraiser))
        .filter(Boolean),
    );

    const userMatches = [];
    for (const [userId, identitySet] of identitySetsByUserId.entries()) {
      if (!identitySet?.size) continue;
      let matched = Array.from(identitySet).some((identity) => fundraiserIds.has(identity));
      let matchedBy = matched ? "id" : null;

      if (!matched) {
        const workspaceUser = normalizedUsers.find((user) => Number(user.id) === userId);
        if (workspaceUser) {
          for (const fundraiser of fundraiserCandidates) {
            const resolvedName = await resolveActionFundraiserDisplayName({
              fundraiser,
              workspaceUser,
              authUserId: connectionUserId || authUserId,
              apiUserId: connectionUserId || authUserId,
              origin,
              cache: resolvedNameCache,
            });
            if (resolvedName && isWorkspaceFundraiserMatchByName(resolvedName, workspaceUser)) {
              matched = true;
              matchedBy = "name";
              break;
            }
          }
        }
      }

      if (matched) {
        userMatches.push({
          userId,
          matchedBy,
        });
        const current = matchedByUserId.get(userId) || 0;
        matchedByUserId.set(userId, current + 1);
      }
    }

    if (samples.length < 40) {
      samples.push({
        actionId: getActionId(action) || null,
        date: actionDate || null,
        category: getActionCategory(action) || null,
        summary: getActionSummary(action) || null,
        constituentId: getActionConstituentId(action) || null,
        constituentName: getActionConstituentName(action) || null,
        fundraiserCandidates: summarizeActionFundraisers(action),
        matchedUsers: userMatches,
      });
    }
  }

  return {
    fiscalYearRange: {
      start: fiscalYearStart,
      end: fiscalYearEnd,
    },
    connectionUserId: connectionUserId || authUserId || null,
    source,
    attempts,
    totalActionsFetched: actions.length,
    outOfRangeCount: outOfRangeCount.count,
    noFundraiserCount: noFundraiserCount.count,
    fetchedDateSamples,
    workspaceUsers: normalizedUsers.map((user) => ({
      id: Number(user.id),
      name: user.name || null,
      email: user.email || null,
      blackbaudConstituentId: user.blackbaud_constituent_id || null,
      blackbaudLookupId: user.blackbaud_lookup_id || null,
      blackbaudFundraiserAliasIds: normalizeBlackbaudFundraiserAliasIds(
        user.blackbaud_fundraiser_alias_ids,
      ),
    })),
    matchedByUser: Array.from(matchedByUserId.entries()).map(([userId, count]) => ({
      userId,
      count,
    })),
    sampledActions: samples,
  };
}
