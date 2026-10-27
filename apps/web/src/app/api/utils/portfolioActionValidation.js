import { ACTION_CATEGORIES, INTERACTION_TYPES, validNextStepActionDate } from "@/utils/actionEntryOptions";

export const portfolioActionRejected = (error, status = 400) =>
  Response.json({ error, notSubmitted: true }, { status });

// Optional for the legacy full form; required in every portfolio-panel request.
// Server permissions still run first. These checks pin a draft to its original
// viewer, workspace and constituent rather than trusting a changed workspace cookie.
export function validatePortfolioAction(body, context, constituentId) {
  if (!body?.portfolioContext) return null;
  const scope = body.portfolioContext;
  if (String(scope.viewerId) !== String(context.sessionUser?.id)
    || String(scope.workspaceId) !== String(context.workspaceUser?.id)) {
    return portfolioActionRejected("Your workspace changed. Close this draft and reopen Log action in the correct portfolio.", 409);
  }
  if (!/^[1-9]\d*$/.test(String(scope.constituentId || ""))
    || String(scope.constituentId) !== String(constituentId)) {
    return portfolioActionRejected("This prospect no longer matches the selected constituent. Reload the portfolio before logging an action.", 409);
  }
  if (!validNextStepActionDate("completed", body.actionDate, new Date().toISOString().slice(0, 10))
    || !ACTION_CATEGORIES.includes(body.actionCategory)
    || !INTERACTION_TYPES.includes(body.interactionType)
    || typeof body.summary !== "string" || !body.summary.trim() || body.summary.length > 255
    || (body.notes != null && (typeof body.notes !== "string" || body.notes.length > 10000))) {
    return portfolioActionRejected("Enter a valid completed-action date, category, type, and summary (up to 255 characters).");
  }
  return null;
}
