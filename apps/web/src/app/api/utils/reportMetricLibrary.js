import { randomUUID } from "node:crypto";
import sql from "./sql";
import { dashboardError } from "./dashboardConfigurations";
import { getCachedReportSnapshot } from "./reportCache";
import { buildMetricSources, METRIC_ALUMNI_KEY, metricSourceMetadata, presentMetricResult } from "./reportMetricSources";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";

export const validMetricId = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
function authorize(user, manager = false) {
  if (user?.active !== true || (manager && !canManageWorkspaceRole(user.role)))
    throw dashboardError("Metric access is not available.", 403);
}

export async function loadMetricSources(user) {
  const records = await sql`
    SELECT * FROM report_configurations
    WHERE report_key = ${METRIC_ALUMNI_KEY} OR configuration_kind = 'dashboard'
    ORDER BY report_key
  `;
  return buildMetricSources(records, user);
}

export function serializeMetric(record, source, manager = false) {
  const status = !source ? "source_missing" : source.fingerprint !== record.source_fingerprint
    ? "source_changed" : !source.enabled ? "source_disabled" : "available";
  return {
    id: record.id, title: record.title, description: record.description,
    format: record.display_format, published: record.published, status,
    ...(manager ? { sourceId: record.source_id, sourceFingerprint: record.source_fingerprint,
      revision: record.revision, source: metricSourceMetadata(source) } : {}),
  };
}

export async function listMetricLibrary(user, manager = false) {
  authorize(user, manager);
  const sources = await loadMetricSources(user);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const rows = await sql`SELECT *, updated_at::text AS revision FROM report_metric_library ORDER BY lower(title), id`;
  const entries = rows.filter((row) => manager || (row.published && byId.get(row.source_id)?.canView && byId.get(row.source_id)?.fingerprint === row.source_fingerprint))
    .map((row) => serializeMetric(row, byId.get(row.source_id), manager));
  return { entries, ...(manager ? { sources: sources.map(metricSourceMetadata) } : {}) };
}

export function validateMetricDraft(body, create) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw dashboardError("Expected a metric definition.");
  const fields = ["title", "description", "sourceId", "sourceFingerprint", "format", "published", ...(create ? [] : ["id", "revision"])];
  if (Object.keys(body).some((key) => !fields.includes(key))) throw dashboardError("Unknown metric setting.");
  for (const [key, max, required] of [["title", 120, true], ["description", 1000, false], ["sourceId", 350, true]]) {
    if (typeof body[key] !== "string" || body[key].length > max || (required && !body[key].trim()))
      throw dashboardError(`Enter a valid ${key === "sourceId" ? "saved source" : key} (up to ${max} characters).`);
  }
  if (!/^[0-9a-f]{64}$/.test(body.sourceFingerprint || "")) throw dashboardError("Select a current saved source.");
  if (!["number", "currency", "table"].includes(body.format)) throw dashboardError("Choose a supported display format.");
  if (typeof body.published !== "boolean") throw dashboardError("Library availability must be true or false.");
  if (!create && (!validMetricId(body.id) || typeof body.revision !== "string" || body.revision.length > 80 || !body.revision))
    throw dashboardError("Reload the metric before saving.");
  return { ...body, title: body.title.trim(), description: body.description.trim() };
}

export async function saveMetricLibraryEntry(user, input, create) {
  authorize(user, true);
  const body = validateMetricDraft(input, create);
  const source = (await loadMetricSources(user)).find((item) => item.id === body.sourceId);
  if (!source || source.fingerprint !== body.sourceFingerprint) {
    if (!create && !body.published) {
      // A broken source must not trap an administrator into keeping it published.
      // Retiring preserves the original source binding; it cannot approve a new one.
      const retired = await sql`
        UPDATE report_metric_library SET published = FALSE, title = ${body.title}, description = ${body.description},
          updated_by = ${user.id}, updated_at = NOW()
        WHERE id = ${body.id} AND updated_at::text = ${body.revision}
          AND source_id = ${body.sourceId} AND source_fingerprint = ${body.sourceFingerprint}
        RETURNING *, updated_at::text AS revision
      `;
      if (!retired.length) throw dashboardError("This metric changed. Reload before retiring it.", 409);
      return serializeMetric(retired[0], source, true);
    }
    throw dashboardError("The source changed or is unavailable. Reload the library and review the current source before saving.", 409);
  }
  if ((source.sourceType === "query_table" && body.format !== "table") ||
      (source.sourceType !== "query_table" && body.format === "table") ||
      (source.sourceType === "query_count" && body.format !== "number"))
    throw dashboardError("Query counts are numbers, not giving amounts. Tables retain their source column formats.");
  if (body.published && !source.enabled) throw dashboardError("Enable the source dashboard before making its metric available.", 409);
  const id = create ? randomUUID() : body.id;
  let rows;
  try {
    rows = create ? await sql`
      INSERT INTO report_metric_library (id, source_id, source_fingerprint, title, description, display_format, published, updated_by)
      VALUES (${id}, ${source.id}, ${source.fingerprint}, ${body.title}, ${body.description}, ${body.format}, ${body.published}, ${user.id})
      RETURNING *, updated_at::text AS revision
    ` : await sql`
      UPDATE report_metric_library SET source_id = ${source.id}, source_fingerprint = ${source.fingerprint},
        title = ${body.title}, description = ${body.description}, display_format = ${body.format},
        published = ${body.published}, updated_by = ${user.id}, updated_at = NOW()
      WHERE id = ${id} AND updated_at::text = ${body.revision}
      RETURNING *, updated_at::text AS revision
    `;
  } catch (error) {
    if (error.code === "23505") throw dashboardError("This source is already in the library. Edit its existing entry instead.", 409);
    throw error;
  }
  if (!rows.length) throw dashboardError("This metric changed while you were editing. Reload before saving again.", 409);
  return serializeMetric(rows[0], source, true);
}

export async function readMetricLibraryResult(user, id, preview = false) {
  authorize(user, preview);
  if (!validMetricId(id)) throw dashboardError("Metric not found.", 404);
  const rows = await sql`SELECT *, updated_at::text AS revision FROM report_metric_library WHERE id = ${id} LIMIT 1`;
  const row = rows[0];
  if (!row) throw dashboardError("Metric not found.", 404);
  const source = (await loadMetricSources(user)).find((item) => item.id === row.source_id);
  if (!preview && (!row.published || !source?.canView)) throw dashboardError("Metric not found.", 404);
  const metric = serializeMetric(row, source, preview);
  if (!source || source.fingerprint !== row.source_fingerprint || (!source.enabled && !preview))
    return { metric, result: null };
  const cached = await getCachedReportSnapshot(source.cacheKey);
  return { metric, result: presentMetricResult(source, cached) };
}
