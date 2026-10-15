import { campaignError, campaignId } from "./campaignPriorities";
import { campaignFieldCandidates } from "./campaignSourceMapping";

export const investmentIdFields = fields => fields.filter(field => field === "System Record ID" || campaignFieldCandidates("giftId",[field],"gift").length>0);

export const campaignInvestmentIdentity = config => JSON.stringify(config?.investment || null);
export const campaignRefreshStages = ["waiting", "downloading", "resolving", "financial", "investment_waiting", "investment_downloading"];

export function validateCampaignInvestment(input) {
  if (!input || Object.keys(input).some(key => !["queryId", "queryName", "giftIdColumn", "confirmed"].includes(key)) || input.confirmed !== true)
    throw campaignError("Confirm that Comprehensive Investment identifies gifts already included in the campaign.");
  const queryId = campaignId(input.queryId), queryName = String(input.queryName || "").trim(), giftIdColumn = String(input.giftIdColumn || "").trim();
  if (!queryId || !queryName || queryName.length > 200 || !giftIdColumn || giftIdColumn.length > 200)
    throw campaignError("Load the Comprehensive Investment query and choose its gift system record ID.");
  return { queryId, queryName, giftIdColumn };
}
