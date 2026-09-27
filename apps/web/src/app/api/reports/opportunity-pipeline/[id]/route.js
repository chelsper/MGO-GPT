import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { getReportAccessForUser } from "@/app/api/utils/reportAccess";
import { PIPELINE_REPORT_KEY } from "@/utils/pipelineReport";
import { getPipelineEditor, savePipelineChange, verifyPipelineChange } from "@/app/api/utils/pipelineOpportunityChange";
import { pipelineError } from "@/app/api/utils/pipelineOpportunityValues";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function handle(request, params, action) {
  try {
    const session = await auth();
    if (!session?.user?.email) throw pipelineError("Unauthorized", 401);
    if (request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)) throw pipelineError("Use this app to make changes.", 403);
    if (!/^[1-9]\d{0,15}$/.test(params.id)) throw pipelineError("Invalid opportunity ID.", 400);
    await ensureAppSchema();
    const actor = await getOrCreateUser(session, "admin");
    if (!actor || actor.active === false || !(await getReportAccessForUser(PIPELINE_REPORT_KEY, actor)).canView) throw pipelineError("You do not have access to this report.", 403);
    let body;
    if (action === "save") {
      if (!request.headers.get("content-type")?.includes("application/json")) throw pipelineError("JSON is required.", 400);
      const text = await request.text();
      if (text.length > 16000) throw pipelineError("This edit is too large.", 413);
      try { body = JSON.parse(text); } catch { throw pipelineError("Invalid edit.", 400); }
    }
    const input = { id: params.id, actor, origin: new URL(request.url).origin, body };
    const result = await (action === "save" ? savePipelineChange(input) : action === "verify" ? verifyPipelineChange(input) : getPipelineEditor(input));
    return Response.json(result, { status: result.state === "pending" ? 202 : 200, headers });
  } catch (error) {
    if (!error?.publicMessage) console.error("Pipeline opportunity operation failed");
    return Response.json({ error: error?.publicMessage || "NXT could not be checked. No new change was confirmed. Reload saved data or check sync status before trying again." }, { status: error?.publicMessage ? error.status : 502, headers });
  }
}

export const GET = (request, { params }) => handle(request, params, "read");
export const PATCH = (request, { params }) => handle(request, params, "save");
// Reconciliation reads NXT only; it never resubmits the write.
export const POST = (request, { params }) => handle(request, params, "verify");
