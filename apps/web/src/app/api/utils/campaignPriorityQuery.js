import { createHash } from "node:crypto";
import { blackbaudApiFetch, createBlackbaudQueryJob, getBlackbaudQueryJob, getBlackbaudConnection,
  streamBlackbaudQueryResultWithMetadata } from "./blackbaud";
import { getReportRefreshUser } from "./reportRefresh";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { campaignError, campaignId, campaignRow } from "@/utils/campaignPriorities";
import { campaignMappingIssues } from "@/utils/campaignSourceMapping";
import { createResultCsvVisitor, createResultTextDecoder } from "./dashboardQueryResults";
import { pledgeQueryResultUrl } from "./pledgeQuerySource";

export const CAMPAIGN_LIMITS = { rows: 300000, bytes: 128 * 1024 * 1024, batch: 500 };
export const campaignHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Financial mappings enrich the same source; they must not discard fund assignments.
export function campaignSourceKey(config) {
  const { writeOff, pledgeBalance, ...columns } = config.columns;
  return campaignHash({ ...config, columns });
}
export function campaignBaseHash(row) {
  const basis = [row.giftId, row.splitId, row.fundId, row.amountCents];
  // Zero write-offs preserve legacy overrides. Balance changes are not changes
  // to the approved campaign amount; a new write-off does require review.
  if (row.writeOffCents) basis.push(row.writeOffCents);
  return campaignHash(basis);
}
export async function campaignTransport(origin) {
  const user = await getReportRefreshUser();
  if (!user?.id || user.active === false || !canManageWorkspaceRole(user.role)) throw campaignError("Connect an authorized shared NXT reporting account first.", 409);
  const connection = await getBlackbaudConnection(user.id);
  if (!connection?.connected_at) throw campaignError("The shared reporting account needs an NXT connection.", 409);
  const connectionKey = campaignHash([user.id, new Date(connection.connected_at).toISOString()]);
  const options = { userId: user.id, authUserId: user.id, origin, maxRetries: 0, timeoutMs: 12000 };
  return { connectionKey,
    metadata: queryId => blackbaudApiFetch(`/query/queries/${queryId}`, { ...options, searchParams: { product: "RE", module: "None" } }),
    create: queryId => createBlackbaudQueryJob({ ...options, queryId }),
    poll: jobId => getBlackbaudQueryJob({ ...options, jobId }),
    gift: giftId => {
      if (!campaignId(giftId)) throw campaignError("A valid gift system record ID is required.");
      return blackbaudApiFetch(`/gift/v1/gifts/${giftId}`, { ...options, method: "GET" });
    },
    read: (url, config, expected, saveBatch) => readCampaignQuery(url, options, config, expected, saveBatch),
  };
}

export function inspectCampaignQuery(query, queryId, config) {
  if (!campaignId(queryId) || String(query?.id) !== String(queryId) || query.type !== "Gift" || query.can_execute === false || query.has_ask_fields)
    throw campaignError("Use an executable Gift query without prompted criteria. No query was changed.");
  const fields = (query.select_fields || []).map(entry => entry.query_field?.selected_field_name)
    .filter(name => typeof name === "string" && name.trim() && name.length <= 200);
  if (!fields.length || fields.length > 25 || new Set(fields).size !== fields.length) throw campaignError("Use 1-25 uniquely named output columns in the Gift query.");
  if (config && (config.queryName !== query.name || Object.values(config.columns).filter(Boolean).some(name => !fields.includes(name))))
    throw campaignError("The query name or mapped output fields changed. Review and save the source settings before refreshing.", 409);
  if (config) {
    const issues = campaignMappingIssues(config, fields, true);
    if (issues.length) throw campaignError(issues[0].message, 409);
  }
  return { queryId: String(queryId), queryName: String(query.name || ""), fields };
}

export async function readCampaignQuery(url, options, config, expectedRows, saveBatch, stream = streamBlackbaudQueryResultWithMetadata) {
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0 || expectedRows > CAMPAIGN_LIMITS.rows)
    throw campaignError("A completed query row count of 0-300,000 is required. Saved results have not changed.");
  const { result } = await stream(pledgeQueryResultUrl(url), { ...options, timeoutMs: 240000, maxBytes: CAMPAIGN_LIMITS.bytes, redirect: "error" }, ({ contentType }) => {
    const decoder = createResultTextDecoder(contentType);
    let pending = [];
    const parser = createResultCsvVisitor({ maxRows: CAMPAIGN_LIMITS.rows,
      onHeaders: headers => {
        if (Object.values(config.columns).filter(Boolean).some(name => !headers.includes(name))) throw campaignError("A mapped campaign output column is missing from the result. Saved results have not changed.");
      },
      onRow: (row, headers) => {
        const normalized = campaignRow(row, headers, config);
        const baseHash = campaignBaseHash(normalized);
        pending.push({ ...normalized, baseHash, rowHash: campaignHash(normalized) });
      },
    });
    async function flush(all = false) {
      while (pending.length >= CAMPAIGN_LIMITS.batch || (all && pending.length)) {
        const batch = pending.splice(0, CAMPAIGN_LIMITS.batch);
        await saveBatch(batch);
      }
    }
    return {
      async write(chunk) { parser.write(decoder.decode(chunk, { stream: true })); await flush(); },
      async finish() {
        parser.write(decoder.decode());
        const { rowCount } = parser.finish();
        if (rowCount !== expectedRows) throw campaignError("The completed query count does not match the downloaded rows. No partial results were published.");
        await flush(true);
        return { rawRows: rowCount };
      },
    };
  });
  return result;
}
