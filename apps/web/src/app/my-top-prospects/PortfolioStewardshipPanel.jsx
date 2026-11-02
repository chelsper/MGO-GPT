import { useEffect, useId, useRef, useState } from "react";
import StewardshipAssistanceDialog from "@/components/StewardshipAssistanceDialog";
import { formatReceivedDate } from "@/utils/stewardshipReceipts";
import PortfolioActionPanel from "./PortfolioActionPanel";
import "./portfolioActionPanel.css";
import "./portfolioStewardshipPanel.css";

const followUpHref = id => `/follow-ups?tab=next-steps&nextStepId=${encodeURIComponent(id)}`;

export default function PortfolioStewardshipPanel(props) {
  const [view, setView] = useState(null);
  const opener = useRef(typeof document === "undefined" ? null : document.activeElement);
  useEffect(() => {
    return () => { if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); };
  }, []);
  if (view === "action") return <PortfolioActionPanel {...props} initialInteractionType="Stewardship"
    returnLabel="Back to stewardship" onClose={() => setView(null)} />;
  if (view?.taskId) return <StewardshipAssistanceDialog item={{ id: view.taskId }}
    viewerId={props.viewerId} workspaceId={props.workspaceId} onClose={() => setView(null)} />;
  return <StewardshipSummary {...props} onLogAction={() => setView("action")} onRequest={taskId => setView({ taskId })} />;
}

function StewardshipSummary({ person, viewerId, workspaceId, onClose, onLogAction, onRequest }) {
  const titleId = useId();
  const dialog = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    const params = new URLSearchParams({ viewerId, workspaceId, constituentId: person.constituentId });
    fetch(`/api/portfolio-stewardship?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const saved = await response.json();
        if (!response.ok) throw new Error(saved?.error || "Saved stewardship details could not be loaded.");
        if (String(saved.viewerId) !== String(viewerId) || String(saved.workspaceId) !== String(workspaceId)
          || String(saved.constituentId) !== String(person.constituentId))
          throw new Error("Your workspace changed. Close Stewardship and reopen it from the correct portfolio.");
        if (![saved.requests, saved.receivedItems, saved.followUps].every(Array.isArray)) throw new Error("Saved stewardship details could not be loaded.");
        if (!controller.signal.aborted) setData(saved);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [viewerId, workspaceId, person.constituentId, attempt]);
  const historyHref = `/stewardship/inventory/recipients?${new URLSearchParams({ constituentId: person.constituentId, returnTo: "/my-top-prospects?tab=portfolio" })}`;
  return <dialog ref={dialog} aria-labelledby={titleId} className="portfolio-action-panel portfolio-stewardship"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="portfolio-action-panel__form">
      <header className="portfolio-action-panel__header">
        <div><p className="portfolio-action-panel__eyebrow">MY PORTFOLIO</p><h2 id={titleId}>Stewardship</h2></div>
        <button type="button" autoFocus aria-label="Close Stewardship" onClick={onClose}>Close</button>
      </header>
      <div className="portfolio-action-panel__body">
        <div className="portfolio-action-panel__identity"><h3>{person.name}</h3>
          <p>NXT constituent {person.constituentId}{data?.ownerName && <> &middot; {data.ownerName}'s portfolio</>}</p>
        </div>
        <p className="portfolio-action-panel__hint">Saved history, not a live NXT check. Opening this panel does not send anything or change a record.</p>
        {!data && !error && <p role="status">Loading saved stewardship...</p>}
        {error && <div role="alert" className="portfolio-action-panel__feedback"><p>{error}</p>
          <button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
        {data && <>
          <section aria-label="Open and recent requests">
            <h3>Open &amp; recent requests</h3>
            <p className="portfolio-action-panel__hint">The same requests managed by Stewardship, for this portfolio. Completed does not mean delivered.</p>
            {!data.requests.length && <p className="portfolio-stewardship__empty">No saved requests for this portfolio.</p>}
            <ul>{data.requests.map(request => <li key={request.id}>
              <div className="portfolio-stewardship__line"><strong>{request.request_type.replace(/^Stewardship:\s*/, "")}</strong><span className="portfolio-stewardship__status">{request.status}</span></div>
              {request.item_name && <p>{request.item_name}</p>}
              <p>{request.needed_by ? `Needed by ${formatReceivedDate(request.needed_by)}` : "No deadline set"}</p>
              {request.task_id && <button type="button" onClick={() => onRequest(request.task_id)}>View request #{request.id}</button>}
            </li>)}</ul>
            {data.requestsTruncated && <p className="portfolio-action-panel__hint">Showing 10 open or recent requests. Older requests remain in your Work Queue.</p>}
          </section>
          <section aria-label="Stewardship Items Received">
            <h3>Stewardship Items Received</h3>
            <p className="portfolio-action-panel__hint">Items given to this donor, not donations to JU. Only records available to your account are shown. NXT history appears after import; this is not a complete NXT action history.</p>
            {!data.receivedItems.length && <p className="portfolio-stewardship__empty">No stewardship items are recorded here. This does not confirm that the donor has never received a stewardship item.</p>}
            <ul>{data.receivedItems.map(item => <li key={item.id}><strong>{item.name}</strong><p>{formatReceivedDate(item.receivedOn)} &middot; {item.source}</p></li>)}</ul>
            <a href={historyHref}>{data.receivedItemsTruncated ? "View more stewardship items" : "View stewardship item history"}</a>
          </section>
          <section aria-label="Next stewardship touches">
            <h3>Next stewardship touches</h3>
            {!data.followUps.length && <p className="portfolio-stewardship__empty">No open stewardship follow-ups are saved for this donor in this portfolio.</p>}
            <ul>{data.followUps.map(task => <li key={task.id}><strong>{task.title}</strong>
              <p>{task.due_date ? `Due ${formatReceivedDate(task.due_date)}` : "No due date"}</p>
              <div className="portfolio-stewardship__links"><a href={followUpHref(task.id)}>Open follow-up</a>
                {task.can_request && <button type="button" onClick={() => onRequest(task.id)}>{task.request_id ? "View linked request" : "Request assistance"}</button>}</div>
            </li>)}</ul>
            {data.followUpsTruncated && <p className="portfolio-action-panel__hint">Showing the first 10 open follow-ups by due date.</p>}
            {!data.followUps.some(task => task.can_request) && <p className="portfolio-action-panel__hint">Assistance requests currently start from a saved gift follow-up. You can still log a completed stewardship action below.</p>}
          </section>
        </>}
      </div>
      <footer className="portfolio-action-panel__footer">
        <button type="button" onClick={onClose}>Back to portfolio</button>
        <button type="button" className="portfolio-action-panel__save" disabled={!data} onClick={onLogAction}>Log stewardship action</button>
      </footer>
    </div>
  </dialog>;
}
