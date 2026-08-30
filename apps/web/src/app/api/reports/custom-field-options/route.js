import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  listBlackbaudConstituentCustomFieldCategories,
  listBlackbaudConstituentCustomFieldCategoryValues,
} from "@/app/api/utils/blackbaud";
import {
  CUSTOM_FIELD_CATALOG_CACHE_KEY,
  createConfiguredCustomFieldCatalog,
  createCustomFieldCatalogSnapshot,
  isCustomFieldCatalogFresh,
  mergeCustomFieldCatalogs,
  normalizeCustomFieldValueOptions,
} from "@/app/api/utils/customFieldOptions";
import {
  getCachedReportSnapshotWithMetadata,
  saveReportSnapshot,
} from "@/app/api/utils/reportCache";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";

function createResponse({ catalog, notice = "", source, updatedAt }) {
  return Response.json({
    categories: Array.isArray(catalog?.categories) ? catalog.categories : [],
    values: Array.isArray(catalog?.values) ? catalog.values : [],
    loadedCategories: Array.isArray(catalog?.loadedCategories) ? catalog.loadedCategories : [],
    notice,
    source,
    updatedAt: updatedAt || null,
  });
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return normalizeText(value).toLocaleLowerCase("en-US");
}

function findCatalogCategory(catalog, requestedCategory) {
  const target = normalizeKey(requestedCategory);
  if (!target) return "";
  return (
    (Array.isArray(catalog?.categories) ? catalog.categories : []).find(
      (category) => normalizeKey(category?.name || category?.category) === target,
    )?.name || ""
  );
}

function hasLoadedCategory(catalog, categoryName) {
  const target = normalizeKey(categoryName);
  return (Array.isArray(catalog?.loadedCategories) ? catalog.loadedCategories : []).some(
    (category) => normalizeKey(category) === target,
  );
}

function replaceCategoryValues(catalog, categoryName, values) {
  const target = normalizeKey(categoryName);
  const retainedValues = (Array.isArray(catalog?.values) ? catalog.values : []).filter(
    (option) => normalizeKey(option?.category) !== target,
  );
  return mergeCustomFieldCatalogs(
    { ...catalog, values: retainedValues },
    { categories: [], values, loadedCategories: [categoryName] },
  );
}

async function getConfiguredCustomFieldRecords() {
  return sql`
    SELECT field_category, field_description
    FROM custom_field_reports
    ORDER BY updated_at DESC, id DESC
  `;
}

async function getSessionUser() {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) return null;
  return getOrCreateUser(session, "admin");
}

export async function GET(request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageWorkspaceRole(user.role)) {
      return Response.json(
        { error: "Custom-field options are managed by Advancement Services." },
        { status: 403 },
      );
    }

    const requestUrl = new URL(request.url);
    const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
    const requestedCategory = normalizeText(requestUrl.searchParams.get("category"));
    const [configuredRecords, cachedSnapshot] = await Promise.all([
      getConfiguredCustomFieldRecords(),
      getCachedReportSnapshotWithMetadata(CUSTOM_FIELD_CATALOG_CACHE_KEY),
    ]);
    const configuredCatalog = createConfiguredCustomFieldCatalog(configuredRecords);
    let catalog = mergeCustomFieldCatalogs(cachedSnapshot?.payload, configuredCatalog);
    const cacheIsFresh = Boolean(
      cachedSnapshot && isCustomFieldCatalogFresh(cachedSnapshot.updatedAt),
    );
    let refreshedCategories = false;
    let updatedAt = cachedSnapshot?.updatedAt || null;

    try {
      const origin = new URL(request.url).origin;
      if (forceRefresh || !cacheIsFresh || !catalog.categories.length) {
        const categoryPayload = await listBlackbaudConstituentCustomFieldCategories({
          userId: user.id,
          authUserId: user.id,
          origin,
          timeoutMs: 8000,
          maxRetries: 0,
        });
        catalog = mergeCustomFieldCatalogs(
          catalog,
          createCustomFieldCatalogSnapshot({ categoryPayload, configuredRecords }),
        );
        refreshedCategories = true;
        updatedAt = new Date().toISOString();
      }

      if (!requestedCategory) {
        if (refreshedCategories) {
          await saveReportSnapshot(CUSTOM_FIELD_CATALOG_CACHE_KEY, catalog);
        }
        return createResponse({
          catalog,
          source: refreshedCategories ? "nxt" : "shared-cache",
          updatedAt,
        });
      }

      const selectedCategory = findCatalogCategory(catalog, requestedCategory);
      if (!selectedCategory) {
        if (refreshedCategories) {
          await saveReportSnapshot(CUSTOM_FIELD_CATALOG_CACHE_KEY, catalog);
        }
        return createResponse({
          catalog,
          source: refreshedCategories ? "nxt" : "shared-cache",
          updatedAt,
          notice:
            "That category is not in the shared NXT catalog. You can still enter the exact category and description manually.",
        });
      }

      if (!forceRefresh && cacheIsFresh && hasLoadedCategory(catalog, selectedCategory)) {
        return createResponse({
          catalog,
          source: "shared-cache",
          updatedAt,
        });
      }

      // The NXT values endpoint requires exactly one category_name. Loading
      // only the selected category keeps this setup screen quota-safe.
      const valuePayload = await listBlackbaudConstituentCustomFieldCategoryValues({
        userId: user.id,
        authUserId: user.id,
        origin,
        categoryName: selectedCategory,
        timeoutMs: 8000,
        maxRetries: 0,
      });
      catalog = replaceCategoryValues(
        catalog,
        selectedCategory,
        normalizeCustomFieldValueOptions(valuePayload, catalog.categories, selectedCategory),
      );
      updatedAt = new Date().toISOString();
      await saveReportSnapshot(CUSTOM_FIELD_CATALOG_CACHE_KEY, catalog);

      return createResponse({ catalog, source: "nxt", updatedAt });
    } catch (catalogError) {
      console.warn("Custom field option catalog refresh failed:", catalogError);
      const hasFallback = catalog.categories.length || catalog.values.length;
      return createResponse({
        catalog,
        source: hasFallback ? "saved-options" : "manual-entry",
        updatedAt,
        notice: hasFallback
          ? "NXT custom-field options could not be refreshed. Showing the last saved options and configured report values; you can still enter exact text manually."
          : "NXT custom-field options are temporarily unavailable. You can still enter the exact category and description manually.",
      });
    }
  } catch (error) {
    console.error("Custom field option catalog GET error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load NXT custom-field options." },
      { status: 500 },
    );
  }
}
