import { createContext, useContext, useEffect, useState } from "react";
import { numericScore, scoreText } from "./standingsPresentation";

const GoalsContext = createContext(null);
const endpoint = "/api/reports/executive-team-standings/goals";

export function AnnualGoalsProvider({ fiscalYear, children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const fiscalYearStart = fiscalYear?.startsOn?.slice(0, 4);
  useEffect(() => {
    if (!fiscalYearStart) return;
    const controller = new AbortController();
    setData(null);
    setError("");
    fetch(`${endpoint}?fiscalYearStart=${fiscalYearStart}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.goals)) throw new Error("Annual goals could not load.");
        if (!controller.signal.aborted) setData(result);
      }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [fiscalYearStart, reload]);
  const save = async (userId, raisedGoal, actionsGoal) => {
    const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fiscalYearStart, userId, raisedGoal, actionsGoal }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save annual goals");
    setData((current) => ({ ...current, goals: [...current.goals.filter((goal) => Number(goal.user_id) !== userId), result.goal] }));
  };
  return <GoalsContext.Provider value={{ data, error, save, fiscalYear, retry: () => setReload((value) => value + 1) }}>{children}</GoalsContext.Provider>;
}

function GoalProgress({ label, goal, value, mode }) {
  const target = numericScore(goal), score = numericScore(value);
  const percent = target > 0 && score !== null ? score / target * 100 : null;
  return <div className="standings-goal-progress"><strong>{label}</strong>
    <span>{target > 0 ? `${scoreText(target, mode)} annual goal` : "No goal set"}</span>
    {percent !== null ? <><progress aria-label={`${label} annual goal attainment`} max={100} value={Math.min(percent, 100)} /><b>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(percent)}% of annual goal</b></> : target > 0 ? <span>Progress unavailable</span> : null}
  </div>;
}

export default function AnnualGoals({ entry }) {
  const context = useContext(GoalsContext);
  const [editing, setEditing] = useState(false);
  const [raised, setRaised] = useState("");
  const [actions, setActions] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  if (!context?.fiscalYear) return null;
  const { data, error, save, fiscalYear, retry } = context;
  const goal = data?.goals.find((item) => Number(item.user_id) === entry.userId);
  return <section className="standings-goals" aria-label={`${entry.name} annual goals`}>
    <h4>{fiscalYear.label} annual goals</h4>
    {error ? <p role="alert">{error} <button type="button" onClick={retry}>Retry goals</button></p> : !data ? <p>Loading goals...</p> : <>
      <GoalProgress label="Raised" mode="raised" goal={goal?.raised_goal} value={entry.fundedThisFiscalYear} />
      <GoalProgress label="High-value actions" mode="actions" goal={goal?.actions_goal} value={entry.highValueActionsThisFiscalYear} />
      {data.canEdit && !editing ? <button type="button" onClick={() => { setRaised(goal?.raised_goal ?? ""); setActions(goal?.actions_goal ?? ""); setMessage(""); setEditing(true); }}>Edit annual goals</button> : null}
      {editing ? <form onSubmit={async (event) => {
        event.preventDefault(); setSaving(true); setMessage("");
        try { await save(entry.userId, raised, actions); setEditing(false); setMessage("Annual goals saved. No NXT refresh was needed."); }
        catch (err) { setMessage(err.message); }
        finally { setSaving(false); }
      }}>
        <label>Fundraising goal (USD)<input type="number" min="0.01" max="1000000000000" step="0.01" value={raised} onChange={(event) => setRaised(event.target.value)} disabled={saving} /></label>
        <label>High-value action goal<input type="number" min="1" max="1000000" step="1" value={actions} onChange={(event) => setActions(event.target.value)} disabled={saving} /></label>
        <p>Blank clears a goal. Goals are annual targets, not a monthly pacing forecast.</p>
        <div><button type="submit" disabled={saving}>{saving ? "Saving..." : "Save goals"}</button> <button type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button></div>
      </form> : null}
      {message ? <p role="status">{message}</p> : null}
    </>}
  </section>;
}
