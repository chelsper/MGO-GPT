import { getBlackbaudQueryAvailableFields } from "@/app/api/utils/blackbaud";
import {
  getCachedReportSnapshotWithMetadata,
  saveReportSnapshot,
} from "@/app/api/utils/reportCache";

const CUSTOM_FIELD_QUERY_METADATA_CACHE_KEY =
  "metadata:query-api:custom-field-filter-fields:v3";
const CUSTOM_FIELD_QUERY_METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONSTITUENT_QUERY_TYPE_ID = 18;
const DIRECT_QUERY_CATEGORY_ID = 81;
const MAX_DISCOVERY_NODES = 4;
const MAX_DISCOVERY_DEPTH = 3;

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeComparableText(value) {
  return normalizeText(value).toLocaleLowerCase("en-US");
}

function getArray(value, keys) {
  if (Array.isArray(value)) return value;

  const containers = [value, value?.value, value?.data, value?.result];
  for (const container of containers) {
    if (!container || typeof container !== "object") continue;
    for (const key of keys) {
      if (Array.isArray(container[key])) return container[key];
    }
  }

  return [];
}

function getNodeId(node) {
  const value = node?.id ?? node?.node_id ?? node?.nodeId;
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

function getNodeName(node) {
  return normalizeText(node?.name || node?.display_name || node?.displayName || node?.label);
}

function getFieldId(field) {
  const value = field?.id ?? field?.query_field_id ?? field?.queryFieldId;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getFieldNames(field) {
  const nodePath = getArray(field?.node_path || field?.nodePath, ["value", "items"])
    .map(getNodeName)
    .filter(Boolean);
  return [
    field?.selected_field_name,
    field?.selectedFieldName,
    field?.available_field_name,
    field?.availableFieldName,
    field?.name,
    field?.display_name,
    field?.displayName,
    ...nodePath,
  ]
    .map(normalizeText)
    .filter(Boolean);
}

function hasEqualsOperator(field) {
  const operators = getArray(field?.allowed_filter_operators || field?.allowedFilterOperators, [
    "value",
    "items",
  ]).map(normalizeComparableText);
  return operators.includes("equals");
}

function isCustomFieldContext(parts) {
  return parts.some((part) => /custom\s*field|specific\s*custom/i.test(part));
}

function hasExactName(parts, expectedName) {
  const expected = normalizeComparableText(expectedName);
  return parts.some((part) => normalizeComparableText(part) === expected);
}

function isDescriptionField(parts) {
  return parts.some((part) => /\bdescription\b/i.test(part));
}

function getMetadataCacheKey(fieldCategory) {
  return `${CUSTOM_FIELD_QUERY_METADATA_CACHE_KEY}:${encodeURIComponent(
    normalizeComparableText(fieldCategory),
  )}`;
}

function flattenCandidateField(field, ancestorNames, fieldCategory) {
  const id = getFieldId(field);
  if (!id || !hasEqualsOperator(field)) return null;

  const names = [...ancestorNames, ...getFieldNames(field)];
  if (
    !isCustomFieldContext(names) ||
    !hasExactName(names, fieldCategory) ||
    !isDescriptionField(names)
  ) {
    return null;
  }

  return {
    id,
    names: Array.from(new Set(names)),
  };
}

function hasFreshMetadata(snapshot) {
  const updatedAt = snapshot?.updatedAt ? new Date(snapshot.updatedAt).getTime() : 0;
  return (
    Array.isArray(snapshot?.payload?.fields) &&
    snapshot.payload.fields.length > 0 &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt < CUSTOM_FIELD_QUERY_METADATA_TTL_MS
  );
}

async function discoverCustomFieldFilterFields({
  userId,
  authUserId,
  origin,
  fieldCategory,
}) {
  const seenNodeIds = new Set();
  const queue = [{ nodeId: 0, depth: 0, ancestorNames: [] }];
  const candidates = [];

  while (queue.length && seenNodeIds.size < MAX_DISCOVERY_NODES) {
    const current = queue.shift();
    if (!current || seenNodeIds.has(current.nodeId)) continue;
    seenNodeIds.add(current.nodeId);

    const payload = await getBlackbaudQueryAvailableFields({
      userId,
      authUserId,
      origin,
      queryTypeId: CONSTITUENT_QUERY_TYPE_ID,
      nodeId: current.nodeId,
    });
    const fields = getArray(payload, ["fields", "available_fields", "availableFields"]);
    fields.forEach((field) => {
      const candidate = flattenCandidateField(field, current.ancestorNames, fieldCategory);
      if (candidate) candidates.push(candidate);
    });

    if (current.depth >= MAX_DISCOVERY_DEPTH) continue;
    const nodes = getArray(payload, ["nodes", "child_nodes", "childNodes"]);
    nodes.forEach((node) => {
      const nodeId = getNodeId(node);
      const nodeName = getNodeName(node);
      if (nodeId === null || seenNodeIds.has(nodeId)) return;

      const nextNames = [...current.ancestorNames, nodeName].filter(Boolean);
      const withinCustomFieldBranch = isCustomFieldContext(nextNames);
      const isCategoryBranch = hasExactName(nextNames, fieldCategory);

      // The available-fields tree is broad. A direct custom-field refresh only
      // needs the custom-field branch and the selected category beneath it.
      if (current.nodeId === 0 && !withinCustomFieldBranch) return;
      if (current.nodeId !== 0 && !withinCustomFieldBranch) return;
      if (withinCustomFieldBranch && !isCategoryBranch && current.depth > 1) {
        return;
      }
      queue.push({ nodeId, depth: current.depth + 1, ancestorNames: nextNames });
    });
  }

  const fields = Array.from(
    candidates.reduce((map, candidate) => {
      const existing = map.get(candidate.id);
      if (!existing || candidate.names.length > existing.names.length) {
        map.set(candidate.id, candidate);
      }
      return map;
    }, new Map()).values(),
  );

  if (!fields.length) {
    throw new Error(
      "NXT did not expose a filterable custom-field Description for a direct report. Refresh the NXT custom-field choices and try again.",
    );
  }

  await saveReportSnapshot(getMetadataCacheKey(fieldCategory), {
    fields,
    discoveredAt: new Date().toISOString(),
  });
  return fields;
}

async function getCustomFieldFilterFields(context) {
  const cacheKey = getMetadataCacheKey(context.fieldCategory);
  const cachedSnapshot = await getCachedReportSnapshotWithMetadata(
    cacheKey,
  );
  if (hasFreshMetadata(cachedSnapshot)) {
    return cachedSnapshot.payload.fields;
  }
  return discoverCustomFieldFilterFields(context);
}

function scoreFieldCandidate(field, fieldCategory) {
  const category = normalizeComparableText(fieldCategory);
  const names = Array.isArray(field?.names) ? field.names.map(normalizeComparableText) : [];
  const combined = names.join(" | ");
  let score = 0;

  if (names.includes(category)) score += 120;
  if (names.some((name) => /description/.test(name))) score += 35;
  if (names.some((name) => /specific\s*custom\s*field/.test(name))) score += 20;
  if (names.some((name) => /custom\s*field/.test(name))) score += 10;
  if (names.some((name) => name === `${category} description`)) score += 120;
  if (combined.includes(`${category} description`)) score += 80;
  return score;
}

function selectDescriptionFilterField(fields, fieldCategory) {
  const ranked = (Array.isArray(fields) ? fields : [])
    .filter((field) => {
      const names = Array.isArray(field?.names) ? field.names : [];
      return hasExactName(names, fieldCategory) && isDescriptionField(names);
    })
    .map((field) => ({ field, score: scoreFieldCandidate(field, fieldCategory) }))
    .sort((left, right) => right.score - left.score);
  const winner = ranked[0];

  if (!winner?.field?.id || winner.score < 155) {
    throw new Error(
      `NXT did not expose a filterable Description field for custom-field category "${fieldCategory}". The report was saved safely; refresh the NXT custom-field choices and try again.`,
    );
  }

  return Number(winner.field.id);
}

// Creates an ad-hoc constituent query used only at explicit/scheduled report
// refresh time. The completed job's row_count is the only result retained.
export async function getDirectCustomFieldQueryDefinition({
  userId,
  authUserId,
  origin,
  fieldCategory,
  fieldDescription,
}) {
  const category = normalizeText(fieldCategory);
  const description = normalizeText(fieldDescription);
  if (!category || !description) {
    throw new Error("An exact NXT custom-field category and description are required.");
  }

  const fields = await getCustomFieldFilterFields({
    userId,
    authUserId,
    origin,
    fieldCategory: category,
  });
  const queryFieldId = selectDescriptionFilterField(fields, category);

  return {
    type_id: CONSTITUENT_QUERY_TYPE_ID,
    category_id: DIRECT_QUERY_CATEGORY_ID,
    format: "Dynamic",
    sql_generation_mode: "Query",
    result_layout: "MultiRow",
    suppress_duplicates: true,
    advanced_processing_options: {
      use_alternate_sql_code_table_fields: false,
      use_alternate_sql_multiple_attributes: false,
    },
    constituent_filters: {
      include_deceased: true,
      include_inactive: true,
      include_no_valid_addresses: true,
    },
    filter_fields: [
      {
        compare_type: "None",
        filter_values: [description],
        left_parenthesis: false,
        operator: "Equals",
        query_field_id: queryFieldId,
        right_parenthesis: false,
      },
    ],
    select_fields: [],
  };
}
