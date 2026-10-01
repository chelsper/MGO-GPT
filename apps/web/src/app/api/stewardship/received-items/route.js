import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isMgoRole, isReviewerRole } from "@/utils/workspaceRoles";
import { receiptCommand, receiptFilters } from "@/utils/stewardshipReceipts";
import {
  readGiftReceipts,
  writeGiftReceipt,
} from "@/app/api/utils/stewardshipReceipts";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
async function access(request, write = false) {
  const session = await auth();
  if (!session?.user?.email)
    return { error: reply({ error: "Sign in to view received items." }, 401) };
  await ensureAppSchema();
  const { sessionUser: actor } = await getWorkspaceUser(session, request);
  if (
    !actor?.id ||
    actor.active === false ||
    !(isReviewerRole(actor.role) || (!write && isMgoRole(actor.role)))
  )
    return {
      error: reply(
        { error: "This account cannot access received items." },
        403,
      ),
    };
  return {
    actor,
    viewerKey: String(actor.id),
    sessionKey: String(session.user.id || session.user.email),
  };
}
export async function GET(request) {
  try {
    const context = await access(request);
    if (context.error) return context.error;
    const filters = receiptFilters(new URL(request.url).searchParams);
    if (!filters)
      return reply({ error: "Check the received-item filters." }, 400);
    const rows = await readGiftReceipts(context.actor, filters);
    const items = rows.slice(0, 50);
    return reply({
      viewerKey: context.viewerKey,
      sessionKey: context.sessionKey,
      canManage: isReviewerRole(context.actor.role),
      items,
      next: rows.length > 50 ? items.at(-1).id : null,
    });
  } catch {
    return reply(
      { error: "Received items could not be loaded. Try again." },
      500,
    );
  }
}
export async function POST(request) {
  try {
    const context = await access(request, true);
    if (context.error) return context.error;
    if (
      !request.headers.get("content-type")?.includes("application/json") ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.get("origin") &&
        request.headers.get("origin") !== new URL(request.url).origin)
    )
      return reply({ error: "Record received items from the app." }, 403);
    const command = receiptCommand(await request.json().catch(() => null));
    if (!command)
      return reply(
        {
          error:
            "Check the date and item, and confirm receipt. A correction needs a reason.",
        },
        400,
      );
    if (command.viewerKey !== context.viewerKey)
      return reply({ error: "Your sign-in changed. Reload this page." }, 409);
    const receipt = await writeGiftReceipt(context.actor, command);
    if (!receipt)
      return reply(
        {
          error:
            "This request changed, receipt is already recorded, or the date is in the future. Reload saved details before continuing.",
        },
        409,
      );
    return reply({ viewerKey: context.viewerKey, receipt });
  } catch {
    return reply(
      {
        error:
          "Saved status could not be confirmed. Reload received items before trying again.",
      },
      500,
    );
  }
}
