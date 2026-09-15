import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ChevronDown, Star } from "lucide-react";
import {
  DEFAULT_PORTFOLIO_VIEW,
  matchesPortfolioQuickView,
  normalizePortfolioView,
  paginatePortfolioTiers,
  reconcilePortfolioOrder,
  sortPortfolioPeople,
} from "@/utils/portfolioWorklist";
import "./PortfolioWorklist.css";
import { formatCalendarDate } from "@/utils/prospectActivity";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const quickViews = [
  { key: "all", label: "All" },
  { key: "open", label: "Open opportunities" },
  { key: "due", label: "Follow-ups due" },
];

const PortfolioExpansionContext = createContext(null);

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
  const expansion = useContext(PortfolioExpansionContext);
  const [standaloneExpanded, setStandaloneExpanded] = useState(false);
  const toggleRef = useRef(null);
  const scrollOnExpand = useRef(false);
  const cardId = String(person.constituentId ?? detailsId);
  const expanded = expansion
    ? expansion.ids.includes(cardId)
    : standaloneExpanded;
  const detailed = density === "detailed";
  useEffect(() => {
    // Closing the previous tall card can move the selected card off-screen.
    if (expanded && scrollOnExpand.current)
      toggleRef.current?.scrollIntoView?.({ block: "nearest" });
    scrollOnExpand.current = false;
  }, [expanded]);
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
            ref={toggleRef}
            type="button"
            className="portfolio-card__toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${person.name || "constituent"}`}
            onClick={() => {
              scrollOnExpand.current = density === "focus" && !expanded;
              if (expansion) expansion.toggle(cardId);
              else setStandaloneExpanded(!standaloneExpanded);
            }}
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
  const [selectedGroup, setSelectedGroup] = useState("");
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState([]);
  const [today, setToday] = useState(() => getStandingsPeriods().asOf);
  const [order, setOrder] = useState(() =>
    sortPortfolioPeople(people, signals, view.sort).map((person) =>
      String(person.constituentId),
    ),
  );
  const listRef = useRef(null);
  const searchId = useId();
  useEffect(() => {
    // Keep date-only follow-ups correct across Eastern midnight without fetching.
    const updateDay = () => setToday(getStandingsPeriods().asOf);
    const timer = window.setInterval(updateDay, 60_000);
    window.addEventListener("focus", updateDay);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateDay);
    };
  }, []);
  const sortedPeople = sortPortfolioPeople(people, signals, view.sort);
  const reconciledOrder = reconcilePortfolioOrder(order, sortedPeople);
  useEffect(() => {
    if (reconciledOrder !== order) setOrder(reconciledOrder);
  }, [reconciledOrder, order]);
  useEffect(() => {
    const available = new Set(
      people.map((person) => String(person.constituentId)),
    );
    setExpandedIds((current) => {
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [people]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(view));
    } catch {
      /* Storage is optional. */
    }
  }, [storageKey, view]);

  const orderById = new Map(reconciledOrder.map((id, index) => [id, index]));
  const query = search.trim().toLowerCase();
  const quickViewIds = { all: new Set(), open: new Set(), due: new Set() };
  for (const person of people) {
    if (!matchesSearch(person, query)) continue;
    const id = String(person.constituentId);
    for (const { key } of quickViews) {
      if (matchesPortfolioQuickView(signals.get(id), key, today)) {
        quickViewIds[key].add(id);
      }
    }
  }
  const tiers =
    view.group === "solicitor"
      ? roleTiers
      : view.group === "category"
        ? categoryTiers
        : [
            {
              key: "all",
              title:
                view.quickView === "all"
                  ? "All constituents"
                  : quickViews.find(({ key }) => key === view.quickView).label,
              description: "Your assigned portfolio, using saved data.",
              accent: { background: "#EEF2FF", text: "#4338CA" },
              items: people,
            },
          ];
  const seen = new Set();
  const uniqueTiers = tiers.map((tier) => ({
    ...tier,
    items: tier.items.filter((person) => {
      const id = String(person.constituentId);
      if (seen.has(id) || !orderById.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));
  const activeGroup = uniqueTiers.find(
    (tier) => String(tier.key) === selectedGroup,
  );
  const scopedIds = new Set(
    uniqueTiers
      .filter((tier) => !selectedGroup || String(tier.key) === selectedGroup)
      .flatMap((tier) =>
        tier.items.map((person) => String(person.constituentId)),
      ),
  );
  const quickViewCounts = Object.fromEntries(
    quickViews.map(({ key }) => [
      key,
      [...quickViewIds[key]].filter((id) => scopedIds.has(id)).length,
    ]),
  );
  const filteredTiers = uniqueTiers.map((tier) => ({
    ...tier,
    items: tier.items
      .filter((person) =>
        quickViewIds[view.quickView].has(String(person.constituentId)),
      )
      .sort(
        (left, right) =>
          orderById.get(String(left.constituentId)) -
          orderById.get(String(right.constituentId)),
      ),
  }));
  const result = paginatePortfolioTiers(
    filteredTiers.filter(
      (tier) => !selectedGroup || String(tier.key) === selectedGroup,
    ),
    page,
    view.pageSize,
  );
  const hasVisibleDetails =
    view.density !== "detailed" &&
    result.tiers.some((tier) =>
      tier.items.some((person) =>
        expandedIds.includes(String(person.constituentId)),
      ),
    );
  useEffect(() => {
    if (page !== result.page) setPage(result.page);
  }, [page, result.page]);

  function changeView(patch) {
    const next = normalizePortfolioView({ ...view, ...patch });
    setView(next);
    if (patch.group) setSelectedGroup("");
    if (patch.density === "focus")
      setExpandedIds((current) => current.slice(-1));
    if (patch.sort || patch.group || patch.pageSize || patch.quickView)
      setPage(1);
    if (patch.sort)
      setOrder(
        sortPortfolioPeople(people, signals, next.sort).map((person) =>
          String(person.constituentId),
        ),
      );
  }
  function changeGroup(key) {
    setSelectedGroup(key);
    setPage(1);
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
          {query || view.quickView !== "all" || selectedGroup
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
    <PortfolioExpansionContext.Provider
      value={{
        ids: expandedIds,
        toggle: (id) =>
          setExpandedIds((current) =>
            current.includes(id)
              ? current.filter((openId) => openId !== id)
              : view.density === "focus"
                ? [id]
                : [...current, id],
          ),
      }}
    >
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
          <label className="portfolio-worklist__wide-control">
            Sort by
            <select
              value={view.sort}
              onChange={(event) => changeView({ sort: event.target.value })}
            >
              <option value="open">Open first</option>
              <option value="due">Next step due</option>
              <option value="pipeline">Largest open pipeline</option>
              <option value="name">Name A-Z</option>
            </select>
          </label>
          <label className="portfolio-worklist__wide-control">
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
          {view.group !== "all" && (
            <label className="portfolio-worklist__wide-control portfolio-worklist__group-control">
              Show group
              <select
                value={selectedGroup}
                onChange={(event) => changeGroup(event.target.value)}
              >
                <option value="">
                  All {view.group === "category" ? "categories" : "roles"} (
                  {filteredTiers.reduce(
                    (sum, tier) => sum + tier.items.length,
                    0,
                  )}
                  )
                </option>
                {selectedGroup && !activeGroup && (
                  <option value={selectedGroup}>Unavailable group (0)</option>
                )}
                {filteredTiers.map((tier) => (
                  <option key={tier.key} value={tier.key}>
                    {tier.title} ({tier.items.length})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            View
            <select
              value={view.density}
              onChange={(event) => changeView({ density: event.target.value })}
            >
              <option value="compact">Compact</option>
              <option value="focus">Focus</option>
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
        {view.density === "focus" && (
          <p className="portfolio-worklist__filter-note">
            Focus view keeps one constituent's details open at a time.
          </p>
        )}
        {selectedGroup && (
          <p className="portfolio-worklist__filter-note">
            {activeGroup
              ? `Showing only ${activeGroup.title.trim()}. Counts reflect this group and your search.${view.group === "category" ? " Subcategories are separate groups." : ""}`
              : "The selected group is no longer available. Show all groups to continue."}
          </p>
        )}
        <div
          className="portfolio-worklist__quick-views"
          role="group"
          aria-label="Portfolio quick views"
        >
          {quickViews.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view.quickView === key}
              onClick={() => changeView({ quickView: key })}
            >
              {label} <span>{quickViewCounts[key]}</span>
            </button>
          ))}
        </div>
        {view.quickView !== "all" && (
          <p className="portfolio-worklist__filter-note">
            {view.quickView === "due"
              ? `Unfinished saved next steps due through ${formatCalendarDate(today, { month: "short", day: "numeric", year: "numeric" })} (Eastern). Missing dates are not counted.`
              : "Constituents with saved linked open opportunities, across all fiscal years. Records without saved opportunity data are not included."}
          </p>
        )}
        <div className="portfolio-worklist__help">
          <details>
            <summary>About this view</summary>
            <p>
              Open first puts constituents with saved open opportunities ahead
              of the rest, then sorts by name. Uses saved linked opportunities
              across all fiscal years, not a complete NXT opportunity inventory.
              Missing data is not a zero. Next step due sorts unfinished dated
              steps oldest first. Largest open pipeline sorts saved open
              opportunity amounts highest first. Missing dates and unavailable
              amounts sort last; ties sort by name. These sorts do not change
              Top Prospects ranks.
              {view.group !== "all"
                ? " Sorting applies within each group."
                : ""}{" "}
              Quick-view counts respect your search and selected group and count
              each constituent once, before pagination. Show group narrows the
              list without changing assignments or categories. Group-option
              counts also respect the selected quick view. Subcategories are
              separate groups. Search and group selection apply only to this
              visit; they are not saved as preferences. Follow-ups due uses
              unfinished saved next steps due today or earlier (Eastern), not
              NXT action history. Background updates may change filter
              membership, but do not reorder existing cards. Reapply sort to use
              updated values. These controls make no additional NXT requests.
              Focus view closes the previous card when another is opened.
              Compact allows several open cards; Detailed shows every card on
              this page in full. Collapsing details does not reset fields or
              load NXT.
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
          {hasVisibleDetails && (
            <button
              type="button"
              onClick={() => {
                setExpandedIds([]);
                listRef.current?.focus({ preventScroll: true });
              }}
            >
              Collapse details
            </button>
          )}
          {selectedGroup && (
            <button type="button" onClick={() => changeGroup("")}>
              Show all groups
            </button>
          )}
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
              <p>
                {selectedGroup
                  ? activeGroup
                    ? "No constituents match this group with the current search and quick view. Try another group or show all constituents."
                    : "The selected group is no longer available. Show all constituents to continue."
                  : query
                    ? "No constituents match this search and quick view. Try a different name or clear the search."
                    : view.quickView !== "all"
                      ? "No constituents match this quick view in the saved data. This does not confirm that none exist in NXT."
                      : "No constituents in this portfolio yet."}
              </p>
              {(query || view.quickView !== "all" || selectedGroup) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedGroup("");
                    changeView({ quickView: "all" });
                  }}
                >
                  Show all constituents
                </button>
              )}
            </div>
          )}
        </div>
        {result.pageCount > 1 && pagination("Bottom")}
      </section>
    </PortfolioExpansionContext.Provider>
  );
}
