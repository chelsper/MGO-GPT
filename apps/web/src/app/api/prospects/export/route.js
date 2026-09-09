import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { buildProspectExport, exportError, prospectExportCsv, validateExportOptions } from "@/utils/prospectExport";
import { authorizeExport, exportRoster, loadProspectExport } from "@/app/api/utils/prospectExportData";
import { prospectExportWorkbook } from "@/app/api/utils/prospectExportWorkbook";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function contextFor(request) {
  const session = await auth();
  if (!session?.user?.email) throw exportError("Please sign in to export prospects.", 401);
  await ensureAppSchema();
  const context = await getWorkspaceUser(session, request);
  if (!context.sessionUser || context.sessionUser.active === false) throw exportError("Access denied.", 403);
  return context;
}
function failure(error) {
  // Do not put SQL errors, donor values, or connection details in responses/logs.
  return Response.json({ error: error?.exportStatus ? error.message : "The export could not be created. Please try again." },
    { status: error?.exportStatus || 500, headers: privateHeaders });
}
export async function GET(request) {
  try {
    const context = await contextFor(request);
    if (!isReviewerRole(context.sessionUser.role)) throw exportError("Master exports are restricted to Advancement Services and admins.", 403);
    const users = await exportRoster();
    return Response.json({ viewerId: context.sessionUser.id,
      users: users.map(({ id, name, email, active_count }) => ({ id, name, email, active_count })) }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const origin = new URL(request.url).origin;
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && requestOrigin !== origin) throw exportError("Invalid export origin.", 403);
    const context = await contextFor(request);
    const raw = await request.text();
    if (raw.length > 256000) throw exportError("Export selection is too large.", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw exportError("Invalid export request."); }
    const options = validateExportOptions(body);
    const owners = await authorizeExport(options, context);
    const records = await loadProspectExport(options, { ...context, origin });
    const model = buildProspectExport(records, options, owners);
    const content = options.format === "csv" ? prospectExportCsv(model) : await prospectExportWorkbook(model);
    const filename = `top-prospects-${options.scope === "master" ? "master-" : ""}${new Date().toISOString().slice(0, 10)}.${options.format}`;
    return new Response(content, { headers: { ...privateHeaders,
      "Content-Type": options.format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    } });
  } catch (error) { return failure(error); }
}
