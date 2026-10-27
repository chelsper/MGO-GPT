import { calendarDate } from "./prospectActivity";

export const PORTFOLIO_OPPORTUNITY_STAGES = [
  "Identification", "Qualification", "Cultivation", "Solicitation", "Solicitation - Verbal", "Stewardship",
];
export const DEFAULT_OPPORTUNITY_PURPOSE = "Future. Made. Campaign";

export function portfolioOpportunityValidation(body) {
  if (typeof body.opportunityTitle !== "string" || !body.opportunityTitle.trim() || body.opportunityTitle.length > 255)
    return "Enter an opportunity name of up to 255 characters.";
  if (typeof body.purpose !== "string" || !body.purpose.trim() || body.purpose.length > 255)
    return "Enter a purpose of up to 255 characters.";
  if (!PORTFOLIO_OPPORTUNITY_STAGES.includes(body.opportunityStage)) return "Choose an open opportunity stage. Use the full form for a closed opportunity.";
  if (typeof body.askAmount !== "number" || !Number.isFinite(body.askAmount) || body.askAmount < 0 || body.askAmount > 999999999999.99
    || Math.round(body.askAmount * 100) / 100 !== body.askAmount)
    return "Enter a nonnegative amount with no more than two decimal places.";
  if (!calendarDate(body.expectedDate) || body.expectedDate !== calendarDate(body.expectedDate)) return "Enter a valid expected date.";
  if (body.askDate && body.askDate !== calendarDate(body.askDate)) return "Enter a valid ask date.";
  if (body.notes != null && (typeof body.notes !== "string" || body.notes.length > 10000)) return "Keep notes within 10,000 characters.";
  return null;
}
