import { useEffect } from "react";

// Warn on reload/full-page navigation without persisting donor drafts to storage.
export default function useUnsavedChangesWarning(unsaved) {
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
}
