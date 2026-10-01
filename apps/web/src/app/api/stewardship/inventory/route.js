import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { readGiftStockHistory } from "@/app/api/utils/stewardshipStock";
import { isReviewerRole } from "@/utils/workspaceRoles";
import {
  inventoryId,
  validateInventoryCommand,
} from "@/utils/stewardshipInventory";
import {
  readGiftInventory,
  readGiftItemHistory,
  writeGiftInventory,
} from "@/app/api/utils/stewardshipInventory";

const reply = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
export async function inventoryAccess(request) {
  const session = await auth();
  if (!session?.user?.email)
    return { error: reply({ error: "Sign in to view gift inventory." }, 401) };
  await ensureAppSchema();
  const { sessionUser } = await getWorkspaceUser(session, request);
  if (
    !sessionUser?.id ||
    sessionUser.active === false ||
    !isReviewerRole(sessionUser.role)
  )
    return {
      error: reply(
        {
          error: "Gift inventory is managed by Admin and Advancement Services.",
        },
        403,
      ),
    };
  return {
    actor: sessionUser,
    viewerKey: String(session.user.id || session.user.email),
  };
}
export async function GET(request) {
  try {
    const context = await inventoryAccess(request);
    if (context.error) return context.error;
    const id = new URL(request.url).searchParams.get("id");
    if (id !== null && !inventoryId(id))
      return reply({ error: "Choose a saved gift item." }, 400);
    return reply({
      viewerKey: context.viewerKey,
      ...(id === null
        ? { items: await readGiftInventory(context.actor) }
        : { id, events: await readGiftItemHistory(context.actor, id), stockEvents: await readGiftStockHistory(context.actor, id) }),
    });
  } catch {
    return reply(
      { error: "Gift inventory could not be loaded. Try reloading the page." },
      500,
    );
  }
}
export async function POST(request) {
  try {
    const context = await inventoryAccess(request);
    if (context.error) return context.error;
    if (
      !request.headers.get("content-type")?.includes("application/json") ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.get("origin") &&
        request.headers.get("origin") !== new URL(request.url).origin)
    )
      return reply({ error: "Make inventory changes from the app." }, 403);
    const reader = request.body?.getReader();
    const parts = []; let size = 0;
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 160 * 1024) { await reader.cancel(); return reply({ error: "Item details are too large. Choose a smaller photo." }, 413); }
          parts.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    let body = null;
    try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { /* Validation handles malformed JSON. */ }
    const command = validateInventoryCommand(body);
    if (!command)
      return reply({ error: "Check the item details and try again." }, 400);
    if (command.viewerKey !== context.viewerKey)
      return reply({ error: "Your sign-in changed. Reload this page." }, 409);
    const items = await writeGiftInventory(context.actor, command);
    if (!items || (command.operation !== "import" && !items.length))
      return reply(
        {
          error:
            command.operation === "stock" ? "Stock changed, the item is archived, or this count cannot be applied. Close and reload inventory before trying again. Your draft has not been overwritten." : "This item changed or already exists. Close this form and reload inventory before trying again. Your draft has not been overwritten.",
        },
        409,
      );
    return reply({ viewerKey: context.viewerKey, items, added: items.length });
  } catch (error) {
    if (error?.code === "23505")
      return reply(
        {
          error:
            "An item with this name already exists, possibly in Archived. Use a different name or restore the existing item.",
        },
        409,
      );
    return reply(
      {
        error:
          "The save could not be confirmed. Close this form and reload inventory to check its saved status before trying again.",
      },
      500,
    );
  }
}
