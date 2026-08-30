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
    notice,
    source,
    updatedAt: updatedAt || null,
  });
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

    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const [configuredRecords, cachedSnapshot] = await Promise.all([
      getConfiguredCustomFieldRecords(),
      getCachedReportSnapshotWithMetadata(CUSTOM_FIELD_CATALOG_CACHE_KEY),
    ]);
    const configuredCatalog = createConfiguredCustomFieldCatalog(configuredRecords);
    const cachedCatalog = mergeCustomFieldCatalogs(cachedSnapshot?.payload, configuredCatalog);

    if (!forceRefresh && cachedSnapshot && isCustomFieldCatalogFresh(cachedSnapshot.updatedAt)) {
      return createResponse({
        catalog: cachedCatalog,
        source: "shared-cache",
        updatedAt: cachedSnapshot.updatedAt,
      });
    }

    try {
      const origin = new URL(request.url).origin;
      // Load two small configuration collections sequentially so opening this
      // admin screen does not create a burst of Blackbaud calls.
      const categoryPayload = await listBlackbaudConstituentCustomFieldCategories({
        userId: user.id,
        authUserId: user.id,
        origin,
        timeoutMs: 8000,
        maxRetries: 0,
      });
      const valuePayload = await listBlackbaudConstituentCustomFieldCategoryValues({
        userId: user.id,
        authUserId: user.id,
        origin,
        timeoutMs: 8000,
        maxRetries: 0,
      });
      const catalog = createCustomFieldCatalogSnapshot({
        categoryPayload,
        configuredRecords,
        valuePayload,
      });
      await saveReportSnapshot(CUSTOM_FIELD_CATALOG_CACHE_KEY, catalog);

      return createResponse({
        catalog,
        source: "nxt",
        updatedAt: new Date().toISOString(),
      });
    } catch (catalogError) {
      console.warn("Custom field option catalog refresh failed:", catalogError);
      const hasFallback = cachedCatalog.categories.length || cachedCatalog.values.length;
      return createResponse({
        catalog: cachedCatalog,
        source: hasFallback ? "saved-options" : "manual-entry",
        updatedAt: cachedSnapshot?.updatedAt || null,
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
