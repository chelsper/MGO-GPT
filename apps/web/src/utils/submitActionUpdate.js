// Both entry points use the existing guarded NXT writers, never a separate create.
export async function submitActionUpdate(actionBody, {
  prospectId = null,
  linkedOpportunityIdOverride = null,
} = {}) {
  const endpoint = prospectId
    ? `/api/prospects/${prospectId}/actions`
    : "/api/submissions/donor-update";
  const body = prospectId ? {
    actionDate: actionBody.actionDate || new Date().toISOString().slice(0, 10),
    actionCategory: actionBody.actionCategory,
    interactionType: actionBody.interactionType,
    summary: actionBody.summary || "",
    notes: actionBody.notes,
    nextStep: actionBody.nextStep,
    nextActionDueDate: actionBody.nextActionDueDate || null,
    additionalFundraiserUserId: actionBody.additionalFundraiserUserId || null,
    linkedOpportunityId: actionBody.linkedOpportunityId || linkedOpportunityIdOverride || null,
    ...(actionBody.portfolioContext ? { portfolioContext: actionBody.portfolioContext } : {}),
  } : actionBody;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data?.error || "Could not save the action."), {
      writeReceipt: data?.writeReceipt,
      notSubmitted: data?.notSubmitted === true,
    });
  }
  return { action: data, actionEndpoint: endpoint, actionResolvedProspectId: prospectId };
}
