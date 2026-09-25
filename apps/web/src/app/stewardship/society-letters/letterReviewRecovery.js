import { useEffect, useState } from "react";

export function reviewVersion(recipient) {
  return JSON.stringify([
    recipient?.recipientReview?.token || null,
    recipient?.recipientReview?.savedAt || null,
    recipient?.recipientReview?.values || null,
  ]);
}
export function reviewScope(data) {
  return data?.reviewerId && data?.period
    ? `${data.reviewerId}:${data.period.start}:${data.period.end}`
    : null;
}
const prefix = "society-letter-review:v1:";
export function readReviewCheckpoint(scope) {
  if (!scope) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(prefix + scope));
    if (
      !value ||
      !Array.isArray(value.ids) ||
      !value.ids.length ||
      value.ids.length > 50 ||
      value.ids.some(
        (id) => typeof id !== "string" || !/^[a-zA-Z0-9:_-]{1,160}$/.test(id),
      ) ||
      new Set(value.ids).size !== value.ids.length ||
      !value.ids.includes(value.currentId) ||
      !["post", "email"].includes(value.channel) ||
      !Number.isFinite(value.at) ||
      value.at > Date.now() ||
      Date.now() - value.at > 86400000
    )
      return null;
    return {
      ids: value.ids,
      currentId: value.currentId,
      channel: value.channel,
      at: value.at,
    };
  } catch {
    return null;
  }
}
function writeCheckpoint(scope, value) {
  if (!scope) return;
  try {
    if (value) sessionStorage.setItem(prefix + scope, JSON.stringify(value));
    else sessionStorage.removeItem(prefix + scope);
  } catch {
    /* Review remains usable when browser storage is unavailable. */
  }
}

export function useLetterReviewRecovery(scope) {
  const [state, setState] = useState({ scope, checkpoint: null, drafts: {} });
  useEffect(() => {
    setState({ scope, checkpoint: readReviewCheckpoint(scope), drafts: {} });
  }, [scope]);
  const current =
    state.scope === scope ? state : { checkpoint: null, drafts: {} };
  function remember({ ids, currentId, channel }) {
    // Store position only, never names, addresses, wording, tokens, or approvals.
    const checkpoint = {
      ids: ids.slice(0, 50),
      currentId,
      channel,
      at: Date.now(),
    };
    writeCheckpoint(scope, checkpoint);
    setState((prior) => ({ ...prior, scope, checkpoint }));
  }
  function clearCheckpoint() {
    writeCheckpoint(scope, null);
    setState((prior) => ({ ...prior, checkpoint: null }));
  }
  function keepDraft(id, draft) {
    setState((prior) => {
      const existing = prior.scope === scope ? prior.drafts : {};
      if (JSON.stringify(existing[id] || null) === JSON.stringify(draft))
        return prior;
      const drafts = { ...existing };
      if (draft) drafts[id] = draft;
      else delete drafts[id];
      return { ...prior, scope, drafts };
    });
  }
  useEffect(() => {
    if (!Object.keys(current.drafts).length) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [current.drafts]);
  return { ...current, remember, clearCheckpoint, keepDraft };
}
