import {
  listContext,
  listResponse,
  listFailure,
  requireListSameOrigin,
} from "@/app/api/utils/constituentListContext";
import { listError } from "@/app/api/utils/listConfigurations";
import { projectTagSnapshot } from "@/app/api/utils/projectProspectingTags";
import { createProjectOutreachStore } from "@/app/api/utils/projectOutreachStore";
import { submitOutreachAction } from "@/app/api/utils/projectOutreachActions";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { isMgoRole, canManageWorkspaceRole } from "@/utils/workspaceRoles";

export const maxDuration = 90;
const store = createProjectOutreachStore();
export async function GET(request, { params }) {
  try {
    const context = await listContext(request, params.listKey);
    const state = await projectTagSnapshot(context);
    const result = await store.read(context, state);
    const current = await listContext(request, params.listKey);
    if (current.report.revision !== context.report.revision)
      throw listError(
        "Project access or settings changed. Reload outreach.",
        409,
      );
    return listResponse({ ...result, today: getStandingsPeriods().asOf });
  } catch (error) {
    return listFailure(error);
  }
}
export async function POST(request, { params }) {
  try {
    requireListSameOrigin(request);
    if (
      request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      throw listError("Open outreach in the app before making changes.", 403);
    const context = await listContext(request, params.listKey);
    if (
      !isMgoRole(context.user.role) &&
      !canManageWorkspaceRole(context.user.role)
    )
      throw listError("This account has read-only outreach access.", 403);
    const raw = await request.text();
    if (raw.length > 20000)
      throw listError("Outreach request is too large.", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw listError("Invalid outreach request.");
    }
    const fields = {
      settings: ["settings", "settingsVersion"],
      assign: [
        "people",
        "assigneeId",
        "dueDate",
        "settingsVersion",
        "snapshotAt",
      ],
      record: ["result", "settingsVersion", "snapshotAt"],
      submit: ["eventId", "confirm"],
      verify: ["eventId", "actionId"],
    };
    if (
      !body ||
      Array.isArray(body) ||
      !Object.hasOwn(fields, body.operation) ||
      Object.keys(body).some(
        (k) =>
          !["operation", "revision", ...fields[body.operation]].includes(k),
      )
    )
      throw listError("Choose a valid outreach operation.");
    if (body.revision !== context.report.revision)
      throw listError("Project settings changed. Reload outreach.", 409);
    const state = await projectTagSnapshot(context);
    if (body.operation === "submit" || body.operation === "verify") {
      if (body.operation === "submit" && body.confirm !== true)
        throw listError("Confirm submission of this saved outcome to NXT.");
      const result = await submitOutreachAction(context, store, body.eventId, {
        verify: body.operation === "verify",
        actionId: body.actionId,
      });
      return listResponse(result, result.state === "review" ? 202 : 200);
    }
    return listResponse(
      await store[body.operation](
        context,
        state,
        body,
        getStandingsPeriods().asOf,
      ),
    );
  } catch (error) {
    return listFailure(error);
  }
}
