import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";
import { getReportAccessForUser } from "@/app/api/utils/reportAccess";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { CAMPAIGN_REPORT_KEY, campaignError, campaignId, validateCampaignSource } from "@/utils/campaignPriorities";
import { campaignTransport, inspectCampaignQuery, campaignSourceKey } from "@/app/api/utils/campaignPriorityQuery";
import { campaignRead, saveCampaignConfig, editCampaign } from "@/app/api/utils/campaignPriorityStore";
import { advanceCampaignRefresh } from "@/app/api/utils/campaignPriorityRefresh";
import { saveCampaignWriteOffs } from "@/app/api/utils/campaignWriteOffImport";
import { saveCampaignInvestment } from "@/app/api/utils/campaignInvestmentQuery";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function context(edit = false) {
  const session = await auth();
  if (!session?.user?.email) throw campaignError("Please sign in.", 401);
  const user = await getOrCreateUser(session);
  if (user?.active !== true) throw campaignError("This account is inactive.", 403);
  const canManage = canManageWorkspaceRole(user.role);
  if (edit && !canManage) throw campaignError("Campaign edits are restricted to Admins and Advancement Services.", 403);
  await ensureAppSchema();
  const access = await getReportAccessForUser(CAMPAIGN_REPORT_KEY, user);
  if (!access.canView && !canManage) throw campaignError("This dashboard has not been shared with you.", 403);
  return { user, canManage, title: access.title || "Future. Made. Campaign" };
}
function failure(error) {
  return Response.json({ error: error.campaignSafe ? error.message : "The campaign could not be loaded or updated. Saved data is unchanged; reload before trying again." },
    { status: error.campaignSafe ? error.status : 503, headers });
}
export async function GET(request) {
  try {
    const { user, canManage, title } = await context();
    const params = new URL(request.url).searchParams;
    if (params.has("history")) {
      if (!canManage) throw campaignError("Only report managers can inspect adjustment history.", 403);
      const key = params.get("history");
      if (!/^[1-9]\d{0,18}(?::[1-9]\d{0,18})?$/.test(key || "")) throw campaignError("Choose a gift allocation.");
      const events = await sql`SELECT e.id,e.actor_name,e.operation,e.reason,e.before_value,e.after_value,e.created_at
        FROM campaign_priority_events e JOIN campaign_priority_state s ON s.id=1
        JOIN campaign_priority_runs r ON r.id=s.published_run AND r.source_key=e.source_key
        WHERE e.item_key=${key} ORDER BY e.id DESC LIMIT 50`;
      return Response.json({ events }, { headers });
    }
    return Response.json({ ...await campaignRead(params, canManage), title, actorId: user.id }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const { user } = await context(true);
    const origin = new URL(request.url).origin;
    if ((request.headers.get("origin") && request.headers.get("origin") !== origin) || !request.headers.get("content-type")?.startsWith("application/json")) throw campaignError("Open this form in the app before saving.", 403);
    const text = await request.text();
    if (Buffer.byteLength(text) > 2*1024*1024) throw campaignError("This campaign request is too large.", 413);
    let body; try { body = JSON.parse(text); } catch { throw campaignError("Invalid campaign request."); }
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !["operation", "version", "runId", "input"].includes(k))) throw campaignError("Unknown campaign request field.");
    const { operation, version, runId, input } = body;
    if (operation !== "writeOffs" && Buffer.byteLength(text)>16000) throw campaignError("This campaign request is too large.",413);
    if (operation === "fields") {
      if (!campaignId(input?.queryId)) throw campaignError("Enter a query system record ID.");
      const transport = await campaignTransport(origin);
      return Response.json(inspectCampaignQuery(await transport.metadata(input.queryId), input.queryId), { headers });
    }
    if (!Number.isSafeInteger(version) || version < 1) throw campaignError("Reload saved campaign settings before continuing.", 409);
    if (operation === "writeOffs") return Response.json({ version:await saveCampaignWriteOffs(user,version,input,await campaignTransport(origin)) },{ headers });
    if (operation === "investment") return Response.json({ version:await saveCampaignInvestment(user,version,input,await campaignTransport(origin),sql) },{ headers });
    if (operation === "source") {
      const config = validateCampaignSource(input);
      const transport = await campaignTransport(origin);
      inspectCampaignQuery(await transport.metadata(config.queryId), config.queryId, config);
      config.connectionKey = transport.connectionKey;
      config.sourceKey = campaignSourceKey(config);
      return Response.json({ version: await saveCampaignConfig(user, version, config) }, { headers });
    }
    if (["start", "continue", "cancel"].includes(operation)) {
      if (operation === "start" && input?.confirmed !== true) throw campaignError("Confirm this query defines the campaign and the mapped amount is countable for each allocation.");
      return Response.json(await advanceCampaignRefresh(user, version, operation, operation === "cancel" ? null : await campaignTransport(origin)), { headers });
    }
    if (["funds", "override"].includes(operation)) return Response.json({ version: await editCampaign(user, version, runId, operation, input) }, { headers });
    throw campaignError("Unknown campaign operation.");
  } catch (error) { return failure(error); }
}
