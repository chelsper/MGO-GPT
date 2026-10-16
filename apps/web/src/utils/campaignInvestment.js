import { campaignError, campaignId } from "./campaignPriorities";
import { campaignFieldCandidates } from "./campaignSourceMapping";

export const investmentIdFields = fields => fields.filter(field => field === "System Record ID" || campaignFieldCandidates("giftId",[field],"gift").length>0);

export const campaignInvestmentIdentity = config => JSON.stringify(config?.investment || null);
export const CAMPAIGN_CLASSIFICATIONS = [
  { key: "investment", label: "Comprehensive Investment", queryId: "31071", prefix: "investment" },
  { key: "budgetRelieving", label: "Budget Relieving", queryId: "31072", prefix: "budget" },
];
export function campaignClassification(kind = "investment") {
  const classification = CAMPAIGN_CLASSIFICATIONS.find(item => item.key === kind);
  if (!classification) throw campaignError("Unknown campaign classification.");
  return classification;
}
export const campaignClassificationIdentity = config => JSON.stringify(CAMPAIGN_CLASSIFICATIONS.map(({ key }) => config?.[key] || null));
export const campaignRefreshStages = ["waiting", "downloading", "resolving", "financial", ...CAMPAIGN_CLASSIFICATIONS.flatMap(({ prefix }) => [`${prefix}_waiting`, `${prefix}_downloading`])];
export const campaignStartingStages = ["starting", ...CAMPAIGN_CLASSIFICATIONS.map(({ prefix }) => `${prefix}_starting`)];

export function validateCampaignInvestment(input, kind = "investment") {
  const { label } = campaignClassification(kind);
  if (!input || Object.keys(input).some(key => !["queryId", "queryName", "giftIdColumn", "confirmed"].includes(key)) || input.confirmed !== true)
    throw campaignError(`Confirm that ${label} identifies gifts already included in the campaign.`);
  const queryId = campaignId(input.queryId), queryName = String(input.queryName || "").trim(), giftIdColumn = String(input.giftIdColumn || "").trim();
  if (!queryId || !queryName || queryName.length > 200 || !giftIdColumn || giftIdColumn.length > 200)
    throw campaignError(`Load the ${label} query and choose its gift system record ID.`);
  return { queryId, queryName, giftIdColumn };
}
