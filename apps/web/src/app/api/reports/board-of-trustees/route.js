import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getReportAccessForUser } from "@/app/api/utils/reportAccess";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { BOARD_TRUSTEES_KEY, boardError, validateBoardSource, validateBoardTarget } from "@/utils/boardTrustees";
import { boardTransport, inspectBoardQuery, publicBoardState, readBoardState, refreshBoardYear } from "@/app/api/utils/boardTrustees";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function context(edit = false) {
  const session = await auth();
  if (!session?.user?.email) throw boardError("Please sign in.", 401);
  const user = await getOrCreateUser(session);
  if (user?.active !== true) throw boardError("This account is inactive.", 403);
  const canManage = canManageWorkspaceRole(user.role);
  if (edit && !canManage) throw boardError("Only Admins and Advancement Services can configure or refresh this dashboard.", 403);
  await ensureAppSchema();
  const access = await getReportAccessForUser(BOARD_TRUSTEES_KEY, user);
  if (!access.canView && !canManage) throw boardError("This dashboard has not been shared with you.", 403);
  return { user, canManage, title: access.title || "Board of Trustees" };
}
const failure = error => Response.json({ error: error.boardSafe ? error.message :
  "The trustee dashboard could not be loaded or refreshed. Previous results are unchanged. Check the shared NXT connection and try again." },
{ status: error.boardSafe ? error.status : 503, headers });
export async function GET() {
  try {
    const { canManage, title } = await context();
    return Response.json({ ...publicBoardState(await readBoardState()), canManage, title }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const { user, canManage, title } = await context(true);
    const origin = new URL(request.url).origin;
    if ((request.headers.get("origin") && request.headers.get("origin") !== origin) ||
        request.headers.get("sec-fetch-site") === "cross-site" || !request.headers.get("content-type")?.startsWith("application/json"))
      throw boardError("Open this form in the app before refreshing.", 403);
    const text = await request.text();
    if (Buffer.byteLength(text) > 8000) throw boardError("This request is too large.", 413);
    let body; try { body = JSON.parse(text); } catch { throw boardError("Invalid dashboard request."); }
    if (!body || Array.isArray(body) || Object.keys(body).some(key => !["operation", "input", "revision"].includes(key)) ||
        !["fields", "refresh"].includes(body.operation)) throw boardError("Unknown dashboard request.");
    if (body.operation === "fields") {
      const target = validateBoardTarget(body.input);
      const transport = await boardTransport(origin, target.queryId);
      const { fingerprint, ...result } = inspectBoardQuery(await transport.metadata(), target);
      return Response.json(result, { headers });
    }
    const input = validateBoardSource(body.input);
    if (body.revision !== null && (typeof body.revision !== "string" || !/^[a-f0-9-]{36}$/.test(body.revision)))
      throw boardError("Reload saved results before refreshing.", 409);
    // Creating the adapter does not query NXT; refresh checks the saved revision before execution.
    const state = await refreshBoardYear({ input, revision: body.revision, user, transport: await boardTransport(origin, input.queryId) });
    return Response.json({ ...publicBoardState(state), canManage, title }, { headers });
  } catch (error) { return failure(error); }
}
