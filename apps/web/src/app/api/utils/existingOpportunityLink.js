import sql from "./sql";
import { blackbaudApiFetch } from "./blackbaud";
import { normalizeLinkedOpportunity } from "./prospectOpportunityRefresh";
import opportunityLinkTransaction from "./opportunityLinkTransaction";

export const linkError = (message, status = 409) => Object.assign(new Error(message), { linkStatus: status });
export const systemId = value => /^[1-9]\d{0,18}$/.test(String(value || ""));

export async function loadLinkProspect(userId, prospectId) {
  const [row] = await sql`
    SELECT p.id, p.user_id, p.constituent_id, p.blackbaud_constituent_id, p.status,
      c.blackbaud_constituent_id AS linked_nxt_id, u.blackbaud_constituent_id AS fundraiser_id
    FROM prospects p LEFT JOIN constituents c ON c.id = p.constituent_id
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${prospectId} AND p.user_id = ${userId}
  `;
  if (!row) throw linkError("Prospect not found.", 404);
  if (row.status !== "Active") throw linkError("Restore this prospect to Active before linking an opportunity.");
  const ids = [row.blackbaud_constituent_id, row.linked_nxt_id].filter(Boolean).map(String);
  if (!ids.length || !ids.every(id => systemId(id) && id === ids[0]))
    throw linkError("This prospect needs one verified NXT constituent link before continuing.");
  if (!systemId(row.fundraiser_id)) throw linkError("The workspace's MGO needs a verified NXT fundraiser ID before continuing.");
  return { ...row, nxtId: ids[0] };
}

export function candidateOpportunity(remote, prospect) {
  if (!systemId(remote?.id)) throw linkError("NXT returned an invalid opportunity ID.");
  const normalized = normalizeLinkedOpportunity(remote, { blackbaud_opportunity_id: String(remote.id) }, prospect.nxtId);
  const assigned = Array.isArray(remote.fundraisers) && remote.fundraisers.some(f => String(f.constituent_id) === String(prospect.fundraiser_id));
  if (!assigned || normalized.opportunity_status !== "Active" || /closed|archived|inactive|complete/i.test(normalized.current_stage)) return null;
  return { id: String(remote.id), ...normalized };
}

export async function listLinkCandidates(context, prospect) {
  // One constituent-scoped read, on demand only. No portfolio scan or silent
  // truncation, and no extra requests when Blackbaud asks us to pause.
  const payload = await blackbaudApiFetch("/opportunity/v1/opportunities", {
    ...context, method: "GET", maxRetries: 0, timeoutMs: 10_000,
    searchParams: { constituent_id: prospect.nxtId, limit: 100 },
  });
  if (!Array.isArray(payload?.value) || payload.next_link || payload.value.length > 100 || Number(payload.count) > payload.value.length)
    throw linkError("NXT did not return a complete opportunity list. Please try again later.", 503);
  const links = await sql`
    SELECT po.blackbaud_opportunity_id, po.prospect_id
    FROM prospect_opportunities po JOIN prospects p ON p.id = po.prospect_id
    WHERE p.user_id = ${prospect.user_id} AND po.blackbaud_opportunity_id IS NOT NULL
  `;
  const seen = new Set();
  const opportunities = [];
  for (const remote of payload.value) {
    if (seen.has(String(remote.id))) throw linkError("NXT returned duplicate opportunity records. Please try again later.", 503);
    seen.add(String(remote.id));
    const candidate = candidateOpportunity(remote, prospect);
    if (!candidate) continue;
    const saved = links.filter(link => String(link.blackbaud_opportunity_id) === candidate.id);
    opportunities.push({ ...candidate, linkState: !saved.length ? "available"
      : saved.length === 1 && String(saved[0].prospect_id) === String(prospect.id) ? "linked" : "elsewhere" });
  }
  return opportunities;
}

