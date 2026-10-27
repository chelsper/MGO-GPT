import sql from "./sql";
import ensureAppSchema from "./ensureAppSchema";
import { isAssignedPortfolioConstituent } from "./portfolioContactRefresh";
import { canEditWorkspace } from "@/utils/workspaceRoles";
import { portfolioOpportunityValidation } from "@/utils/portfolioOpportunity";
import { createConstituent } from "./constituents";
import { getFiscalYearFromExpectedDate } from "./prospectOpportunities";

const rejected = (message, status = 409) => Object.assign(new Error(message), { portfolioPreflight: true, status });

export async function checkPortfolioOpportunityScope(context, scope) {
  if (!canEditWorkspace(context)) throw rejected("This workspace is read-only.", 403);
  if (String(scope?.viewerId) !== String(context.sessionUser.id) || String(scope?.workspaceId) !== String(context.workspaceUser.id))
    throw rejected("Your workspace changed. Close this draft and reopen Add opportunity in the correct portfolio.");
  if (!/^[1-9]\d*$/.test(String(scope?.constituentId || ""))) throw rejected("A constituent system ID is required.", 400);
  await ensureAppSchema();
  if (!await isAssignedPortfolioConstituent(context.workspaceUser.id, String(scope.constituentId)))
    throw rejected("This constituent is no longer in this MGO's saved portfolio. Reload the portfolio before continuing.", 403);
}

export function validatePortfolioOpportunity(body) {
  const scope = body.portfolioContext;
  if (String(body.blackbaudConstituentId) !== String(scope?.constituentId)
    || body.createNewOpportunity !== true || body.createNewConstituent || body.constituentId || body.linkedOpportunityId
    || (body.jointMgoUserIds != null && (!Array.isArray(body.jointMgoUserIds) || body.jointMgoUserIds.length))
    || (body.attachments != null && (!Array.isArray(body.attachments) || body.attachments.length)) || body.sharedOpportunityKey)
    throw rejected("This panel creates one new opportunity for the selected constituent. Use the full form for advanced options.", 400);
  if (typeof body.donorName !== "string" || !body.donorName.trim() || body.donorName.length > 500)
    throw rejected("Reload the selected constituent before continuing.", 400);
  const error = portfolioOpportunityValidation(body);
  if (error) throw rejected(error, 400);
}

export async function findPortfolioProspect(userId, constituentId) {
  // Exact IDs only: never relink another constituent based on a matching name.
  const rows = await sql`
    SELECT p.* FROM prospects p LEFT JOIN constituents c ON c.id = p.constituent_id
    WHERE p.user_id = ${userId} AND p.status <> 'Archived'
      AND (p.blackbaud_constituent_id = ${constituentId} OR c.blackbaud_constituent_id = ${constituentId})
      AND (NULLIF(p.blackbaud_constituent_id, '') IS NULL OR p.blackbaud_constituent_id = ${constituentId})
      AND (NULLIF(c.blackbaud_constituent_id, '') IS NULL OR c.blackbaud_constituent_id = ${constituentId})
    ORDER BY CASE WHEN p.status = 'Active' THEN 0 ELSE 1 END, p.id LIMIT 1
  `;
  return rows[0] || null;
}

export async function readPortfolioOpportunities(userId, constituentId) {
  const rows = await sql`
    SELECT DISTINCT ON (COALESCE(NULLIF(po.blackbaud_opportunity_id, ''), 'app:' || po.id::text))
      po.id, po.title, po.current_stage, po.estimated_amount, po.expected_date, po.blackbaud_opportunity_id, po.updated_at
    FROM prospect_opportunities po JOIN prospects p ON p.id = po.prospect_id
    LEFT JOIN constituents c ON c.id = COALESCE(po.constituent_id, p.constituent_id)
    WHERE p.user_id = ${userId} AND p.status <> 'Archived' AND po.opportunity_status = 'Active'
      AND (p.blackbaud_constituent_id = ${constituentId} OR c.blackbaud_constituent_id = ${constituentId})
      AND (NULLIF(p.blackbaud_constituent_id, '') IS NULL OR p.blackbaud_constituent_id = ${constituentId})
      AND (NULLIF(c.blackbaud_constituent_id, '') IS NULL OR c.blackbaud_constituent_id = ${constituentId})
      AND COALESCE(po.closed_amount, 0) <= 0
      AND LOWER(REGEXP_REPLACE(TRIM(COALESCE(po.current_stage, '')), '[[:space:]\u2013\u2014-]+', ' ', 'g'))
        NOT IN ('funded', 'withdrawn', 'declined', 'closed gift secured', 'closed withdrawn', 'closed declined')
    ORDER BY COALESCE(NULLIF(po.blackbaud_opportunity_id, ''), 'app:' || po.id::text), po.updated_at DESC LIMIT 51
  `;
  return { opportunities: rows.slice(0, 50), truncated: rows.length > 50 };
}

export async function ensurePortfolioProspect(userId, body) {
  const constituentId = String(body.blackbaudConstituentId);
  const existing = await findPortfolioProspect(userId, constituentId);
  if (existing) return existing;
  const [savedConstituent] = await sql`SELECT id FROM constituents
    WHERE user_id = ${userId} AND blackbaud_constituent_id = ${constituentId} ORDER BY id LIMIT 1`;
  const constituent = savedConstituent || await createConstituent(userId, body.donorName, constituentId);
  if (!constituent?.id) throw new Error("The app constituent could not be saved. Check the existing NXT submission; do not resend it.");
  const [prospect] = await sql`
    INSERT INTO prospects (user_id, constituent_id, blackbaud_constituent_id, prospect_name,
      expected_close_fy, ask_amount, ask_type, priority_order)
    SELECT ${userId}, ${constituent.id}, ${constituentId}, ${body.donorName},
      ${getFiscalYearFromExpectedDate(body.expectedDate)}, ${body.askAmount}, 'Major Gift', COALESCE(MAX(priority_order), 0) + 1
    FROM prospects WHERE user_id = ${userId}
    RETURNING *
  `;
  if (!prospect) throw new Error("The app prospect could not be saved. Check the existing NXT submission; do not resend it.");
  return prospect;
}

export async function readPortfolioProspectSummary(userId, prospectId) {
  const [row] = await sql`
    SELECT p.*, stats.portfolio_open_opportunity_count, stats.portfolio_open_pipeline_amount
    FROM prospects p CROSS JOIN LATERAL (
      SELECT COUNT(*) AS portfolio_open_opportunity_count, COALESCE(SUM(po.estimated_amount), 0) AS portfolio_open_pipeline_amount
      FROM prospect_opportunities po WHERE po.prospect_id = p.id AND po.opportunity_status = 'Active'
        AND COALESCE(po.closed_amount, 0) <= 0
        AND LOWER(REGEXP_REPLACE(TRIM(COALESCE(po.current_stage, '')), '[[:space:]\u2013\u2014-]+', ' ', 'g'))
          NOT IN ('funded', 'withdrawn', 'declined', 'closed gift secured', 'closed withdrawn', 'closed declined')
    ) stats WHERE p.id = ${prospectId} AND p.user_id = ${userId}
  `;
  return row || null;
}
