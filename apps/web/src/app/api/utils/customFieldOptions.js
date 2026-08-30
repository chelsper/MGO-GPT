export const CUSTOM_FIELD_CATALOG_CACHE_KEY = "configuration:constituent-custom-fields";
export const CUSTOM_FIELD_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return normalizeText(value).toLocaleLowerCase("en-US");
}

function asCollection(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.value)) return value.value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function firstText(record, keys) {
  for (const key of keys) {
    const value = normalizeText(record?.[key]);
    if (value) return value;
  }
  return "";
}

function firstIdentifier(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function sortByName(first, second) {
  return first.name.localeCompare(second.name, "en-US", { sensitivity: "base" });
}

function sortByCategoryThenValue(first, second) {
  const categoryComparison = first.category.localeCompare(second.category, "en-US", {
    sensitivity: "base",
  });
  if (categoryComparison !== 0) return categoryComparison;
  return first.value.localeCompare(second.value, "en-US", { sensitivity: "base" });
}

export function normalizeCustomFieldCategoryOptions(payload) {
  const categories = new Map();

  for (const record of asCollection(payload)) {
    if (!record || typeof record !== "object") continue;

    const name = firstText(record, [
      "category",
      "category_name",
      "categoryName",
      "name",
      "description",
      "label",
    ]);
    if (!name) continue;

    const id = firstIdentifier(record, [
      "category_id",
      "categoryId",
      "custom_field_category_id",
      "customFieldCategoryId",
      "id",
    ]);
    const key = normalizeKey(name);
    const existing = categories.get(key);
    categories.set(key, {
      id: id || existing?.id || "",
      name: existing?.name || name,
      dataType: firstText(record, ["data_type", "dataType", "type"]) || existing?.dataType || "",
    });
  }

  return [...categories.values()].sort(sortByName);
}

function getNestedValueRecords(record) {
  const nested = [record?.values, record?.options, record?.entries, record?.value_list];
  return nested.flatMap((value) => (Array.isArray(value) ? value : []));
}

function collectValueOption({ categoryById, categoryByName, categoryName, record, values }) {
  if (!record || typeof record !== "object") return;

  const categoryId = firstIdentifier(record, [
    "category_id",
    "categoryId",
    "custom_field_category_id",
    "customFieldCategoryId",
  ]);
  const directCategory = firstText(record, [
    "category",
    "category_name",
    "categoryName",
    "custom_field_category",
    "customFieldCategory",
  ]);
  const resolvedCategory =
    directCategory ||
    categoryName ||
    categoryById.get(categoryId) ||
    categoryByName.get(normalizeKey(categoryId)) ||
    "";
  const value = firstText(record, [
    "value",
    "field_value",
    "fieldValue",
    "code_table_entry",
    "codeTableEntry",
    "code_table_entry_name",
    "codeTableEntryName",
    "name",
    "description",
    "label",
  ]);

  if (!resolvedCategory || !value) return;
  const key = `${normalizeKey(resolvedCategory)}|${normalizeKey(value)}`;
  if (!values.has(key)) {
    values.set(key, { category: resolvedCategory, value });
  }
}

export function normalizeCustomFieldValueOptions(payload, categories = []) {
  const categoryById = new Map();
  const categoryByName = new Map();
  for (const category of Array.isArray(categories) ? categories : []) {
    const name = normalizeText(category?.name || category?.category);
    const id = String(category?.id || "").trim();
    if (name) categoryByName.set(normalizeKey(name), name);
    if (id && name) categoryById.set(id, name);
  }

  const values = new Map();
  for (const record of asCollection(payload)) {
    if (!record || typeof record !== "object") continue;

    const categoryName = firstText(record, [
      "category",
      "category_name",
      "categoryName",
      "custom_field_category",
      "customFieldCategory",
      "name",
    ]);
    const nestedValues = getNestedValueRecords(record);

    if (nestedValues.length) {
      nestedValues.forEach((value) =>
        collectValueOption({ categoryById, categoryByName, categoryName, record: value, values }),
      );
      continue;
    }

    collectValueOption({ categoryById, categoryByName, categoryName: "", record, values });
  }

  return [...values.values()].sort(sortByCategoryThenValue);
}

export function createConfiguredCustomFieldCatalog(records) {
  const categories = new Map();
  const values = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const category = normalizeText(record?.field_category ?? record?.fieldCategory);
    const value = normalizeText(record?.field_description ?? record?.fieldDescription);
    if (category) {
      categories.set(normalizeKey(category), { id: "", name: category, dataType: "" });
    }
    if (category && value) {
      values.set(`${normalizeKey(category)}|${normalizeKey(value)}`, { category, value });
    }
  }

  return {
    categories: [...categories.values()].sort(sortByName),
    values: [...values.values()].sort(sortByCategoryThenValue),
  };
}

function mergeCategories(...catalogs) {
  const merged = new Map();
  for (const catalog of catalogs) {
    for (const category of Array.isArray(catalog) ? catalog : []) {
      const name = normalizeText(category?.name || category?.category);
      if (!name) continue;
      const id = String(category?.id || "").trim();
      const key = normalizeKey(name);
      const existing = merged.get(key);
      merged.set(key, {
        id: id || existing?.id || "",
        name: existing?.name || name,
        dataType: normalizeText(category?.dataType || category?.data_type) || existing?.dataType || "",
      });
    }
  }
  return [...merged.values()].sort(sortByName);
}

function mergeValues(...catalogs) {
  const merged = new Map();
  for (const catalog of catalogs) {
    for (const option of Array.isArray(catalog) ? catalog : []) {
      const category = normalizeText(option?.category);
      const value = normalizeText(option?.value);
      if (!category || !value) continue;
      const key = `${normalizeKey(category)}|${normalizeKey(value)}`;
      if (!merged.has(key)) merged.set(key, { category, value });
    }
  }
  return [...merged.values()].sort(sortByCategoryThenValue);
}

export function createCustomFieldCatalogSnapshot({
  categoryPayload,
  configuredRecords,
  valuePayload,
} = {}) {
  const configuredCatalog = createConfiguredCustomFieldCatalog(configuredRecords);
  const categories = mergeCategories(
    normalizeCustomFieldCategoryOptions(categoryPayload),
    configuredCatalog.categories,
  );
  const values = mergeValues(
    normalizeCustomFieldValueOptions(valuePayload, categories),
    configuredCatalog.values,
  );

  return { categories, values };
}

export function mergeCustomFieldCatalogs(...catalogs) {
  return {
    categories: mergeCategories(...catalogs.map((catalog) => catalog?.categories)),
    values: mergeValues(...catalogs.map((catalog) => catalog?.values)),
  };
}

export function isCustomFieldCatalogFresh(updatedAt, now = Date.now()) {
  const updatedAtMs = new Date(updatedAt || 0).getTime();
  return Number.isFinite(updatedAtMs) && updatedAtMs > 0 && now - updatedAtMs < CUSTOM_FIELD_CATALOG_TTL_MS;
}
