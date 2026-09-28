import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { ASSISTANCE_STATUSES, assistanceId } from "@/utils/stewardshipAssistance";
import { updateAssistance } from "@/app/api/utils/stewardshipAssistance";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Sign in to manage assistance requests." }, 401);
    await ensureAppSchema();
    const { sessionUser } = await getWorkspaceUser(session, request);
    if (!sessionUser?.id || sessionUser.active === false || !isReviewerRole(sessionUser.role)) return reply({ error: "Assistance requests are managed by Admin and Advancement Services." }, 403);
    const viewerKey = String(sessionUser.id);
    const url = new URL(request.url);
    if (!request.headers.get("content-type")?.includes("application/json") || request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.get("origin") && request.headers.get("origin") !== url.origin)) return reply({ error: "Submit updates from the app." }, 403);
    const body = await request.json().catch(() => null);
    if (!body || Array.isArray(body) || Object.keys(body).some(key => !["id", "viewerKey", "version", "status", "note"].includes(key)) ||
        !assistanceId(body.id) || !Number.isSafeInteger(body.version) || body.version < 1 ||
        !ASSISTANCE_STATUSES.includes(body.status) || typeof body.note !== "string" || body.note.length > 2000 || !body.note.trim()) return reply({ error: "Choose a status and add a progress note (up to 2,000 characters)." }, 400);
    if (body.viewerKey !== viewerKey) return reply({ error: "Your sign-in changed. Reload this page." }, 409);
    const item = await updateAssistance(sessionUser, body.id, { ...body, note: body.note.trim() });
    if (!item) return reply({ error: "This request changed or is unavailable. Refresh the queue to review its current status. Your draft is still here." }, 409);
    return reply({ ...item, request_viewer_id: viewerKey });
  } catch {
    return reply({ error: "The update could not be confirmed. Refresh the queue to check saved status before trying again." }, 500);
  }
}
