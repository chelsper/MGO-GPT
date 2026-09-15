import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import {
  DEFAULT_PORTFOLIO_VIEW,
  normalizePortfolioView,
  paginatePortfolioTiers,
  reconcilePortfolioOrder,
  sortPortfolioPeople,
} from "@/utils/portfolioWorklist";
import "./PortfolioWorklist.css";
import { formatCalendarDate } from "@/utils/prospectActivity";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function savedView(storageKey) {
  try {
    return normalizePortfolioView(
      storageKey ? JSON.parse(window.localStorage.getItem(storageKey)) : null,
    );
  } catch {
    return { ...DEFAULT_PORTFOLIO_VIEW };
  }
}

export function PortfolioCard({
  person,
  signal,
  isTopProspect,
  density,
  children,
}) {
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const detailed = density === "detailed";
  const openLabel =
    signal?.openCount != null
      ? `${signal.openCount} saved open ${signal.openCount === 1 ? "opportunity" : "opportunities"}`
      : signal?.hasOpen
        ? "Open opportunities saved"
        : "Opportunity data unavailable";
  const dueDate = formatCalendarDate(signal?.dueDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article
      className={`portfolio-card ${detailed ? "portfolio-card--detailed" : ""} ${expanded ? "portfolio-card--expanded" : ""}`}
    >
      {!detailed && (
        <div className="portfolio-card__summary">
          <div className="portfolio-card__identity">
            <span className="portfolio-card__name">
              {person.name || "Unnamed constituent"}
            </span>
            {isTopProspect && (
              <Star
                size={14}
                fill="currentColor"
                aria-label="Top Prospect"
                className="portfolio-card__star"
              />
            )}
          </div>
          <div
            className={`portfolio-card__opportunities ${signal?.hasOpen ? "portfolio-card__opportunities--open" : ""}`}
          >
            <span>{openLabel}</span>
            {signal?.amount != null && (
              <strong>{currency.format(signal.amount)}</strong>
            )}
          </div>
          <div className="portfolio-card__next-step">
            <span title={signal?.nextStep || undefined}>
              {signal?.nextStep || "No saved next step"}
            </span>
            {signal?.nextStep && (
              <small>{dueDate ? `Due ${dueDate}` : "No due date"}</small>
            )}
          </div>
          <button
            type="button"
            className="portfolio-card__toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${person.name || "constituent"}`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide details" : "Show details"}
            <ChevronDown
              size={16}
              aria-hidden="true"
              style={{ transform: expanded ? "rotate(180deg)" : undefined }}
            />
          </button>
        </div>
      )}
      <div
        id={detailsId}
        hidden={!detailed && !expanded}
        className="portfolio-card__details"
      >
        {children}
      </div>
    </article>
  );
}

