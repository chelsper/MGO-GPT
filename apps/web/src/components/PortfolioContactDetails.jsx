import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PortfolioDetailsVisibleContext } from "./PortfolioWorklist";
import { createPortfolioContactQueue } from "@/utils/portfolioContactQueue";
import { mergeSavedPortfolioContacts, portfolioContactsAreFresh } from "@/utils/portfolioContacts";
import { formatCalendarDate } from "@/utils/prospectActivity";

const ContactQueueContext = createContext(null);
const emptySnapshot = { entries: {}, pause: null };
const emptySubscribe = () => () => {};
const getEmptySnapshot = () => emptySnapshot;

export function PortfolioContactRefreshProvider({ viewerId, workspaceId, enabled, children }) {
  const [queue] = useState(() => createPortfolioContactQueue({ viewerId, workspaceId }));
  useEffect(() => {
    if (!enabled || !viewerId || !workspaceId) return;
    const visibility = () => queue.setVisible(document.visibilityState !== "hidden");
    visibility();
    queue.start();
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); queue.stop(); };
  }, [queue, enabled, viewerId, workspaceId]);
  return <ContactQueueContext.Provider value={enabled && viewerId && workspaceId ? queue : null}>
    {children}
  </ContactQueueContext.Provider>;
}

export default function PortfolioContactDetails({ person }) {
  const queue = useContext(ContactQueueContext);
  const expanded = useContext(PortfolioDetailsVisibleContext);
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const snapshot = useSyncExternalStore(queue?.subscribe || emptySubscribe, queue?.getSnapshot || getEmptySnapshot, getEmptySnapshot);
  const id = String(person.constituentId);
  const state = snapshot.entries[id];
  const contacts = mergeSavedPortfolioContacts(person, state?.contacts, { checkedAt: state?.contacts?.contactCheckedAt });
  const fresh = portfolioContactsAreFresh(contacts);
  const [retryReady, setRetryReady] = useState(false);
  useEffect(() => {
    if (!expanded) { setVisible(false); return; }
    // Do not turn Detailed view into an all-record prefetch. Without an observer,
    // keep saved values and offer an explicit check instead.
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [expanded]);
  useEffect(() => {
    if (!queue || !expanded || !visible) return;
    return queue.watch(id, person);
  }, [queue, expanded, visible, id, person.contactCheckedAt]);
  useEffect(() => {
    const wait = (snapshot.pause?.retryAt || 0) - Date.now();
    setRetryReady(wait <= 0);
    if (wait > 0) {
      const timer = setTimeout(() => setRetryReady(true), Math.min(wait, 2_147_483_647));
      return () => clearTimeout(timer);
    }
  }, [snapshot.pause?.retryAt]);
  const contactLine = [contacts.email, contacts.phone].filter(Boolean).join(" · ");
  const waiting = queue && !fresh && !snapshot.pause && ["checking", "queued"].includes(state?.status);
  const paused = queue && !fresh && snapshot.pause;
  return <div ref={ref} style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.5, overflowWrap: "anywhere" }}>
    {contactLine && <div>{contactLine}</div>}
    {contacts.address && <div>{contacts.address}</div>}
    {!contactLine && !contacts.address && <div>{contacts.contactCheckedAt || contacts.contactDataSource !== "not-loaded"
      ? "No contact details available" : "Contact details have not been loaded yet"}</div>}
    {contacts.contactCheckedAt && <div style={{ fontSize: "11px", color: "#64748B" }}>
      Saved contact details · Checked {formatCalendarDate(contacts.contactCheckedAt)}
    </div>}
    <div role="status" style={{ fontSize: "12px", color: "#64748B" }}>
      {waiting && "Checking contact details only..."}
      {paused && (paused.reason === "throttled"
        ? "Blackbaud has paused contact checks. Saved details are still shown."
        : paused.reason === "busy"
          ? "Another contact check is running. Saved details are still shown."
          : "Contact check unavailable. Saved details are still shown.")}
    </div>
    {queue && !fresh && (!waiting || paused) && <button type="button"
      disabled={Boolean(paused) && !retryReady}
      className="portfolio-contact-check"
      onClick={() => { setVisible(true); queue.retry(id); }}>
      {paused ? (retryReady ? "Retry contact check" : "Contact checks paused briefly") : "Check contact details"}
    </button>}
  </div>;
}
