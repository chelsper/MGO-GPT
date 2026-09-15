import { useId, useState } from "react";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

export function nextStepDateChoices(now = new Date()) {
  const today = getStandingsPeriods(now).asOf;
  const plusDays = (days) => {
    // Move calendar days, not elapsed hours, across DST and month boundaries.
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  return [
    { label: "Today", value: today },
    { label: "Tomorrow", value: plusDays(1) },
    { label: "In 1 week", value: plusDays(7) },
    { label: "No date", value: "" },
  ];
}

const inputStyle = {
  width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #D1D5DB",
  borderRadius: "10px", padding: "11px 12px", fontSize: "16px", fontFamily: "inherit",
  color: "#111827", backgroundColor: "white",
};
const labelStyle = { display: "grid", gap: "7px", fontSize: "14px", fontWeight: 700, color: "#374151" };

export default function NextStepFields({
  title, details, dueDate, onTitleChange, onDetailsChange, onDueDateChange,
  ownerName, disabled = false, autoFocus = false,
}) {
  const id = useId();
  const [notesOpen, setNotesOpen] = useState(Boolean(details));
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: "16px" }}>
      <legend className="sr-only">Next step details</legend>
      <p style={{ margin: 0, color: "#4B5563", fontSize: "13px", lineHeight: 1.5 }}>
        Owner: <strong>{ownerName || "Current workspace owner"}</strong>. Saved in JUMGOGPT, not NXT.
      </p>
      <label style={labelStyle}>
        What should happen next?
        <input value={title} onChange={e => onTitleChange(e.target.value)} required
          placeholder="For example: Call to schedule a campus visit" autoFocus={autoFocus} style={inputStyle} />
      </label>
      <div style={{ display: "grid", gap: "8px" }}>
        <label style={labelStyle}>
          Due date (optional)
          <input type="date" value={dueDate} onChange={e => onDueDateChange(e.target.value)}
            aria-describedby={`${id}-date-help`} style={inputStyle} />
        </label>
        <div role="group" aria-label="Quick due date" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {nextStepDateChoices().map(choice => (
            <button key={choice.label} type="button" aria-pressed={dueDate === choice.value}
              onClick={() => onDueDateChange(choice.value)} style={{
                padding: "9px 13px", minHeight: "44px", borderRadius: "999px", cursor: disabled ? "not-allowed" : "pointer",
                border: `1px solid ${dueDate === choice.value ? "#4F46E5" : "#D1D5DB"}`,
                color: dueDate === choice.value ? "#3730A3" : "#374151",
                backgroundColor: dueDate === choice.value ? "#EEF2FF" : "white", fontSize: "13px", fontWeight: 700,
              }}>{choice.label}</button>
          ))}
        </div>
        <small id={`${id}-date-help`} style={{ color: "#6B7280", fontSize: "12px" }}>
          Shortcuts use Eastern time. You can also choose any date above.
        </small>
      </div>
      <div>
        <button type="button" aria-expanded={notesOpen} aria-controls={`${id}-notes`}
          onClick={() => setNotesOpen(!notesOpen)} style={{ background: "none", border: 0, padding: "8px 0",
            color: "#4338CA", fontSize: "14px", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" }}>
          {notesOpen ? "Hide notes" : details ? "Show notes" : "Add notes (optional)"}
        </button>
        <div id={`${id}-notes`} hidden={!notesOpen}>
          <label style={labelStyle}>
            Notes (optional)
            <textarea value={details} onChange={e => onDetailsChange(e.target.value)} rows={3}
              placeholder="Context or preparation for this next step" style={{ ...inputStyle, resize: "vertical" }} />
          </label>
        </div>
      </div>
    </fieldset>
  );
}
