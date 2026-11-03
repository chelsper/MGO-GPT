import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isMgoRole, isReviewerRole } from "@/utils/workspaceRoles";
import { assistanceId } from "@/utils/stewardshipAssistance";
import {
  fulfillmentCommand,
  matchesFulfillmentAction,
} from "@/utils/stewardshipFulfillment";
import {
  readFulfillmentRequest,
  saveFulfillment,
  acknowledgeFulfillment,
} from "@/app/api/utils/stewardshipFulfillment";
import { getBlackbaudAction } from "@/app/api/utils/blackbaud";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
async function actorFor(request) {
  const session = await auth();
  if (!session?.user?.email) return null;
  await ensureAppSchema();
  const { sessionUser } = await getWorkspaceUser(session, request);
  return sessionUser?.active !== false &&
    (isReviewerRole(sessionUser?.role) || isMgoRole(sessionUser?.role))
    ? sessionUser
    : null;
}
export async function GET(request) {
  try {
    const actor = await actorFor(request);
    if (!actor)
      return reply({ error: "Sign in with an authorized account." }, 403);
    const params = new URL(request.url).searchParams;
    if (
      params.get("viewerKey") !== String(actor.id) ||
      !assistanceId(params.get("requestId"))
    )
      return reply(
        { error: "Reload this request from your own workspace." },
        409,
      );
    const item = await readFulfillmentRequest(actor, params.get("requestId"));
    return item
      ? reply({ request: item, viewerKey: String(actor.id) })
      : reply({ error: "Request unavailable." }, 404);
  } catch {
    return reply(
      { error: "Saved status could not load. Nothing was changed." },
      500,
    );
  }
}
export async function POST(request) {
  try {
    const actor = await actorFor(request);
    if (!actor)
      return reply({ error: "Sign in with an authorized account." }, 403);
    const origin = new URL(request.url).origin;
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json" ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.get("origin") &&
        request.headers.get("origin") !== origin)
    )
      return reply({ error: "Save from the app." }, 403);
    // Bound input before parsing, including requests without a Content-Length.
    const reader = request.body?.getReader();
    let text = "",
      size = 0;
    const decoder = new TextDecoder();
    if (reader)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16000) {
          await reader.cancel();
          return reply({ error: "Request too large." }, 413);
        }
        text += decoder.decode(value, { stream: true });
      }
    let body;
    try {
      body = JSON.parse(text + decoder.decode());
    } catch {
      return reply({ error: "Invalid request." }, 400);
    }
    if (body?.viewerKey !== String(actor.id))
      return reply({ error: "Your sign-in changed. Reload the request." }, 409);
    if (body.operation === "acknowledge") {
      if (
        Object.keys(body).some(
          (key) =>
            !["operation", "viewerKey", "requestId", "version"].includes(key),
        ) ||
        !assistanceId(body.requestId) ||
        !Number.isSafeInteger(body.version) ||
        body.version < 1
      )
        return reply(
          { error: "Reload the update before marking it seen." },
          400,
        );
      const saved = await acknowledgeFulfillment(
        actor,
        body.requestId,
        body.version,
      );
      return saved
        ? reply({ acknowledged: true, viewerKey: String(actor.id) })
        : reply({ error: "This update changed. Reload it." }, 409);
    }
    if (!isReviewerRole(actor.role))
      return reply(
        {
          error: "Only Admin and Advancement Services can record fulfillment.",
        },
        403,
      );
    let command;
    try {
      command = fulfillmentCommand(body);
    } catch (error) {
      return reply({ error: error.message }, 400);
    }
    const current = await readFulfillmentRequest(actor, command.requestId);
    if (!current) return reply({ error: "Request unavailable." }, 404);
    let verified = null;
    if (command.actionId) {
      // Only GET: never creates, patches, or retries an external action write.
      let action;
      try {
        action = await getBlackbaudAction({
          userId: actor.id,
          authUserId: actor.id,
          origin,
          actionId: command.actionId,
          maxRetries: 0,
          timeoutMs: 10000,
        });
      } catch {
        return reply(
          {
            error:
              "NXT could not verify the existing action. No completion was saved. Check access or save without a link; no NXT action will be created.",
          },
          502,
        );
      }
      verified = {
        actionId: command.actionId,
        constituentId: current.blackbaud_constituent_id,
        date: command.date,
      };
      if (!matchesFulfillmentAction(action, verified))
        return reply(
          {
            error:
              "The NXT action must belong to this donor, be completed, and match the recorded date. Nothing was changed.",
          },
          409,
        );
    }
    const saved = await saveFulfillment(actor, body, verified);
    if (!saved)
      return reply(
        {
          error:
            "The request, receipt, or stock changed. Reload saved status. Confirm the selected item and date; only one follow-up can be added per request.",
        },
        409,
      );
    const updated = await readFulfillmentRequest(actor, command.requestId);
    if (!updated) throw new Error("Unconfirmed save");
    return reply({ request: updated, viewerKey: String(actor.id) });
  } catch {
    return reply(
      {
        error:
          "The result could not be confirmed. Check saved status before trying again; your draft is preserved.",
      },
      500,
    );
  }
}
