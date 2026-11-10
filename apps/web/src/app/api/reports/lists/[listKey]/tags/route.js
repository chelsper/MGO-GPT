import { listContext, requireListSameOrigin, listResponse, listFailure } from "@/app/api/utils/constituentListContext";
import { listError } from "@/app/api/utils/listConfigurations";
import { projectTagSnapshot, readProjectTags, mutateProjectTags } from "@/app/api/utils/projectProspectingTags";

export async function GET(request, { params }) {
  try {
    const context = await listContext(request, params.listKey);
    const state = await projectTagSnapshot(context);
    const result = await readProjectTags(context, state);
    const latest = await listContext(request, params.listKey);
    if (latest.report.revision !== context.report.revision) throw listError("Project settings changed. Reload before continuing.", 409);
    return listResponse(result);
  } catch (error) { return listFailure(error); }
}

export async function POST(request, { params }) {
  try {
    requireListSameOrigin(request);
    const context = await listContext(request, params.listKey);
    const text = await request.text();
    if (text.length > 12000) throw listError("Tag request is too large.", 413);
    let body;
    try { body = JSON.parse(text); } catch { throw listError("Invalid tag request."); }
    const state = await projectTagSnapshot(context);
    return listResponse(await mutateProjectTags(context, state, body));
  } catch (error) { return listFailure(error); }
}
