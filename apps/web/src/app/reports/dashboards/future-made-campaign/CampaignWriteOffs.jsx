"use client";
import { useEffect, useRef, useState } from "react";
import { campaignMoney } from "@/utils/campaignPriorities";
import { CAMPAIGN_WRITE_OFF_LIMITS, parseCampaignWriteOffCsv } from "@/utils/campaignWriteOffCsv";
import { campaignFieldCandidates } from "@/utils/campaignSourceMapping";
import styles from "./campaign.module.css";

export default function CampaignWriteOffs({ data, pending, active, readFields, onSave, onClose, saveError }) {
  const ledger = data.config.writeOffLedger;
  const [version] = useState(data.version);
  const [csv, setCsv] = useState(""), [preview, setPreview] = useState(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [fields, setFields] = useState([]), [balanceColumn, setBalanceColumn] = useState(data.config.columns?.pledgeBalance || "");
  const [complete, setComplete] = useState(!ledger), [confirmed, setConfirmed] = useState(false);
  const [asOf, setAsOf] = useState(new Date().toLocaleDateString("en-CA"));
  const [saved, setSaved] = useState(false);
  const fileRequest = useRef(0);
  useEffect(()=>{
    let cancelled=false;
    readFields(data.config.queryId).then(result=>{
      if (cancelled) return;
      setFields(result.fields);
      const matches=campaignFieldCandidates("pledgeBalance",result.fields,data.config.mode);
      setBalanceColumn(current=>result.fields.includes(current) ? current : matches.length===1 ? matches[0] : "");
    }).catch(e=>{ if (!cancelled) setError(e.message); }).finally(()=>{ if (!cancelled) setLoading(false); });
    return ()=>{ cancelled=true; fileRequest.current++; };
  },[data.config.queryId,data.config.mode,readFields]);
  async function chooseFile(file) {
    const id=++fileRequest.current;
    setCsv(""); setPreview(null); setConfirmed(false); setError("");
    if (!file) return;
    try {
      if (file.size>CAMPAIGN_WRITE_OFF_LIMITS.bytes) throw new Error("Choose a CSV no larger than 1 MB.");
      const text=await file.text(), result=parseCampaignWriteOffCsv(text);
      if (id!==fileRequest.current) return;
      setCsv(text); setPreview(result);
    } catch (e) { if (id===fileRequest.current) setError(e.message); }
  }
  return <section className={styles.card} aria-label="Manage campaign write-offs">
    <div className={styles.sectionHead}><h2>Manage write-offs</h2><button disabled={pending} onClick={onClose}>Close write-offs</button></div>
    <p>Upload the cumulative write-off total for each pledge, including matching-gift pledges. Matching gift IDs are updated, not added twice. NXT records never change.</p>
    {ledger && <p className={styles.muted}>Saved register: {ledger.count} pledges, {campaignMoney(ledger.writeOffCents)}. Complete list through {ledger.completeAsOf}; latest changes through {ledger.latestAsOf}.</p>}
    {saved ? <p role="status">Write-offs saved. {saved.started ? "The campaign refresh is running below." : "The refresh did not start successfully. Use Refresh campaign below to retry without re-uploading."} Previous totals stay visible until the complete refresh passes.</p> : <>
      <p className={styles.fieldHelp}>CSV columns: Gift Amount, Gift Type, Pledge Balance, Gf_System_ID, Write off. Use original pledge amounts before write-offs and cumulative write-off totals, not individual transactions.</p>
      <div className={styles.formGrid}>
        <label>Write-off CSV<input type="file" accept=".csv,text/csv" disabled={pending || active} onChange={e=>chooseFile(e.target.files?.[0])} /></label>
        <label>Write-offs through<input type="date" value={asOf} disabled={pending || active} onChange={e=>{setAsOf(e.target.value);setConfirmed(false);}} /></label>
        <label>Upload contains<select value={complete ? "complete" : "updates"} disabled={pending || active || !ledger} onChange={e=>{setComplete(e.target.value==="complete");setConfirmed(false);}}>
          <option value="complete">All campaign pledges with write-offs</option><option value="updates">Additions or corrections only</option>
        </select></label>
        <label>Current balance field in campaign query<select value={balanceColumn} disabled={pending || active || loading} onChange={e=>{setBalanceColumn(e.target.value);setConfirmed(false);}}>
          <option value="">{loading ? "Loading query fields..." : "Choose pledge balance"}</option>{fields.map(field=><option key={field}>{field}</option>)}
        </select></label>
      </div>
      <p className={styles.fieldHelp}>Received uses current balances from the main campaign query, not this CSV's older balances. Later uploads keep unlisted write-offs; include an explicit zero to reverse one. Only gifts still in the campaign contribute to totals.</p>
      {!data.config.columns?.giftType && <p className={styles.notice}>Map Gift type in Source setup first so pledge types can be verified.</p>}
      {active && <p className={styles.notice}>Finish or cancel the running campaign refresh before uploading another file.</p>}
      {preview && <div aria-label="Write-off CSV preview"><p role="status">{preview.count} unique pledges, including {preview.matching} matching-gift pledges. Write-offs in this file: <strong>{campaignMoney(preview.writeOffCents)}</strong>.</p>
        <div className={styles.tableWrap}><table><thead><tr><th>Gift system ID</th><th>Original pledge</th><th>Write-off</th><th>Net commitment</th></tr></thead><tbody>{preview.entries.slice(0,10).map(row=><tr key={row.giftId}><td>{row.giftId}</td><td>{campaignMoney(row.grossCents)}</td><td>{campaignMoney(row.writeOffCents)}</td><td>{campaignMoney(row.grossCents-row.writeOffCents)}</td></tr>)}</tbody></table></div>
        {preview.count>10 && <p className={styles.muted}>Showing the first 10; all {preview.count} rows will be checked against the saved campaign before saving.</p>}
      </div>}
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={pending || active || !preview} onChange={e=>setConfirmed(e.target.checked)} />I reviewed these cumulative write-off totals and the through date.{complete ? " This includes all campaign pledges with write-offs, including matching-gift pledges." : " Unlisted pledges keep their saved write-offs."}</label>
      <button className={styles.primary} disabled={pending || active || loading || !preview || !confirmed || !asOf || !balanceColumn || !data.config.columns?.giftType} onClick={async()=>{
        const result=await onSave({csv,asOf,complete,confirmed,balanceColumn},version);
        if (result?.saved) setSaved(result);
      }}>Save write-offs and refresh campaign</button>
    </>}
    {(error || saveError) && <p role="alert" className={styles.error}>{error || saveError}</p>}
  </section>;
}
