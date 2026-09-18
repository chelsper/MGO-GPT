import { useEffect, useState } from "react";
import { buildImportBatchHref, getImportReturnPath } from "@/utils/workflowNavigation";
import WorkflowReturnLink from "./WorkflowReturnLink";

export default function ImportWorkspaceNavigation({ runId, rowId }) {
  const [returnPath, setReturnPath] = useState("/import-history");
  useEffect(() => {
    setReturnPath(getImportReturnPath(new URLSearchParams(window.location.search).get("returnTo")));
  }, []);
  const historyParams = new URLSearchParams({ returnTo: buildImportBatchHref(runId, rowId) });
  const historyHref = `/import-history?${historyParams}`;
  const returnsToHistory = new URL(returnPath, "https://navigation.invalid").pathname === "/import-history";
  return <nav aria-label="Import navigation" className="mb-4 flex flex-wrap items-center justify-between gap-3">
    <WorkflowReturnLink href={runId && returnsToHistory ? historyHref : returnPath} />
    {runId && !returnsToHistory && <a href={historyHref} className="inline-flex min-h-11 items-center rounded-lg py-2 text-sm font-semibold text-indigo-700 underline">View import results</a>}
  </nav>;
}
