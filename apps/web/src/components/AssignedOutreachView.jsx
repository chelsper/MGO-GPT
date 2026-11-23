"use client";
import { useEffect, useState } from "react";
import useConstituentList from "@/app/reports/lists/useConstituentList";
import { ListSignInNotice } from "@/app/reports/lists/ConstituentListView";
import ProjectOutreachPanel from "./ProjectOutreachPanel";
import styles from "@/app/tasks/tasks.module.css";

export default function AssignedOutreachView({ listKey, embedded = false, previewUserId = null }) {
  const { data, error, errorStatus, loading, reload } = useConstituentList(listKey);
  const [entry, setEntry] = useState(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setEntry({ key: listKey, calls: query.get("from") === "tasks" && query.get("start") === "calls",
      status: query.get("from") === "tasks" && query.get("focus") === "nxt" ? "nxt" : "open" });
  }, [listKey]);
  function consumeCalls() {
    setEntry(current => current && { ...current, calls: false });
    const url = new URL(window.location.href);
    if (url.searchParams.get("start") === "calls") {
      url.searchParams.delete("start");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }
  const report = data?.report, snapshot = data?.snapshot;
  const Container = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  return <Container className={embedded ? undefined : styles.page}>
    <header className={styles.header}>
      {!embedded && <a className={styles.home} href="/tasks">Back to My Tasks</a>}
      {!embedded && <p className={styles.eyebrow}>MY ASSIGNED OUTREACH</p>}
      <Heading>{report?.title || "Assigned outreach"}</Heading>
      {!embedded && <p>Work through your people, record what happened, and continue to the next person.</p>}
      {!embedded && <p className={styles.note}>Your signed-in account's assignments only. No calls are placed or NXT actions submitted just by opening this page.</p>}
    </header>
    {loading && <p role="status">Loading your saved outreach...</p>}
    {error && (errorStatus === 401 ? <ListSignInNotice /> : <section className={styles.notice} role="alert">
      <p>{errorStatus === 403 ? "Your signed-in account does not have access to this project. Ask a project manager to check your access." : "Your saved outreach could not be loaded. Your assignments and recorded outcomes are kept."}</p>
      <button onClick={reload}>Reload saved project</button>
    </section>)}
    {!loading && !error && report && entry?.key === listKey && <>
      <p className={styles.note}>{snapshot?.generatedAt
        ? `Using the saved contact list from ${new Date(snapshot.generatedAt).toLocaleString()}. Check current NXT contact preferences before calling.`
        : "The contact list is not ready yet. Ask a project manager to finish setup; existing outcomes remain available below."}</p>
      <ProjectOutreachPanel key={report.key} report={report} snapshot={snapshot}
        callerMode initialStatus={entry.status} startCalls={entry.calls} onStartCallsHandled={consumeCalls}
        previewUserId={previewUserId}
        refreshing={!!data.refresh?.busy} />
    </>}
  </Container>;
}
