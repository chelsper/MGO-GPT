"use client";
import { useEffect, useRef, useState } from "react";
import { lifetimeBaseGroupIds } from "@/utils/lifetimeSocieties";
import LifetimeFamilyPreview from "./LifetimeFamilyPreview";
import styles from "./lifetime.module.css";

export default function LifetimeFamilyGroups({ snapshot, links = [], canManage, busy, revision, request, onOpen, onClose, onCommand, onAccessDenied, onReload }) {
  const [householdKey, setHouseholdKey] = useState(""), [organizationKey, setOrganizationKey] = useState("");
  const [search, setSearch] = useState(""), [removing, setRemoving] = useState(null);
  const [page, setPage] = useState(0);
  const panel = useRef(null);
  const active = lifetimeBaseGroupIds(snapshot);
  const households = (snapshot?.sharedGroups || []).filter(group => active.has(group.id) && !group.rows[0].archived).sort((a, b) => a.rows[0].name.localeCompare(b.rows[0].name));
  const organizations = [...new Map((snapshot?.rows || []).filter(row => row.constituentType === "organization").map(row => [row.recordKey, row])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const matches = links.filter(link => `${link.householdName} ${link.organizationName}`.toLowerCase().includes(search.trim().toLowerCase()));
  const current = Math.min(page, Math.max(0, Math.ceil(matches.length / 10) - 1));
  const household = households.find(group => group.rows[0].recordKey === householdKey), organization = organizations.find(row => row.recordKey === organizationKey);
  const existing = links.find(link => link.organizationKey === organizationKey);
  const valid = household && organization && !existing && snapshot?.giftReviewAvailable;
  useEffect(() => {
    setHouseholdKey(request?.householdKey || ""); setOrganizationKey(request?.recordKey || ""); setRemoving(null);
    if (request) { panel.current?.focus(); panel.current?.scrollIntoView?.({ block: "center" }); }
  }, [request]);
  useEffect(() => {
    if (removing) setRemoving(null);
  }, [revision]);
  async function save() {
    if (!canManage || busy || !valid) return;
    if (await onCommand("link-family", { householdKey, recordKey: organizationKey })) onClose();
  }
  return <section className={styles.panel} aria-label="Family giving groups">
    <div className={styles.tableHeader}><div><h2>Family giving groups</h2>
      <p>Link a family foundation or other organization to an existing household for combined society recognition. Organizations are never added automatically.</p></div>
      {canManage && !request && <button disabled={busy || !snapshot} onClick={() => onOpen({})}>Link foundation to household</button>}
    </div>
    <small>All imported qualifying gifts for the selected household and linked organizations count once per gift. Individual credit and NXT records stay unchanged. These are recognition totals, not additional revenue.</small>
    {canManage && request && <div ref={panel} tabIndex={-1} className={styles.groupConfirm} role="region" aria-label="Link foundation to household">
      <h3>Choose the exact records</h3>
      <div className={styles.filters}>
        <label>Household<select disabled={busy} value={householdKey} onChange={e => setHouseholdKey(e.target.value)}>
          <option value="">Choose a household</option>{households.map(group => <option key={group.id} value={group.rows[0].recordKey}>{group.rows[0].name} ({group.members.map(person => person.lookupId || person.systemId).join(" / ")})</option>)}
        </select></label>
        <label>Foundation or organization<select disabled={busy} value={organizationKey} onChange={e => setOrganizationKey(e.target.value)}>
          <option value="">Choose an organization</option>{organizations.map(row => <option key={row.recordKey} value={row.recordKey}>{row.name} / {row.lookupId || row.systemId}{row.archived ? " / Archived; gift credit retained" : ""}</option>)}
        </select></label>
      </div>
      {!households.length && <p>First confirm an individual household under Households. Spouse links are not guessed from names.</p>}
      {!snapshot?.giftReviewAvailable && <p>Refresh gift history once to save the evidence needed to combine gifts safely.</p>}
      {existing && <p role="status">This organization is already linked to {existing.householdName}. Unlink that saved choice before assigning it again.</p>}
      {valid && <>
        <p><strong>{household.rows[0].name}</strong> + <strong>{organization.name}</strong></p>
        <p>This includes all of this organization's imported qualifying gifts, even those not soft credited to either spouse. Existing foundation links for this household remain included. Shared gifts count once; unresolved gifts still require reconciliation.</p>
        <p>The combined family group has its own entry dates. Existing individual, household and organization confirmations stay saved and are not copied to the new group. Missing members after a refresh leave the link for review rather than combining a partial group.</p>
        <LifetimeFamilyPreview key={`${revision}:${householdKey}:${organizationKey}`} revision={revision} householdKey={householdKey} recordKey={organizationKey}
          busy={busy} onConfirm={save} onAccessDenied={onAccessDenied} onReload={onReload} />
      </>}
      <div className={styles.actions}>{!valid && <button className={styles.primary} disabled>Confirm family link</button>}<button disabled={busy} onClick={onClose}>Cancel</button></div>
    </div>}
    {!!links.length && <>
      <label>Find a family link<input type="search" value={search} disabled={busy} onChange={e => { setSearch(e.target.value); setPage(0); setRemoving(null); }} /></label>
      {!matches.length && <p>No saved family links match this search.</p>}
      {matches.slice(current * 10, (current + 1) * 10).map(link => <article className={styles.group} key={link.key}>
        <h3>{link.householdName} + {link.organizationName}</h3>
        <p>{link.matched ? "Linked / All imported qualifying giving / Shared gifts counted once" : "Needs review: a saved identity or household no longer matches. This family group is not combined."}</p>
        {canManage && (removing === link.key ? <>
          <p>Remove this foundation link? Other links and all gift credit remain. Prior exact-scope date confirmations stay saved; no date is transferred to a different group.</p>
          <div className={styles.actions}><button disabled={busy} onClick={async () => { if (await onCommand("unlink-family", { familyLinkKey: link.key })) setRemoving(null); }}>Confirm unlink</button>
            <button disabled={busy} onClick={() => setRemoving(null)}>Keep linked</button></div>
        </> : <button disabled={busy} onClick={() => setRemoving(link.key)}>Unlink organization</button>)}
      </article>)}
      {matches.length > 10 && <div className={styles.pagination}><p>{matches.length} saved family links / Page {current + 1} of {Math.ceil(matches.length / 10)}</p><div className={styles.actions}>
        <button disabled={busy || !current} onClick={() => { setPage(current - 1); setRemoving(null); }}>Previous family links</button>
        <button disabled={busy || (current + 1) * 10 >= matches.length} onClick={() => { setPage(current + 1); setRemoving(null); }}>Next family links</button></div></div>}
    </>}
  </section>;
}