export async function linkExistingOpportunity(context, prospect, opportunityId) {
  const remote = await blackbaudApiFetch(`/opportunity/v1/opportunities/${encodeURIComponent(opportunityId)}`, {
    ...context, method: "GET", maxRetries: 0, timeoutMs: 10_000,
  });
  if (String(remote?.id) !== opportunityId) throw linkError("NXT returned a different opportunity. Nothing was linked.");
  const next = candidateOpportunity(remote, prospect);
  if (!next) throw linkError("This opportunity is no longer open and assigned to this MGO. Reload the list before continuing.");
  const results = await opportunityLinkTransaction(opportunityId, [
    sql`SELECT id FROM prospects WHERE id = ${prospect.id} AND user_id = ${prospect.user_id} FOR UPDATE`,
    sql`
      WITH target AS (
        SELECT p.id, p.constituent_id FROM prospects p
        LEFT JOIN constituents c ON c.id = p.constituent_id JOIN users u ON u.id = p.user_id
        WHERE p.id = ${prospect.id} AND p.user_id = ${prospect.user_id} AND p.status = 'Active'
          AND u.active IS NOT FALSE AND u.blackbaud_constituent_id = ${String(prospect.fundraiser_id)}
          AND COALESCE(NULLIF(p.blackbaud_constituent_id, ''), c.blackbaud_constituent_id) = ${prospect.nxtId}
          AND (NULLIF(c.blackbaud_constituent_id, '') IS NULL OR c.blackbaud_constituent_id = ${prospect.nxtId})
          AND NOT EXISTS (
            SELECT 1 FROM prospect_opportunities po JOIN prospects other ON other.id = po.prospect_id
            LEFT JOIN constituents oc ON oc.id = COALESCE(po.constituent_id, other.constituent_id)
            WHERE po.blackbaud_opportunity_id = ${opportunityId}
              AND (po.pipeline_change_id IS NOT NULL
                OR (other.user_id = ${prospect.user_id} AND other.id <> p.id)
                OR COALESCE(NULLIF(other.blackbaud_constituent_id, ''), oc.blackbaud_constituent_id, '') <> ${prospect.nxtId}
                OR (NULLIF(oc.blackbaud_constituent_id, '') IS NOT NULL AND oc.blackbaud_constituent_id <> ${prospect.nxtId}))
          )
      ), existing AS (
        SELECT po.id FROM prospect_opportunities po JOIN target t ON t.id = po.prospect_id
        WHERE po.blackbaud_opportunity_id = ${opportunityId}
      ), inserted AS (
        INSERT INTO prospect_opportunities (prospect_id, constituent_id, blackbaud_opportunity_id,
          title, purpose, current_stage, opportunity_status, estimated_amount, ask_date, expected_date, nxt_checked_at)
        SELECT t.id, t.constituent_id, ${opportunityId}, ${next.title}, ${next.purpose}, ${next.current_stage},
          'Active', ${next.estimated_amount}, ${next.ask_date}::date, ${next.expected_date}::date, NOW()
        FROM target t WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id
      )
      SELECT id, false AS already_linked FROM inserted
      UNION ALL SELECT id, true AS already_linked FROM existing WHERE (SELECT COUNT(*) FROM existing) = 1
    `,
    sql`
      UPDATE prospects p SET ask_amount = (
        SELECT COALESCE(SUM(estimated_amount), 0) FROM prospect_opportunities WHERE prospect_id = p.id AND opportunity_status = 'Active'
      ) WHERE p.id = ${prospect.id} AND p.user_id = ${prospect.user_id} AND p.status = 'Active'
        AND EXISTS (SELECT 1 FROM prospect_opportunities WHERE prospect_id = p.id AND blackbaud_opportunity_id = ${opportunityId})
    `,
    sql`UPDATE users SET blackbaud_summary_cache = NULL, blackbaud_summary_cache_key = NULL, blackbaud_summary_cached_at = NULL
      WHERE id = ${prospect.user_id} AND EXISTS (
        SELECT 1 FROM prospect_opportunities WHERE prospect_id = ${prospect.id} AND blackbaud_opportunity_id = ${opportunityId}
      )`,
    sql`UPDATE portfolio_constituent_snapshots SET stale_after = NOW()
      WHERE workspace_user_id = ${prospect.user_id} AND constituent_id = ${prospect.nxtId}
        AND EXISTS (SELECT 1 FROM prospect_opportunities WHERE prospect_id = ${prospect.id} AND blackbaud_opportunity_id = ${opportunityId})`,
  ]);
  const linked = results[2]?.[0];
  if (!linked) throw linkError("The saved prospect or opportunity link changed, conflicts with another record, or has an update in progress. Reload before continuing; no opportunity was created in NXT.");
  return { opportunityId: linked.id, alreadyLinked: linked.already_linked, expectedDateNeeded: !next.expected_date };
}
