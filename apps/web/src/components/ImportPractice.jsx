import { useEffect, useReducer, useRef } from "react";
import ImportColumnMapping from "./ImportColumnMapping";
import { IMPORT_PRACTICE_SCENARIOS, importPracticeFixture, importPracticeBlockers, importPracticeReducer, newImportPractice } from "@/utils/importPractice";

const button = "min-h-11 rounded-xl border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-50";
const statusLabels = { ready: "Ready for practice approval", held: "Needs attention", unchanged: "No change needed", uncertain: "Uncertain result - do not resend", complete: "Verified (simulation)" };

export default function ImportPractice() {
  const [state, dispatch] = useReducer(importPracticeReducer, undefined, () => newImportPractice());
  const heading = useRef(null);
  const previousStage = useRef(state.stage);
  useEffect(() => {
    if (previousStage.current !== state.stage) heading.current?.focus();
    previousStage.current = state.stage;
  }, [state.stage]);
  const fixture = importPracticeFixture(state.scenarioId);
  const blockers = importPracticeBlockers(state);
  const selected = state.rows.filter((row) => row.selected && row.state === "ready").length;
  const scenario = IMPORT_PRACTICE_SCENARIOS.find(({ id }) => id === state.scenarioId);
  return <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-5">
      <a href="/constituency-import" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Leave practice and open real imports</a>
      <header className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Practice only - fictional records</p>
        <h1 className="mt-2 text-3xl font-bold">Try an import safely</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-950">Walk through column mapping, review, approval, and results. These examples do not connect to NXT, save an import, or change any records. Real files cannot be uploaded here.</p>
        <p className="mt-2 text-sm text-emerald-950">Progress is kept only in this tab and resets when you restart, leave, or reload. Practice results do not validate a real import or your NXT permissions.</p>
      </header>
      <section aria-label="Practice examples" className="grid gap-3 sm:grid-cols-3">
        {IMPORT_PRACTICE_SCENARIOS.map((item) => <button type="button" key={item.id} aria-pressed={state.scenarioId === item.id}
          onClick={() => dispatch({ type: "scenario", id: item.id })}
          className={`rounded-2xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-emerald-700 ${state.scenarioId === item.id ? "border-emerald-700 bg-white ring-1 ring-emerald-700" : "border-slate-200 bg-white"}`}>
          <span className="block font-bold">{item.label}</span><span className="mt-2 block text-sm text-slate-600">{item.description}</span>
        </button>)}
      </section>
      <ol aria-label="Practice progress" className="flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
        {[["setup", "1. Set up"], ["review", "2. Review and approve"], ["results", "3. Simulated results"]].map(([key, label]) => <li key={key} aria-current={state.stage === key ? "step" : undefined} className={state.stage === key ? "text-emerald-800 underline underline-offset-4" : ""}>{label}</li>)}
      </ol>
      <section aria-label="Practice workspace" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 ref={heading} tabIndex={-1} className="text-xl font-bold">{scenario.label}: {state.stage === "setup" ? "sample setup" : state.stage === "review" ? "practice review" : "simulated results"}</h2>
        {state.stage === "setup" ? <>
          <p className="text-sm text-slate-600">Three fictional rows are already loaded in place of a CSV upload. No real data or saved setup is used. Switching examples starts a new practice session.</p>
          <ImportColumnMapping fields={fixture.fields} headers={fixture.headers} mappings={state.mappings} rows={fixture.rows}
            onChange={(key, value) => dispatch({ type: "mapping", key, value })} />
          {state.scenarioId === "custom" ? <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold">Sample category: Practice Interest (Text)</p>
            <p className="mt-2">One category per file. Exact duplicates are skipped; conflicting values are held. In real imports, choose an existing NXT category. Relationship Originator and MGOGPT use their dedicated workflows.</p>
          </div> : <fieldset className="space-y-2 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 font-semibold">Contact choices for this example</legend>
            <p className="text-sm text-slate-600">Mapping an email column alone does not request a contact update.</p>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="practice-contacts" checked={state.includeContacts === true} onChange={() => dispatch({ type: "contacts", value: true })} />Include sample emails as Personal, with Make primary set to Yes</label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="practice-contacts" checked={state.includeContacts === false} onChange={() => dispatch({ type: "contacts", value: false })} />Leave email addresses unchanged</label>
          </fieldset>}
          {blockers.length > 0 && <div role="status" className="rounded-xl bg-slate-50 p-4 text-sm"><p className="font-semibold">Before the practice review</p><ul className="mt-2 list-disc space-y-1 pl-5">{blockers.map((message) => <li key={message}>{message}</li>)}</ul></div>}
          <button type="button" className={`${button} bg-emerald-700 text-white`} disabled={blockers.length > 0} onClick={() => dispatch({ type: "review" })}>Review fictional records</button>
        </> : <>
          <p role="status" className="text-sm text-slate-600">{state.stage === "review" ? "Nothing is selected automatically. Review the requested fields, then approve only ready rows. Held rows cannot be selected." : `${state.rows.filter((row) => row.state === "complete").length} verified in simulation; ${state.rows.filter((row) => row.state === "unchanged").length} need no change; ${state.rows.filter((row) => ["held", "uncertain"].includes(row.state)).length} need attention; ${state.rows.filter((row) => row.state === "ready").length} not selected. Nothing was sent to NXT.`}</p>
          {state.stage === "review" && <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => dispatch({ type: "back" })}>Back to sample setup</button>
            <button type="button" className={button} disabled={!state.rows.some((row) => row.state === "ready")} onClick={() => dispatch({ type: "select-ready" })}>Select ready examples</button>
          </div>}
          <div className="space-y-3">
            {state.rows.map((row) => <article key={row.id} aria-label={row.name} className={`rounded-xl border p-4 ${["held", "uncertain"].includes(row.state) ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{row.name}</h3><span className="text-xs font-semibold">{statusLabels[row.state]}</span></div>
              {row.targetId && <p className="mt-1 text-xs text-slate-600">Sample system ID: {row.targetId} (not an NXT record)</p>}
              <p className="mt-2 text-sm leading-6">{row.message}</p>
              <ul aria-label="Requested sample fields" className="mt-2 list-disc space-y-1 break-words pl-5 text-sm text-slate-700">{row.fields.map((field) => <li key={field}>{field}</li>)}</ul>
              {state.stage === "review" && <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={row.selected} disabled={row.state !== "ready"} onChange={() => dispatch({ type: "select", id: row.id })} />Select {row.name}</label>}
              {row.state === "uncertain" && <button type="button" className={`${button} mt-3 bg-white`} onClick={() => dispatch({ type: "verify", id: row.id })}>Simulate read-only verification</button>}
              {state.stage === "results" && row.state === "ready" && <p className="mt-2 text-sm font-semibold">Not selected; no simulated change was made.</p>}
            </article>)}
          </div>
          {state.stage === "review" && state.rows.every((row) => row.state === "unchanged") ? <button type="button" className={button} onClick={() => dispatch({ type: "finish-unchanged" })}>Finish practice with no changes</button> : state.stage === "review" ? <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold">{selected} ready {selected === 1 ? "record" : "records"} selected. {state.scenarioId === "new" ? "This practices creation approval; updates to existing people remain separate." : "This practices approval of updates, not constituent creation."}</p>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={state.confirmed} onChange={(event) => dispatch({ type: "confirm", value: event.target.checked })} />I reviewed the selected sample changes. Simulate this step only.</label>
            <button type="button" className={`${button} bg-emerald-700 text-white`} disabled={!state.confirmed || !selected} onClick={() => dispatch({ type: "simulate" })}>Simulate approved {state.scenarioId === "new" ? "creation" : "updates"}</button>
          </div> : <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">In a real import, check each field result before considering a record finished. A saved system ID alone does not prove contacts or custom fields were added. Never resend an uncertain write without checking its outcome.</p>}
        </>}
        <div className="border-t border-slate-200 pt-4"><button type="button" className={button} onClick={() => dispatch({ type: "restart" })}>Restart this practice</button></div>
      </section>
    </div>
  </main>;
}