export default function PortfolioWorklist({
  people,
  roleTiers,
  categoryTiers,
  signals,
  storageKey,
  matchesSearch,
  renderTier,
}) {
  const [view, setView] = useState(() => savedView(storageKey));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState(() =>
    sortPortfolioPeople(people, signals, view.sort).map((person) =>
      String(person.constituentId),
    ),
  );
  const listRef = useRef(null);
  const searchId = useId();
  const sortedPeople = sortPortfolioPeople(people, signals, view.sort);
  const reconciledOrder = reconcilePortfolioOrder(order, sortedPeople);
  useEffect(() => {
    if (reconciledOrder !== order) setOrder(reconciledOrder);
  }, [reconciledOrder, order]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(view));
    } catch {
      /* Storage is optional. */
    }
  }, [storageKey, view]);

  const orderById = new Map(reconciledOrder.map((id, index) => [id, index]));
  const tiers =
    view.group === "solicitor"
      ? roleTiers
      : view.group === "category"
        ? categoryTiers
        : [
            {
              key: "all",
              title: "All constituents",
              description: "Your assigned portfolio, in one list.",
              accent: { background: "#EEF2FF", text: "#4338CA" },
              items: people,
            },
          ];
  const seen = new Set();
  const filteredTiers = tiers.map((tier) => ({
    ...tier,
    items: tier.items
      .filter((person) => {
        const id = String(person.constituentId);
        if (seen.has(id)) return false;
        seen.add(id);
        return matchesSearch(person, search.trim().toLowerCase());
      })
      .sort(
        (left, right) =>
          orderById.get(String(left.constituentId)) -
          orderById.get(String(right.constituentId)),
      ),
  }));
  const result = paginatePortfolioTiers(filteredTiers, page, view.pageSize);
  useEffect(() => {
    if (page !== result.page) setPage(result.page);
  }, [page, result.page]);

  function changeView(patch) {
    const next = normalizePortfolioView({ ...view, ...patch });
    setView(next);
    if (patch.sort || patch.group || patch.pageSize) setPage(1);
    if (patch.sort)
      setOrder(
        sortPortfolioPeople(people, signals, next.sort).map((person) =>
          String(person.constituentId),
        ),
      );
  }
  function changePage(next) {
    setPage(next);
    listRef.current?.focus({ preventScroll: true });
    listRef.current?.scrollIntoView?.({ block: "start" });
  }
  function pagination(position) {
    return (
      <nav
        className="portfolio-worklist__pagination"
        aria-label={`${position} portfolio pagination`}
      >
        <span aria-live={position === "Top" ? "polite" : "off"}>
          {result.start}-{result.end} of {result.total}
          {search.trim()
            ? ` matches (${people.length} in portfolio)`
            : " constituents"}
        </span>
        <div>
          <button
            type="button"
            onClick={() => changePage(result.page - 1)}
            disabled={result.page === 1}
          >
            Previous
          </button>
          <span>
            Page {result.page} of {result.pageCount}
          </span>
          <button
            type="button"
            onClick={() => changePage(result.page + 1)}
            disabled={result.page === result.pageCount}
          >
            Next
          </button>
        </div>
      </nav>
    );
  }

  return (
    <section
      className="portfolio-worklist"
      ref={listRef}
      tabIndex={-1}
      aria-label="Portfolio worklist"
    >
      <div className="portfolio-worklist__toolbar">
        <label className="portfolio-worklist__search" htmlFor={searchId}>
          Search portfolio
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Name, email, lookup ID, or assignment"
          />
        </label>
        <label>
          Sort by
          <select
            value={view.sort}
            onChange={(event) => changeView({ sort: event.target.value })}
          >
            <option value="open">Open first</option>
            <option value="name">Name A-Z</option>
          </select>
        </label>
        <label>
          Organize by
          <select
            value={view.group}
            onChange={(event) => changeView({ group: event.target.value })}
          >
            <option value="all">No grouping</option>
            <option value="solicitor">Solicitor role</option>
            <option value="category">My categories</option>
          </select>
        </label>
        <label>
          View
          <select
            value={view.density}
            onChange={(event) => changeView({ density: event.target.value })}
          >
            <option value="compact">Compact</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <label>
          Per page
          <select
            value={view.pageSize}
            onChange={(event) =>
              changeView({ pageSize: Number(event.target.value) })
            }
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
      <div className="portfolio-worklist__help">
        <details>
          <summary>About this view</summary>
          <p>
            Open first puts constituents with saved open opportunities ahead of
            the rest, then sorts by name. Uses saved linked opportunities across
            all fiscal years, not a complete NXT opportunity inventory. Missing
            data is not a zero.
            {view.group !== "all"
              ? " Sorting applies within each group."
              : ""}{" "}
            Background updates do not rearrange this list. Reapply sort to use
            updated values. These controls make no additional NXT requests.
          </p>
        </details>
        <button
          type="button"
          onClick={() => {
            setOrder(
              sortedPeople.map((person) => String(person.constituentId)),
            );
            setPage(1);
          }}
        >
          Reapply sort
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setPage(1);
            }}
          >
            Clear search
          </button>
        )}
      </div>
      {pagination("Top")}
      <div className="portfolio-worklist__groups">
        {result.tiers.map((tier) => renderTier(tier, view.density))}
        {!result.total && (
          <div className="portfolio-worklist__empty">
            {search.trim()
              ? "No constituents match this search. Try a different name or clear the search."
              : "No constituents in this portfolio yet."}
          </div>
        )}
      </div>
      {result.pageCount > 1 && pagination("Bottom")}
    </section>
  );
}
