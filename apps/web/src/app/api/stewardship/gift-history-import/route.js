import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { readGiftInventory } from "@/app/api/utils/stewardshipInventory";
import { advanceHistoryImport, readHistoryState, publicHistoryState } from "@/app/api/utils/stewardshipHistoryImport";

const reply = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
async function access(request) {
  const session = await auth();
  if (!session?.user?.email) return { error: reply({ error: "Sign in to import gift history." }, 401) };
  await ensureAppSchema();
  const { sessionUser: actor } = await getWorkspaceUser(session, request);
  if (!actor?.id || actor.active === false || !isReviewerRole(actor.role)) return { error: reply({ error: "Only Admin and Advancement Services can import gift history." }, 403) };
  return { actor, viewerKey: String(actor.id), sessionKey: String(session.user.id || session.user.email) };
}
export async function GET(request) {
  try {
    const context = await access(request);
    if (context.error) return context.error;
    const state = await readHistoryState(context.actor);
    return reply({ viewerKey: context.viewerKey, sessionKey: context.sessionKey, state: publicHistoryState(state, context.actor),
      items: (await readGiftInventory(context.actor)).map(({ id, name, version, archived_at }) => ({ id, name, version, archived_at })) });
  } catch { return reply({ error: "Gift import settings could not be loaded. Try again." }, 500); }
}
export async function POST(request) {
  try {
    const context = await access(request);
    if (context.error) return context.error;
    if (!request.headers.get("content-type")?.includes("application/json") || request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin))
      return reply({ error: "Run this import from the app." }, 403);
    const text = await request.text();
    if (text.length > 64000) return reply({ error: "Use a smaller mapping configuration." }, 413);
    let command;
    try { command = JSON.parse(text); } catch { return reply({ error: "Check the import settings." }, 400); }
    const fields = { start: ["queryId", "confirmed"], check: [], preview: ["mapping"], resolve: [], commit: ["confirmed"] };
    if (!command || !Object.hasOwn(fields, command.operation) || !Number.isSafeInteger(command.version) || command.version < 1 ||
        Object.keys(command).some(key => !["operation", "version", "viewerKey", ...fields[command.operation]].includes(key)))
      return reply({ error: "Check the import settings." }, 400);
    if (command.viewerKey !== context.viewerKey) return reply({ error: "Your sign-in changed. Reload this page." }, 409);
    const state = await advanceHistoryImport(context.actor, command, new URL(request.url).origin);
    return reply({ viewerKey: context.viewerKey, sessionKey: context.sessionKey, state: publicHistoryState(state, context.actor) });
  } catch (error) {
    return reply({ error: error.historySafe ? error.message : "Import status could not be confirmed. Reload saved status before continuing." }, 409);
  }
}
