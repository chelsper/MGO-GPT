import { getCustomFieldReportMetadata } from "@/app/api/utils/reportRegistry";

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_FIELD_VALUE_LENGTH = 200;
const MAX_QUERY_ID_LENGTH = 40;

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function parseSpecificUserIds(value) {
  let values = value;
  if (typeof values === "string") {
    try {
      values = JSON.parse(values);
    } catch {
      values = [];
    }
  }
  if (!Array.isArray(values)) return [];

  return [
    ...new Set(
      values
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry > 0),
    ),
  ];
}

export function customFieldReportKey(slug) {
  return `custom-field:${String(slug || "").trim()}`;
}

export function customFieldReportCacheKey(slug) {
  return `report:custom-field:${String(slug || "").trim()}`;
}

export function normalizeCustomFieldReportInput(value = {}) {
  return {
    title: normalizeText(value?.title),
    description: normalizeText(value?.description),
    fieldCategory: normalizeText(value?.fieldCategory),
    fieldDescription: normalizeText(value?.fieldDescription),
    sourceQueryId: normalizeText(value?.sourceQueryId),
    sourceQueryName: normalizeText(value?.sourceQueryName),
    specificUserIds: parseSpecificUserIds(value?.specificUserIds),
    active: Boolean(value?.active),
  };
}

export function validateCustomFieldReportInput(value) {
  const input = normalizeCustomFieldReportInput(value);

  if (!input.title || input.title.length > MAX_TITLE_LENGTH) {
    return "Report names must be between 1 and 120 characters.";
  }
  if (input.description.length > MAX_DESCRIPTION_LENGTH) {
    return "Report descriptions must be 1,000 characters or fewer.";
  }
  if (!input.fieldCategory || input.fieldCategory.length > MAX_FIELD_VALUE_LENGTH) {
    return "Enter the exact NXT custom field category (200 characters or fewer).";
  }
  if (!input.fieldDescription || input.fieldDescription.length > MAX_FIELD_VALUE_LENGTH) {
    return "Enter the exact NXT custom field description (200 characters or fewer).";
  }
  if (!/^\d{1,40}$/.test(input.sourceQueryId)) {
    return "Enter a numeric saved NXT query system record ID.";
  }
  if (input.sourceQueryName.length > MAX_FIELD_VALUE_LENGTH) {
    return "The saved NXT query name must be 200 characters or fewer.";
  }
  if (input.active && input.specificUserIds.length === 0) {
    return "Select at least one active user before enabling this report.";
  }

  return "";
}

export function createCustomFieldReportSlug(title, suffix = "") {
  const normalizedTitle = normalizeText(title)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const normalizedSuffix = String(suffix || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);

  return `${normalizedTitle || "custom-field-report"}-${normalizedSuffix || Date.now().toString(36)}`;
}

export function serializeCustomFieldReport(record, canView = false) {
  const slug = String(record?.slug || "").trim();
  const metadata = getCustomFieldReportMetadata(slug);
  return {
    ...metadata,
    id: Number(record?.id || 0),
    key: customFieldReportKey(slug),
    slug,
    href: metadata.href,
    title: String(record?.title || "").trim(),
    description: String(record?.description || "").trim(),
    fieldCategory: String(record?.field_category || "").trim(),
    fieldDescription: String(record?.field_description || "").trim(),
    sourceQueryId: String(record?.source_query_id || "").trim(),
    sourceQueryName: String(record?.source_query_name || "").trim(),
    specificUserIds: parseSpecificUserIds(record?.specific_user_ids),
    active: Boolean(record?.active),
    canView: Boolean(canView),
  };
}
