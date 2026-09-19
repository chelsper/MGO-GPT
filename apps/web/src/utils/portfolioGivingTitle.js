export function portfolioGivingTitle(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const fiscalYear = date.getUTCFullYear() + (date.getUTCMonth() >= 6 ? 1 : 0);
  return `FY${String(fiscalYear).slice(-2)} portfolio giving`;
}
