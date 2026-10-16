import { randomUUID } from "node:crypto";
import sql from "./sql";
import { getBlackbaudFundraiserById } from "./blackbaud";
import { withBlackbaudReadBudget } from "./blackbaudReadBudget";
import { getCachedReportSnapshot, saveReportSnapshot } from "./reportCache";
import { createPortfolioGivingDataSource } from "./portfolioGivingDataCache";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { ORIGINATOR_PATH, originatorRoster, readOriginatorCollection } from "./relationshipOriginator";
import { ORIGINATOR_CATEGORY, OriginatorError, originatorFields, originatorIdentityNames, resolveOriginators, originatorGiving, systemId } from "./relationshipOriginatorModel";

export const ORIGINATOR_REPORT_KEY = "report:relationship-originators:v1";

export async function buildOriginatorReport({ user, origin, db = sql,
  readFields = readOriginatorCollection, lookup = getBlackbaudFundraiserById, dataSource = createPortfolioGivingDataSource }) {
  const periods = getStandingsPeriods();
  const options = { userId: user.id, authUserId: user.id, origin };
  const fields = originatorFields(await readFields(ORIGINATOR_PATH, options, { category: ORIGINATOR_CATEGORY, include_count: false }));
  const users = await originatorRoster(db);
  const receipts = await db`SELECT constituent_id,owner_user_id,originator_name,origin_date,remote_field_id,state
    FROM relationship_originator_changes WHERE state = 'confirmed' ORDER BY id DESC`;
  // Only need names if NXT actually returned attribution fields. Empty category
  // results must not trigger a fundraiser or whole-database gift scan.
  if (fields.length) {
    for (const person of users) {
      if (!systemId(person.blackbaud_constituent_id)) continue;
      const fundraiser = await lookup({ ...options, fundraiserId: person.blackbaud_constituent_id });
      person.nxtName = fundraiser?.name || null;
      person.nxtNames = originatorIdentityNames(fundraiser);
    }
  }
  const { resolved, issues } = resolveOriginators(fields, users, receipts, periods);
  const metrics = new Map(users.map(person => [String(person.id), {
    userId: String(person.id), name: person.name, active: person.active !== false,
    fiscalYearCount: 0, lifetimeCount: 0, fiscalYearGiving: 0, lifetimeGiving: 0,
  }]));
  let giftsFreshUntil = null;
  for (const field of resolved) {
    const row = metrics.get(field.userId);
    row.lifetimeCount++;
    if (field.date >= periods.fiscalYear.startsOn) row.fiscalYearCount++;
    const source = dataSource({ ...options, constituentId: field.constituentId });
    const gifts = await source.listGifts({ searchParams: { constituent_id: field.constituentId,
      start_gift_date: field.date, end_gift_date: periods.asOf }, maxPages: 10 });
    // Incomplete paging throws before replacing the last successful snapshot.
    const giving = originatorGiving(gifts, field.constituentId, field.date, periods);
    row.fiscalYearGiving = Math.round((row.fiscalYearGiving + giving.fiscalYearGiving) * 100) / 100;
    row.lifetimeGiving = Math.round((row.lifetimeGiving + giving.lifetimeGiving) * 100) / 100;
    if (!giftsFreshUntil || source.freshUntil < giftsFreshUntil) giftsFreshUntil = source.freshUntil;
  }
  return { fiscalYear: periods.fiscalYear, asOf: periods.asOf, generatedAt: new Date().toISOString(),
    giftCacheFreshUntil: giftsFreshUntil, issues, rows: [...metrics.values()].filter(row => row.active || row.lifetimeCount),
    policy: "One originator per constituent. Counts use the introduction date. Direct received giving on or after that date; no soft credit or unpaid pledges. FY giving includes all originated relationships, not just those introduced this FY."
  };
}

export async function refreshOriginatorReport({ user, origin, db = sql, build = buildOriginatorReport,
  load = getCachedReportSnapshot, save = saveReportSnapshot }) {
  const token = randomUUID();
  const [lock] = await db`INSERT INTO relationship_originator_refresh_locks(cache_key,token,expires_at)
    VALUES (${ORIGINATOR_REPORT_KEY},${token},NOW() + INTERVAL '5 minutes')
    ON CONFLICT(cache_key) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
    WHERE relationship_originator_refresh_locks.expires_at < NOW() RETURNING token`;
  if (!lock) throw new OriginatorError("Originator metrics are already refreshing. Please check again shortly.");
  try {
    let reads = 0;
    const deadline = Date.now() + 90000;
    const result = await withBlackbaudReadBudget(() => ++reads <= 80 && Date.now() < deadline,
      () => build({ user, origin, db }));
    const valid = await db`SELECT token FROM relationship_originator_refresh_locks
      WHERE cache_key = ${ORIGINATOR_REPORT_KEY} AND token = ${token} AND expires_at > NOW()`;
    if (!valid.length) throw new OriginatorError("Refresh timed out. The previous originator metrics are unchanged.");
    await save(ORIGINATOR_REPORT_KEY, result);
    return result;
  } catch (error) {
    const previous = await load(ORIGINATOR_REPORT_KEY);
    if (!previous) throw error;
    return { ...previous, refreshWarning: "Originator metrics could not finish refreshing. The last saved results are shown; no partial totals replaced them." };
  } finally {
    await db`DELETE FROM relationship_originator_refresh_locks WHERE cache_key = ${ORIGINATOR_REPORT_KEY} AND token = ${token}`.catch(() => {});
  }
}
