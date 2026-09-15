import { calendarDate } from "./prospectActivity";

export const DEFAULT_PORTFOLIO_VIEW = {
  density: "compact",
  quickView: "all",
  group: "all",
  sort: "open",
  pageSize: 25,
};

export function normalizePortfolioView(value) {
  return {
    density: value?.density === "detailed" ? "detailed" : "compact",
    quickView: ["all", "open", "due"].includes(value?.quickView)
      ? value.quickView
      : "all",
    group: ["all", "solicitor", "category"].includes(value?.group)
      ? value.group
      : "all",
    sort: value?.sort === "name" ? "name" : "open",
    pageSize: value?.pageSize === 50 ? 50 : 25,
  };
}

export function portfolioViewKey(viewerId, workspaceId) {
  if (!viewerId || !workspaceId) return null;
  return `portfolio-view:v1:${encodeURIComponent(viewerId)}:${encodeURIComponent(workspaceId)}`;
}

function nonnegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

// Only the existing, workspace-scoped prospect response is used. A missing
// local record is not evidence that the constituent has no NXT opportunities.
export function buildPortfolioSignals(prospects) {
  const rowsById = new Map();
  for (const prospect of prospects || []) {
    const id = String(
      prospect.linked_blackbaud_constituent_id ||
        prospect.blackbaud_constituent_id ||
        "",
    ).trim();
    if (!id) continue;
    rowsById.set(id, [...(rowsById.get(id) || []), prospect]);
  }
  const signals = new Map();
  for (const [id, rows] of rowsById) {
    const counts = rows.map((row) =>
      nonnegativeNumber(row.portfolio_open_opportunity_count),
    );
    // Duplicate local prospect rows can refer to the same NXT opportunity.
    // Preserve the open signal, but don't add potentially duplicate totals.
    const openCount =
      rows.length === 1
        ? counts[0]
        : counts.every((count) => count === 0)
          ? 0
          : null;
    const nextStepRows = rows.filter(
      (row) =>
        row.status === "Active" &&
        row.next_action_text?.trim() &&
        !row.next_action_completed_at,
    );
    // When several local rows link to one person, surface the earliest dated
    // unfinished step so an overdue follow-up isn't hidden behind a future one.
    const nextStepRow = nextStepRows.sort((left, right) =>
      (calendarDate(left.next_action_due_date) || "9999-12-31").localeCompare(
        calendarDate(right.next_action_due_date) || "9999-12-31",
      ),
    )[0];
    signals.set(id, {
      hasOpen: counts.some((count) => count > 0),
      openCount,
      amount:
        rows.length === 1 && openCount > 0
          ? nonnegativeNumber(rows[0].portfolio_open_pipeline_amount)
          : null,
      nextStep: nextStepRow?.next_action_text || null,
      dueDate: nextStepRow?.next_action_due_date || null,
    });
  }
  return signals;
}

export function matchesPortfolioQuickView(signal, quickView, today) {
  if (quickView === "open") return signal?.hasOpen === true;
  if (quickView === "due") {
    const dueDate = calendarDate(signal?.dueDate);
    const asOf = calendarDate(today);
    return Boolean(
      signal?.nextStep?.trim() && dueDate && asOf && dueDate <= asOf,
    );
  }
  return true;
}

export function sortPortfolioPeople(people, signals, sort) {
  const priority = (person) => {
    const signal = signals.get(String(person.constituentId));
    return signal?.hasOpen ? 2 : signal?.openCount === 0 ? 1 : 0;
  };
  return [...people].sort(
    (left, right) =>
      (sort === "open" ? priority(right) - priority(left) : 0) ||
      String(left.name || "").localeCompare(
        String(right.name || ""),
        undefined,
        { sensitivity: "base", numeric: true },
      ) ||
      String(left.constituentId).localeCompare(
        String(right.constituentId),
        undefined,
        { numeric: true },
      ),
  );
}

export function reconcilePortfolioOrder(previousIds, sortedPeople) {
  const ids = sortedPeople.map((person) => String(person.constituentId));
  const available = new Set(ids);
  const previous = new Set(previousIds);
  const next = [
    ...previousIds.filter((id) => available.has(id)),
    ...ids.filter((id) => !previous.has(id)),
  ];
  return next.length === previousIds.length &&
    next.every((id, index) => id === previousIds[index])
    ? previousIds
    : next;
}

export function paginatePortfolioTiers(tiers, page, pageSize) {
  const total = tiers.reduce((sum, tier) => sum + tier.items.length, 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const start = (currentPage - 1) * pageSize;
  let offset = 0;
  const visibleTiers = tiers
    .map((tier) => {
      const from = Math.max(0, start - offset);
      const to = Math.max(0, start + pageSize - offset);
      offset += tier.items.length;
      return {
        ...tier,
        totalCount: tier.items.length,
        items: tier.items.slice(from, to),
      };
    })
    .filter((tier) => tier.items.length > 0);
  return {
    tiers: visibleTiers,
    total,
    page: currentPage,
    pageCount,
    start: total ? start + 1 : 0,
    end: Math.min(total, start + pageSize),
  };
}
