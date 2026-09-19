import { auth } from "@/auth";
import ensureAppSchema from "./ensureAppSchema";
import getOrCreateUser from "./getOrCreateUser";
import { getListRecord, listError, serializeList } from "./listConfigurations";
import { validateListSource } from "@/utils/constituentLists";

export function requireListSameOrigin(request) {
  if (
    (request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw listError("Request must come from this app.", 403);
}

export async function listContext(request, key) {
  const session = await auth();
  if (!session?.user?.email) throw listError("Unauthorized", 401);
  await ensureAppSchema();
  const user = await getOrCreateUser(session, "admin");
  if (user?.active !== true) throw listError("Inactive account", 403);
  const record = await getListRecord(key);
  if (!record) throw listError("List not found.", 404);
  const report = serializeList(record, user);
  if (!report.canView)
    throw listError("This list is not enabled for you.", 403);
  if (validateListSource(report.dataConfiguration))
    throw listError(
      "The list source needs to be configured before it can be used.",
      422,
    );
  return { user, report, origin: new URL(request.url).origin };
}

export const listResponse = (payload, status = 200) =>
  Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export const listFailure = (error) =>
  listResponse(
    {
      error: error.status
        ? error.message
        : "The list request could not finish. Saved results remain available; reload status before trying again.",
    },
    error.status || 503,
  );
