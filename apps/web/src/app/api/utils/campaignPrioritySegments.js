import { ORGANIZATION_REPORTING_POLICY } from "@/utils/organizationRuntimePolicy";

// Aggregate the published snapshot, not a page of gifts. Unusable dates stay in
// their own bucket so the fiscal-year amounts still reconcile to the campaign.
export function campaignFiscalYearQuery(db) {
  const startMonth = ORGANIZATION_REPORTING_POLICY.fiscalYearStartMonth;
  return db`WITH dated AS (
      SELECT e.amount_cents,e.effective_cents,
        regexp_match(trim(e.gift_date),'^([0-9]{4})-([0-9]{2})-([0-9]{2})$') AS iso,
        regexp_match(trim(e.gift_date),'^([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})$') AS us
      FROM campaign_priority_effective e JOIN campaign_priority_state s ON s.id=1 AND s.published_run=e.run_id
    ), parts AS (
      SELECT *,COALESCE(iso[1],us[3])::int AS year,
        COALESCE(iso[2],us[1])::int AS month,COALESCE(iso[3],us[2])::int AS day FROM dated
    ), checked AS (
      SELECT *,CASE WHEN year BETWEEN 1000 AND 9998 AND month BETWEEN 1 AND 12 AND day BETWEEN 1 AND 31
        THEN make_date(year,month,1)+(day-1) ELSE NULL END AS date FROM parts
    ) SELECT CASE WHEN EXTRACT(MONTH FROM date)=month
        THEN year+CASE WHEN ${startMonth}<>1 AND month>=${startMonth} THEN 1 ELSE 0 END ELSE NULL END AS fiscal_year,
      COUNT(*)::int AS allocations,SUM(amount_cents)::text AS original_cents,SUM(effective_cents)::text AS effective_cents
    FROM checked GROUP BY fiscal_year ORDER BY fiscal_year DESC NULLS LAST`;
}
