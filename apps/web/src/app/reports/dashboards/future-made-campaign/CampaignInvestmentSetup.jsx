"use client";
import { useRef, useState } from "react";
import { campaignClassification, investmentIdFields } from "@/utils/campaignInvestment";
import styles from "./campaign.module.css";

export default function CampaignInvestmentSetup({data,pending,active,readFields,command,onClose,kind="investment"}) {
  const { label, queryId } = campaignClassification(kind);
  const [version] = useState(data.version);
  const [source,setSource] = useState({...data.config?.[kind],queryId:data.config?.[kind]?.queryId || queryId,confirmed:false});
  const [fields,setFields] = useState([]),[loaded,setLoaded] = useState(false),[loading,setLoading] = useState(false),[error,setError] = useState("");
  const request = useRef(0);
  const blocked = pending || active || loading;
  return <section className={styles.card} aria-label={`${label} setup`}>
    <div className={styles.sectionHead}><h2>{label}</h2><button disabled={blocked} onClick={onClose}>Close classification setup</button></div>
    <p>This query identifies {label} gifts within the main campaign. Matching gift system IDs are classified once, including all their fund splits. Amounts, write-offs, balances, dates, and local adjustments still come from the main campaign.</p>
    <p>{kind === "investment" ? <strong>Philanthropic = campaign total minus Comprehensive Investment.</strong> : <strong>Budget Relieving is a separate measure that may overlap Comprehensive Investment or Philanthropic giving. Do not add these measures together.</strong>} This does not replace the five campaign priorities or change NXT.</p>
    <div className={styles.formGrid}>
      <label>{label} query ID<input inputMode="numeric" value={source.queryId} disabled={pending || active} onChange={e=>{request.current++;setSource({queryId:e.target.value,confirmed:false});setFields([]);setLoaded(false);setLoading(false);setError("");}} /></label>
      <button disabled={blocked || !/^[1-9]\d*$/.test(source.queryId)} onClick={async()=>{
        const id=++request.current;setLoading(true);setError("");setLoaded(false);setSource(current=>({...current,confirmed:false}));
        try {
          const result=await readFields(source.queryId);
          if (id!==request.current) return;
          const candidates=investmentIdFields(result.fields);
          setFields(candidates);setLoaded(true);
          setSource(current=>({...current,queryName:result.queryName,giftIdColumn:candidates.includes(current.giftIdColumn) ? current.giftIdColumn : candidates.length===1 ? candidates[0] : "",confirmed:false}));
        } catch(e) {if(id===request.current)setError(e.message);} finally {if(id===request.current)setLoading(false);}
      }}>{loading ? "Loading classification fields..." : "Load classification fields"}</button>
    </div>
    {loaded && <><p role="status">{source.queryName}</p><label>Classification gift system record ID<select value={source.giftIdColumn || ""} disabled={blocked} onChange={e=>setSource({...source,giftIdColumn:e.target.value,confirmed:false})}>
      <option value="">Choose the gift system record ID</option>{fields.map(field=><option key={field}>{field}</option>)}
    </select></label>{!fields.length && <p role="alert">Add the Gift System Record ID to the query output. Constituent IDs and gift lookup codes cannot be substituted.</p>}</>}
    <p className={styles.fieldHelp}>All configured queries are checked during each campaign refresh. If this query returns a gift outside the main campaign, the refresh stops for review rather than changing the campaign scope or silently omitting it.</p>
    <label className={styles.check}><input type="checkbox" checked={source.confirmed} disabled={blocked || !loaded || !source.giftIdColumn} onChange={e=>setSource({...source,confirmed:e.target.checked})} />These are {label} gifts already included in the main campaign query.</label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button className={styles.primary} disabled={blocked || !loaded || !source.confirmed || !source.giftIdColumn} onClick={async()=>{if(await command(kind,source,{_version:version}))onClose();}}>Save classification query</button>
    <p className={styles.muted}>Saving preserves fund assignments and write-offs. Use Refresh campaign afterward to publish all query results together.</p>
  </section>;
}
