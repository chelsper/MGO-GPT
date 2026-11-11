import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { isAdminRole, canUseMgoWorkspaceRole } from "@/utils/workspaceRoles";
import { savePortfolioAssignmentRequest } from "@/app/api/utils/portfolioAssignmentRequests";
import { sendAdvancementServicesNotification } from "@/app/api/utils/sendSubmissionEmail";

export const maxDuration = 60;
const reply = (payload, status = 200) => Response.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message, status) => Object.assign(new Error(message), { status });

export async function POST(request) {
  try {
    const origin = new URL(request.url).origin;
    if ((request.headers.get("origin") && request.headers.get("origin") !== origin) || request.headers.get("sec-fetch-site") === "cross-site")
      throw fail("Request must come from this app.", 403);
    const session = await auth();
    if (!session?.user?.email) throw fail("Sign in before requesting an assignment.", 401);
    // A request for 'me' uses the signed-in account, never a viewed MGO workspace.
    const user = await getOrCreateUser(session);
    if (user.active !== true || !(isAdminRole(user.role) || canUseMgoWorkspaceRole(user.role)))
      throw fail("Your account cannot request a portfolio assignment.", 403);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.constituentId !== "string" || !/^\d{1,40}$/.test(body.constituentId) ||
        !["submit", "verify"].includes(body.action) || Object.keys(body).some(key => !["constituentId", "constituentName", "reason", "action", "expectedUserId"].includes(key)))
      throw fail("Choose a constituent from the search results.", 400);
    if (String(body.expectedUserId || "") !== String(user.id))
      throw fail("Your signed-in account changed. Reload before sending a request.", 409);
    if ((body.constituentName != null && (typeof body.constituentName !== "string" || body.constituentName.length > 300)) ||
        (body.reason != null && (typeof body.reason !== "string" || body.reason.length > 2000)) ||
        (body.action === "submit" && (typeof body.constituentName !== "string" || !body.constituentName.trim())))
      throw fail("Include a constituent name and keep the optional reason to 2,000 characters or fewer.", 400);
    const { request: saved, created } = await savePortfolioAssignmentRequest({
      user, constituentId: body.constituentId, constituentName: body.constituentName?.trim(),
      reason: body.reason?.trim(), verifyOnly: body.action === "verify",
    });
    if (!saved) return reply({ status: "not_submitted", message: "No saved assignment request was found. You can send a request to Advancement Services." });
    let notificationWarning = null;
    if (created) {
      const notification = await sendAdvancementServicesNotification({
        title: "Portfolio assignment request",
        text: `Request #${saved.id}\n\n${saved.request_note}\n\nReview in Advancement Services > Data Updates.`,
      }).catch(() => ({ status: "failed" }));
      if (notification?.status !== "sent") notificationWarning = "The request is saved in the queue, but its email notification could not be confirmed.";
    }
    return reply({
      status: "requested", requestId: String(saved.id), reviewStatus: saved.status,
      message: created ? "Request sent to Advancement Services for review. No portfolio or NXT assignment has been changed."
        : `Your existing request is ${saved.status.toLowerCase()}. No duplicate request was sent.`,
      notificationWarning,
    });
  } catch (error) {
    return reply({ error: error.status ? error.message : "The request could not be confirmed. Check request status before sending again." }, error.status || 503);
  }
}
