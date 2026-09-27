import { useEffect, useRef, useState } from "react";
import {
  LETTER_VIEWS,
  letterView,
  letterViewHref,
} from "@/utils/societyLetterNavigation";

const stateKey = "societyLetterNavigation";

function readEntry() {
  const view = letterView(
    new URLSearchParams(window.location.search).get("view"),
  );
  const saved = window.history.state?.[stateKey];
  const trail =
    saved?.view === view && Array.isArray(saved.trail)
      ? saved.trail.filter((key) => Object.hasOwn(LETTER_VIEWS, key)).slice(-50)
      : [];
  return { view, trail };
}

export default function useLetterNavigation() {
  const [entry, setEntry] = useState({ view: "ready", trail: [] });
  const current = useRef(entry);
  function accept(next) {
    current.current = next;
    setEntry(next);
  }
  useEffect(() => {
    const initial = readEntry();
    // Record only view names. Recipient data and edits never enter browser history.
    window.history.replaceState(
      { ...window.history.state, [stateKey]: initial },
      "",
      window.location.href,
    );
    accept(initial);
    const onPop = () => accept(readEntry());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(destination, replace = false) {
    const view = letterView(
      destination === "source" ? "settings" : destination,
    );
    const previous = current.current;
    if (view === previous.view) return;
    const next = {
      view,
      trail: replace ? [] : [...previous.trail, previous.view].slice(-50),
    };
    window.history[replace ? "replaceState" : "pushState"](
      { ...window.history.state, [stateKey]: next },
      "",
      letterViewHref(view),
    );
    accept(next);
  }
  const parent = ["settings", "templates", "appeals"].includes(entry.view)
    ? "setup"
    : entry.view === "fields"
      ? "settings"
      : entry.view === "ready"
        ? null
        : "ready";
  const previous = entry.trail.at(-1) || parent;
  return {
    view: entry.view,
    tab: entry.view === "fields" ? "settings" : entry.view,
    showMappings: entry.view === "fields",
    navigate,
    backHref: previous ? letterViewHref(previous) : "/stewardship",
    backLabel: `Back to ${previous ? LETTER_VIEWS[previous] : "Stewardship"}`,
    back(event) {
      if (
        !previous ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      if (current.current.trail.length) window.history.back();
      else navigate(previous, true);
    },
  };
}
