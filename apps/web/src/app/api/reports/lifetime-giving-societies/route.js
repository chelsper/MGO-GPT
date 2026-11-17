import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getReportAccessForUser } from "@/app/api/utils/reportAccess";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { LIFETIME_REPORT_KEY, lifetimeError } from "@/utils/lifetimeSocieties";
import { inspectLifetimeQuery, lifetimeTransport, publicLifetimeState, readLifetimeRules, readLifetimeState, refreshLifetimeHistory, savedLifetimeGiftReview, savedLifetimeReconciliationCsv, updateLifetimeGroup, updateLifetimeRecord } from "@/app/api/utils/lifetimeSocieties";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function context(edit = false) {
  const session = await auth();
  if (!session?.user?.email) throw lifetimeError("Please sign in.", 401);
  const user = await getOrCreateUser(session);
  if (user?.active !== true) throw lifetimeError("This account is inactive.", 403);
  const canManage = canManageWorkspaceRole(user.role);
  if (edit && !canManage) throw lifetimeError("Only Admins and Advancement Services can manage this report.", 403);
  await ensureAppSchema();
  const access = await getReportAccessForUser(LIFETIME_REPORT_KEY, user);
  if (!access.canView && !canManage) throw lifetimeError("This report has not been shared with you.", 403);
  return { user, canManage, title: access.title || "Lifetime Giving Societies" };
}
const failure = error => Response.json({ error: error.lifetimeSafe ? error.message :
  "The report could not be loaded or refreshed. Saved history is unchanged. Check the shared NXT connection before trying again." },
{ status: error.lifetimeSafe ? error.status : 503, headers });
export async function GET(request) {
  try {
    const { canManage, title } = await context();
    const params = new URL(request?.url || "https://app.invalid").searchParams;
    if (params.size) {
      const milestoneKey = params.get("milestoneKey"), revision = params.get("revision"), page = params.get("page") || "0", view = params.get("view") || "all";
      const format = params.get("format");
      if ([...params.keys()].some(key => !["milestoneKey", "revision", "page", "view", "format"].includes(key) || params.getAll(key).length !== 1) ||
        !/^[a-f0-9]{64}$/.test(milestoneKey || "") || !/^[a-f0-9-]{36}$/.test(revision || "") ||
        !/^(0|[1-9]\d{0,5})$/.test(page) || !["all", "counted", "review", "excluded"].includes(view) ||
        (format !== null && (format !== "reconciliation-csv" || params.has("page") || params.has("view"))))
        throw lifetimeError("Choose gift details from the saved report.", 400);
      if (format) return new Response(savedLifetimeReconciliationCsv(await readLifetimeState(), await readLifetimeRules(), { milestoneKey, revision }), {
        headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="lifetime-gift-reconciliation.csv"', "X-Content-Type-Options": "nosniff" },
      });
      return Response.json(savedLifetimeGiftReview(await readLifetimeState(), await readLifetimeRules(), { milestoneKey, revision, page: Number(page), view }), { headers });
    }
    return Response.json({ ...publicLifetimeState(await readLifetimeState(undefined, false), await readLifetimeRules()), canManage, title }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const { user, canManage, title } = await context(true);
    const origin = new URL(request.url).origin;
    if ((request.headers.get("origin") && request.headers.get("origin") !== origin) || request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers.get("content-type")?.startsWith("application/json")) throw lifetimeError("Open this report in the app before continuing.", 403);
    const text = await request.text();
    if (Buffer.byteLength(text) > 1000) throw lifetimeError("This request is too large.", 413);
    let body; try { body = JSON.parse(text); } catch { throw lifetimeError("Invalid report request.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["operation", "revision", "groupId", "recordKey", "milestoneKey"].includes(key)) ||
      !["fields", "refresh", "confirm-group", "remove-group", "archive-record", "restore-record", "confirm-date", "reopen-date"].includes(body.operation)) throw lifetimeError("Unknown report request.", 400);
    const groupOperation = ["confirm-group", "remove-group"].includes(body.operation);
    const archiveOperation = ["archive-record", "restore-record"].includes(body.operation);
    const dateOperation = ["confirm-date", "reopen-date"].includes(body.operation);
    if (groupOperation ? typeof body.groupId !== "string" || !/^[a-f0-9]{64}$/.test(body.groupId) : body.groupId !== undefined)
      throw lifetimeError("Choose a shared-giving suggestion from the current report.", 400);
    for (const [key, required] of [["recordKey", archiveOperation], ["milestoneKey", dateOperation]]) {
      if (required ? typeof body[key] !== "string" || !/^[a-f0-9]{64}$/.test(body[key]) : body[key] !== undefined)
        throw lifetimeError("Choose a saved record from this report.", 400);
    }
    if (body.operation === "fields") return Response.json(inspectLifetimeQuery(await (await lifetimeTransport(origin)).metadata()), { headers });
    if (body.revision !== null && (typeof body.revision !== "string" || !/^[a-f0-9-]{36}$/.test(body.revision)))
      throw lifetimeError("Reload saved results before refreshing.", 409);
    const { state, societies } = groupOperation ? await updateLifetimeGroup({ revision: body.revision, groupId: body.groupId, operation: body.operation, user })
      : archiveOperation || dateOperation ? await updateLifetimeRecord({ ...body, user })
        : await refreshLifetimeHistory({ revision: body.revision, user, transport: await lifetimeTransport(origin) });
    return Response.json({ ...publicLifetimeState(state, societies), canManage, title }, { headers });
  } catch (error) { return failure(error); }
}
