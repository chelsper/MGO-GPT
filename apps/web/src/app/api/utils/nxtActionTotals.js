import { listBlackbaudActions } from "@/app/api/utils/blackbaud";
import { normalizeBlackbaudFundraiserAliasIds } from "@/app/api/utils/closedFyGiftTotals";

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
    "completed_date",
    "completedDate",
    "date",
    "action_date",
    "actionDate",
    "date_added",
    "dateAdded",
    "created_at",
    "createdAt",
  ]);
}

function getActionId(action) {
  return String(
    firstDefined(action, ["id", "action_id", "actionId"]) || "",
  ).trim();
}

function getActionFundraiserId(fundraiser) {
  return String(
    firstDefined(fundraiser, [
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

function getActionFundraiserCandidates(action) {
  const arrayPaths = [
    "fundraisers",
    "solicitors",
    "assigned_fundraisers",
    "assignedFundraisers",
    "fundraiser_assignments",
    "fundraiserAssignments",
  ];
  const scalarPaths = [
    "fundraiser_id",
    "fundraiserId",
    "constituent_id",
    "constituentId",
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
    candidates.push({ id: String(value).trim() });
  }

  return candidates;
}

function getActionConstituentId(action) {
  return String(
    firstDefined(action, [
      "constituent_id",
      "constituentId",
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
  return String(
    firstDefined(action, [
      "category",
      "action_category",
      "actionCategory",
      "type",
      "type.name",
      "type.description",
      "interaction_type",
      "interactionType",
      "status",
    ]) || "",
  ).trim();
}

function getActionSummary(action) {
  return String(
    firstDefined(action, [
      "summary",
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
    summary: getActionSummary(action),
    blackbaudConstituentId: getActionConstituentId(action),
    constituentName: getActionConstituentName(action),
  };
}

function normalizeWorkspaceFundraiserIds(user) {
  const results = [];
  const seen = new Set();
  const candidates = [
    String(user?.blackbaud_constituent_id || "").trim(),
    String(user?.blackbaud_lookup_id || "").trim(),
    ...normalizeBlackbaudFundraiserAliasIds(user?.blackbaud_fundraiser_alias_ids),
  ];

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    results.push(candidate);
  }

  return results;
}

function isDateInRange(value, startDate, endDate) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(parsed)) return false;
  return parsed >= startDate && parsed <= endDate;
}

async function listBlackbaudActionsWithFallback({
  authUserId,
  normalizedUsers,
  origin,
  pageLimit,
  maxPages,
}) {
  const candidateUserIds = [];
  const seen = new Set();

  for (const candidate of [authUserId, ...normalizedUsers.map((user) => user?.id)]) {
    const userId = Number(candidate);
    if (!Number.isFinite(userId) || seen.has(userId)) continue;
    seen.add(userId);
    candidateUserIds.push(userId);
  }

  for (const candidateUserId of candidateUserIds) {
    try {
      return await listBlackbaudActions({
        userId: candidateUserId,
        authUserId: candidateUserId,
        origin,
        pageLimit,
        maxPages,
      });
    } catch {
      // Try the next connected workspace user before giving up.
    }
  }

  return [];
}

export async function getNxtActionSummaryByWorkspaceUser({
  workspaceUsers,
  authUserId,
  origin,
  fiscalYearStart,
  fiscalYearEnd,
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

  const startDate = new Date(`${fiscalYearStart}T00:00:00Z`).getTime();
  const endDate = new Date(`${fiscalYearEnd}T23:59:59Z`).getTime();
  const actions = await listBlackbaudActionsWithFallback({
    authUserId,
    normalizedUsers,
    origin,
    pageLimit: 250,
    maxPages: 20,
  });

  const countsByUserId = new Map(
    normalizedUsers.map((user) => [Number(user.id), { actionsThisFY: 0, actions: [] }]),
  );
  const seenActionIds = new Set();

  for (const action of actions) {
    const actionId = getActionId(action);
    if (actionId) {
      if (seenActionIds.has(actionId)) continue;
      seenActionIds.add(actionId);
    }

    if (!isDateInRange(getActionDate(action), startDate, endDate)) {
      continue;
    }

    const fundraiserIds = new Set(
      getActionFundraiserCandidates(action)
        .map((fundraiser) => getActionFundraiserId(fundraiser))
        .filter(Boolean),
    );

    if (!fundraiserIds.size) continue;

    const normalizedAction = normalizeActionRecord(action);

    for (const [userId, identitySet] of identitySetsByUserId.entries()) {
      if (!identitySet?.size) continue;
      const matched = Array.from(identitySet).some((identity) => fundraiserIds.has(identity));
      if (!matched) continue;
      const current = countsByUserId.get(userId) || { actionsThisFY: 0, actions: [] };
      current.actionsThisFY += 1;
      current.actions.push(normalizedAction);
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
