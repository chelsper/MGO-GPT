import { useContext } from "react";
import { PortfolioDetailsVisibleContext } from "./PortfolioWorklist";
import { portfolioActivityFields, savedPortfolioActivityDate } from "@/utils/portfolioActivity";
import { formatCalendarDate } from "@/utils/prospectActivity";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import "./PortfolioActivityDetails.css";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Saved data only. Expanding a card must not trigger gift/action API requests.
export default function PortfolioActivityDetails({ activity }) {
  const visible = useContext(PortfolioDetailsVisibleContext);
  if (!visible) return null;
  const entries = ["gift", "action"].flatMap(kind => {
    const saved = savedPortfolioActivityDate(activity?.[kind]);
    return saved ? [{ kind, ...saved, ...portfolioActivityFields(activity[kind], kind) }] : [];
  });
  if (!entries.length) return null;
  return (
    <section className="portfolio-activity-details" aria-label="Saved NXT activity">
      {entries.map(({ kind, date, checkedAt, amount, summary }) => (
        <div key={kind} className="portfolio-activity-details__item">
          <h4>Last {kind} (saved)</h4>
          <div className="portfolio-activity-details__headline">
            <time dateTime={date}>{formatCalendarDate(date, { month: "short", day: "numeric", year: "numeric" })}</time>
            {amount != null && <strong>{currency.format(amount)}</strong>}
          </div>
          {summary && <p className="portfolio-activity-details__summary">{summary}</p>}
          <small>Checked {formatCalendarDate(getStandingsPeriods(new Date(checkedAt)).asOf)} (Eastern). Not a live check.</small>
        </div>
      ))}
    </section>
  );
}
