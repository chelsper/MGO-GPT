import { hasSavedPortfolioContacts, portfolioContactsAreFresh } from "./portfolioContacts";

// One queue per mounted viewer/workspace. No contact values go to browser storage.
export function createPortfolioContactQueue({ viewerId, workspaceId, fetchContacts = fetch }) {
  let snapshot = { entries: {}, pause: null };
  const listeners = new Set();
  const interested = new Map();
  const pending = new Set();
  const attempted = new Set();
  let active = false;
  let visible = true;
  let generation = 0;
  let timer;
  let controller;
  let running = false;
  const publish = (next) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const entry = (id, value) => publish({ ...snapshot, entries: { ...snapshot.entries, [id]: value } });
  const schedule = (delay = 300) => {
    if (!active || !visible || running || timer || snapshot.pause || !pending.size) return;
    timer = setTimeout(() => { timer = null; void run(); }, delay);
  };
  async function run() {
    if (!active || !visible || running || snapshot.pause) return;
    const id = pending.values().next().value;
    if (!id) return;
    pending.delete(id);
    if (!interested.has(id)) return schedule();
    const ownGeneration = generation;
    running = true;
    attempted.add(id);
    entry(id, { ...snapshot.entries[id], status: "checking" });
    const abort = new AbortController();
    controller = abort;
    const timeout = setTimeout(() => abort.abort(), 20_000);
    try {
      const query = new URLSearchParams({ viewer_id: String(viewerId), workspace_id: String(workspaceId) });
      const response = await fetchContacts(`/api/blackbaud/constituents/${encodeURIComponent(id)}/portfolio-contact?${query}`, {
        signal: abort.signal, cache: "no-store",
      });
      const payload = await response.json();
      if (!active || generation !== ownGeneration) return;
      const contacts = hasSavedPortfolioContacts(payload.contacts) ? payload.contacts : null;
      if (response.ok && ["fresh", "updated"].includes(payload.status) && portfolioContactsAreFresh(contacts)) {
        entry(id, { status: "ready", contacts });
      } else {
        const parsedRetry = Date.parse(payload.retryAt || "");
        const retryAt = Number.isFinite(parsedRetry) ? Math.max(Date.now(), parsedRetry) : Date.now() + 60_000;
        publish({
          entries: { ...snapshot.entries, [id]: { status: "paused", contacts } },
          pause: { reason: payload.reason || "unavailable", retryAt },
        });
      }
    } catch {
      if (!active || generation !== ownGeneration) return;
      publish({
        entries: { ...snapshot.entries, [id]: { ...snapshot.entries[id], status: "paused" } },
        pause: { reason: "unavailable", retryAt: Date.now() + 60_000 },
      });
    } finally {
      clearTimeout(timeout);
      if (generation === ownGeneration) {
        running = false;
        controller = null;
        schedule(750);
      }
    }
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    start() { active = true; schedule(); },
    stop() {
      active = false;
      generation += 1;
      clearTimeout(timer);
      timer = null;
      controller?.abort();
      controller = null;
      running = false;
      // Strict Mode can reconnect this queue. Interrupted requests must not stay stuck.
      for (const [id, value] of Object.entries(snapshot.entries)) {
        if (value.status === "checking") {
          attempted.delete(id);
          if (interested.has(id)) pending.add(id);
          entry(id, { ...value, status: "queued" });
        }
      }
    },
    setVisible(value) { visible = value; if (value) schedule(); },
    watch(id, person) {
      interested.set(id, (interested.get(id) || 0) + 1);
      if (!attempted.has(id) && !portfolioContactsAreFresh(person) &&
          !portfolioContactsAreFresh(snapshot.entries[id]?.contacts)) {
        pending.add(id);
        entry(id, { ...snapshot.entries[id], status: "queued" });
        schedule();
      }
      return () => {
        const count = interested.get(id) || 0;
        if (count > 1) interested.set(id, count - 1);
        else { interested.delete(id); pending.delete(id); }
      };
    },
    retry(id) {
      if (!interested.has(id) || running || Date.now() < (snapshot.pause?.retryAt || 0)) return;
      pending.delete(id);
      const remainder = [...pending];
      pending.clear();
      pending.add(id);
      remainder.forEach(value => pending.add(value));
      publish({ ...snapshot, pause: null });
      entry(id, { ...snapshot.entries[id], status: "queued" });
      schedule();
    },
  };
}
