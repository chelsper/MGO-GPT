"use client";
import { useState } from "react";
import { CAMPAIGN_PRIORITIES, campaignMoney, priorityLabel } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";

const PAGE_SIZE = 100;

export default function CampaignFundAssignments({ data, command, pending }) {
  const [view, setView] = useState("unassigned");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [priority, setPriority] = useState(CAMPAIGN_PRIORITIES[0].key);
  const [message, setMessage] = useState("");
  const unassigned = data.funds.filter(f => f.fund_priority === "unassigned");
  const assigned = data.funds.filter(f => f.fund_priority !== "unassigned");
  const group = view === "unassigned" ? unassigned : assigned;
  const query = search.trim().toLowerCase();
  const matches = group.filter(f => `${f.fund_name} ${f.fund_id}`.toLowerCase().includes(query));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = matches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // Never submit selections hidden by a filter or a refreshed assignment.
  const selectedIds = selected.filter(id => visible.some(f => f.fund_id === id));
  const locked = pending || data.sourceChanged;

  function changeView(next) {
    setView(next); setSearch(""); setPage(1); setSelected([]); setMessage("");
  }
  async function save() {
    if (locked || !selectedIds.length) return;
    const count = selectedIds.length;
    if (await command("funds", { fundIds: selectedIds, priority })) {
      setSelected([]);
      setMessage(priority === "unassigned"
        ? `${count} ${count === 1 ? "fund returned" : "funds returned"} to Unassigned.`
        : `${count} ${count === 1 ? "fund assigned" : "funds assigned"} to ${priorityLabel(priority)}. You can change ${count === 1 ? "it" : "them"} in Assigned.`);
    }
  }
  return <section className={styles.card} aria-label="Fund priority assignments">
    <h2>Give each fund a home</h2>
    <p>Start with Unassigned. Once saved, a fund moves to Assigned, where you can change its priority at any time.</p>
    <div className={styles.fundViews} role="group" aria-label="Fund assignment views">
      <button type="button" aria-pressed={view === "unassigned"} disabled={pending} onClick={() => changeView("unassigned")}>Unassigned ({unassigned.length})</button>
      <button type="button" aria-pressed={view === "assigned"} disabled={pending} onClick={() => changeView("assigned")}>Assigned ({assigned.length})</button>
    </div>
    <div className={styles.toolbar}>
      <label>Find a fund<input type="search" value={search} disabled={pending} onChange={e => { setSearch(e.target.value); setPage(1); setSelected([]); setMessage(""); }} /></label>
      <label>Assign selected funds to<select value={priority} disabled={locked} onChange={e => setPriority(e.target.value)}>
        {CAMPAIGN_PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}<option value="unassigned">Unassigned</option>
      </select></label>
      <button type="button" className={styles.primary} disabled={locked || !selectedIds.length} onClick={save}>Save {selectedIds.length || "selected"} {selectedIds.length === 1 ? "fund" : "funds"}</button>
    </div>
    {message && <p role="status" className={styles.fundSaved}>{message}</p>}
    {visible.length ? <div className={styles.tableWrap}><table className={styles.fundTable} aria-label={`${view === "unassigned" ? "Unassigned" : "Assigned"} funds`}>
      <thead><tr><th scope="col">Select</th><th scope="col">Fund</th><th scope="col">Priority</th><th scope="col">Original amount</th></tr></thead>
      <tbody>{visible.map(f => <tr key={f.fund_id}>
        <td><input type="checkbox" aria-label={`Select ${f.fund_name}`} checked={selectedIds.includes(f.fund_id)} disabled={locked} onChange={e => setSelected(current => e.target.checked ? [...current, f.fund_id] : current.filter(id => id !== f.fund_id))} /></td>
        <td>{f.fund_name}<small>Fund {f.fund_id}</small></td><td>{priorityLabel(f.fund_priority)}</td><td>{campaignMoney(f.original_cents)}</td>
      </tr>)}</tbody>
    </table></div> : <div className={styles.fundEmpty}>
      {query ? <><p>No {view} funds match your search.</p><button type="button" disabled={pending} onClick={() => { setSearch(""); setPage(1); setSelected([]); }}>Clear search</button></>
        : view === "unassigned" ? <><p>All funds have a priority. You can still review or change them in Assigned.</p><button type="button" disabled={pending} onClick={() => changeView("assigned")}>View assigned funds</button></>
          : <p>No funds assigned yet. Choose a priority for funds in Unassigned to get started.</p>}
    </div>}
    {matches.length > 0 && <p className={styles.muted}>Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, matches.length)} of {matches.length} {view} funds{query ? " matching your search" : ""}.</p>}
    {pages > 1 && <nav className={styles.pagination} aria-label="Fund assignment pages">
      <button type="button" disabled={pending || currentPage <= 1} onClick={() => { setPage(currentPage - 1); setSelected([]); }}>Previous funds</button>
      <span>Page {currentPage} of {pages}</span>
      <button type="button" disabled={pending || currentPage >= pages} onClick={() => { setPage(currentPage + 1); setSelected([]); }}>Next funds</button>
    </nav>}
    <p className={styles.muted}>Changes apply to this campaign only. Individual gift exceptions still take precedence over a fund's priority.</p>
  </section>;
}
