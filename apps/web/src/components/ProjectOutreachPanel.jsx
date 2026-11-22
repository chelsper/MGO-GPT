import { useEffect, useRef, useState } from "react";
import { INTERACTION_TYPES } from "@/utils/actionEntryOptions";
import {
  outreachPeople,
  outreachCounts,
  outreachPledgeColumns,
  outreachPledgeContext,
  OUTREACH_OUTCOMES,
  validateOutreachOutcome,
  validateOutreachSettings,
} from "@/utils/projectOutreach";
import { projectIdentity } from "@/utils/projectProspecting";
import { requestProjectOutreach } from "@/utils/projectOutreachRequest";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import styles from "./projectOutreach.module.css";
import ProjectOutreachReadiness from "./ProjectOutreachReadiness";
import ProjectOutreachProgress from "./ProjectOutreachProgress";
import { matchesOutreachProgress } from "@/utils/outreachProgress";
import {
  outreachCallQueue,
  outreachCallLabel,
  recordedCallOutcome,
  canAdvanceCall,
} from "@/utils/outreachCallQueue";

const emptySettings = {
  nameColumn: "",
  phoneColumn: "",
  restrictionColumn: "",
  deadline: "",
  instructions: "",
  interactionType: "Solicitation",
};
const stageLabel = {
  not_started: "Not started",
  follow_up: "Follow-up needed",
  complete: "Outreach complete",
};

function Setup({ saved, headers, busy, onSave }) {
  const [settings, setSettings] = useState(saved.settings || emptySettings);
  const error = validateOutreachSettings(settings, headers);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!error) onSave(settings);
      }}
    >
      <p>
        Choose the query's contact columns. Assignment does not add a custom
        field or change a solicitor in NXT.
      </p>
      <div className={styles.fields}>
        {[
          ["nameColumn", "Constituent name", true],
          ["phoneColumn", "Phone number", false],
          ["restrictionColumn", "Contact restrictions / do-not-call", false],
        ].map(([key, label, required]) => (
          <label key={key}>
            {label}
            <select
              data-outreach-field={key}
              value={settings[key]}
              required={required}
              disabled={busy}
              onChange={(e) =>
                setSettings({ ...settings, [key]: e.target.value })
              }
            >
              <option value="">
                {required ? "Choose output column" : "Not in this query"}
              </option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Project deadline
          <input
            type="date"
            data-outreach-field="deadline"
            required
            value={settings.deadline}
            disabled={busy}
            onChange={(e) =>
              setSettings({ ...settings, deadline: e.target.value })
            }
          />
        </label>
        <label>
          NXT action type
          <select
            value={settings.interactionType}
            disabled={busy}
            onChange={(e) =>
              setSettings({ ...settings, interactionType: e.target.value })
            }
          >
            {INTERACTION_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      {!!outreachPledgeColumns(headers).length && (
        <label className={styles.check}>
          <input type="checkbox" checked={settings.showPledgeContext === true}
            disabled={busy} onChange={(e) => setSettings({ ...settings, showPledgeContext: e.target.checked })} />
          Show unpaid pledge installments that are past due or due by the project deadline
        </label>
      )}
      <label>
        Instructions for callers
        <textarea
          data-outreach-field="instructions"
          value={settings.instructions}
          maxLength={2000}
          disabled={busy}
          onChange={(e) =>
            setSettings({ ...settings, instructions: e.target.value })
          }
          placeholder="Purpose of the call, talking points, and next steps"
        />
      </label>
      <small>
        Changing the project deadline sets the default for new assignments.
        Existing due dates stay unchanged unless you explicitly assign them a
        new date.
      </small>
      <button disabled={busy || !!error} className={styles.primary}>
        Save outreach setup
      </button>
    </form>
  );
}

function OutcomeForm({
  task,
  saved,
  busy,
  onSave,
  onCancel,
  guided = false,
  unavailable = false,
}) {
  const [result, setResult] = useState(() => ({
    eventId: crypto.randomUUID(),
    taskId: task.id,
    version: task.version,
    outcome: "",
    notes: "",
    actionDate: saved.today,
    stage: "follow_up",
    nextDate: "",
    contactReviewed: false,
  }));
  const error = validateOutreachOutcome(result, saved.today);
  const field = (name, value) =>
    setResult((current) => ({ ...current, [name]: value }));
  function cancel() {
    const dirty =
      result.outcome ||
      result.notes ||
      result.nextDate ||
      result.contactReviewed ||
      result.stage !== "follow_up" ||
      result.actionDate !== saved.today;
    if (
      dirty &&
      !window.confirm(
        "Leave this outcome? Unsaved edits will be discarded. If a save was attempted, check saved status before recording a replacement.",
      )
    )
      return;
    onCancel();
  }
  useEffect(() => {
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  return (
    <form
      className={styles.form}
      onSubmit={(e) => e.preventDefault()}
      aria-label={`Record outcome for ${task.name}`}
    >
      <h3>Record outcome: {task.name}</h3>
      <div className={styles.fields}>
        <label>
          What happened?
          <select
            autoFocus={!guided}
            value={result.outcome}
            onChange={(e) => field("outcome", e.target.value)}
            disabled={busy}
            required
          >
            <option value="">Choose outcome</option>
            {Object.entries(OUTREACH_OUTCOMES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Interaction date
          <input
            type="date"
            value={result.actionDate}
            max={saved.today}
            onChange={(e) => field("actionDate", e.target.value)}
            disabled={busy}
            required
          />
        </label>
        <label>
          Next step
          <select
            value={result.stage}
            onChange={(e) =>
              setResult({
                ...result,
                stage: e.target.value,
                nextDate: e.target.value === "complete" ? "" : result.nextDate,
              })
            }
            disabled={busy}
          >
            <option value="follow_up">Follow-up needed</option>
            <option value="complete">Outreach complete</option>
          </select>
        </label>
        {result.stage === "follow_up" && (
          <label>
            Follow-up date
            <input
              type="date"
              value={result.nextDate}
              min={result.actionDate}
              onChange={(e) => field("nextDate", e.target.value)}
              disabled={busy}
              required
            />
          </label>
        )}
      </div>
      <label>
        Notes
        <textarea
          value={result.notes}
          maxLength={4000}
          onChange={(e) => field("notes", e.target.value)}
          disabled={busy}
          required
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={result.contactReviewed}
          onChange={(e) => field("contactReviewed", e.target.checked)}
          disabled={busy}
        />
        I reviewed contact preferences and am recording what actually happened.
      </label>
      <p>
        Saving keeps the result in this project. Submitting also creates one
        completed{" "}
        {result.outcome === "contact_issue" ? "Task/Other" : "Phone Call"} /{" "}
        {saved.settings.interactionType} action in NXT, credited to you. It does
        not send a message or change a portfolio.
      </p>
      <div className={styles.tools}>
        <button
          type="button"
          className={styles.primary}
          disabled={busy || unavailable || !!error}
          onClick={() => onSave(result, true)}
        >
          {guided ? "Save, submit & next" : "Save & submit NXT action"}
        </button>
        <button
          type="button"
          disabled={busy || unavailable || !!error}
          onClick={() => onSave(result, false)}
        >
          {guided ? "Save & next (local only)" : "Save outcome only"}
        </button>
        <button type="button" disabled={busy} onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EventActions({ event, own, busy, run }) {
  const [actionId, setActionId] = useState("");
  if (event.state === "confirmed")
    return (
      <p className={styles.positive}>NXT action confirmed: {event.actionId}</p>
    );
  if (!own)
    return (
      <p>
        NXT:{" "}
        {event.state === "draft"
          ? "Not submitted"
          : "Needs verification by the staff member who recorded it"}
        .
      </p>
    );
  return event.state === "draft" ? (
    <div className={styles.tools}>
      <span>Outcome saved; NXT not submitted.</span>
      <button
        disabled={busy}
        onClick={() =>
          run({ operation: "submit", eventId: event.id, confirm: true })
        }
      >
        Submit this saved outcome to NXT
      </button>
    </div>
  ) : (
    <div className={styles.warning}>
      <p>
        Outcome saved. The action may already exist in NXT. Do not submit a
        replacement.
      </p>
      <label>
        Existing NXT action system ID (if not already saved)
        <input
          value={actionId}
          inputMode="numeric"
          onChange={(e) => setActionId(e.target.value)}
          disabled={busy}
        />
      </label>
      <button
        disabled={busy}
        onClick={() =>
          run({
            operation: "verify",
            eventId: event.id,
            ...(actionId ? { actionId } : {}),
          })
        }
      >
        Verify existing action only
      </button>
    </div>
  );
}

function PledgeContext({ context }) {
  if (!context) return null;
  return (
    <aside className={styles.pledgeContext} aria-label="Saved pledge reminders">
      {context.installments.map((item) => (
        <p key={item.slot}>
          <strong>{item.status} pledge installment</strong>{" "}
          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.cents / 100)} unpaid / Due {item.date}
        </p>
      ))}
      {context.needsReview && <p>Pledge details need a check in NXT; an amount or date is missing or conflicting.</p>}
      <small>From saved query output, not a live balance or a total of all pledges. Check NXT before discussing payment.</small>
    </aside>
  );
}

function CallContext({ task, person, saved, focusRef }) {
  const latest = task.events[0];
  const overlap = saved.overlaps?.find(
    (item) => item.constituent_id === task.constituentId,
  );
  return (
    <section className={styles.callContext} aria-label="Current call details">
      <span className={styles.eyebrow}>
        {outreachCallLabel(task, saved.today)}
      </span>
      <h3 ref={focusRef} tabIndex={-1}>
        {person?.name || task.name}
      </h3>
      <p className={styles.help}>
        System ID {task.constituentId} / Due {task.dueDate}
      </p>
      <p>
        {person?.phones.length
          ? person.phones.join(" / ")
          : "No phone number in the saved query. Check contact details before calling."}
      </p>
      {!!person?.restrictions.length && (
        <p className={styles.warning}>
          Review contact restrictions: {person.restrictions.join(" / ")}
        </p>
      )}
      <p className={styles.help}>
        Contact details are from the saved query. Check current NXT contact
        preferences before calling; blank restrictions are not permission.
      </p>
      <PledgeContext context={person?.pledgeContext} />
      {overlap && (
        <p className={styles.warning}>
          Open outreach in {overlap.count} other project(s) you can access.
          Coordinate before calling.
        </p>
      )}
      <a
        href={buildBlackbaudConstituentProfileUrl(task.constituentId)}
        target="_blank"
        rel="noreferrer"
      >
        Open NXT record
      </a>
      <div className={styles.brief}>
        <strong>Caller instructions</strong>
        <p>
          {saved.settings.instructions || "No additional instructions saved."}
        </p>
      </div>
      {latest && (
        <details>
          <summary>Latest recorded outcome</summary>
          <p>
            {latest.result.actionDate}:{" "}
            {OUTREACH_OUTCOMES[latest.result.outcome]}
          </p>
          <p>{latest.actorName}</p>
          <p className={styles.notes}>{latest.result.notes}</p>
          {latest.result.nextDate && (
            <p>Follow-up date: {latest.result.nextDate}</p>
          )}
        </details>
      )}
    </section>
  );
}

export default function ProjectOutreachPanel({
  report,
  snapshot,
  refreshing = false,
  onReviewSource,
}) {
  const [saved, setSaved] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [search, setSearch] = useState(""),
    [scope, setScope] = useState(""),
    [status, setStatus] = useState("open");
  const [selected, setSelected] = useState([]),
    [assignee, setAssignee] = useState(""),
    [dueDate, setDueDate] = useState("");
  const [confirm, setConfirm] = useState(false),
    [editing, setEditing] = useState(null),
    [page, setPage] = useState(0);
  const [callMode, setCallMode] = useState(false),
    [handledCalls, setHandledCalls] = useState([]),
    [pausedCalls, setPausedCalls] = useState([]),
    [callAttempt, setCallAttempt] = useState(null);
  const [progressFocus, setProgressFocus] = useState(null);
  const previousFilters = useRef(null),
    progressHeading = useRef(null),
    progressOpener = useRef(null);
  const controller = useRef(null),
    writing = useRef(false),
    outcomeOpener = useRef(null),
    callStartRef = useRef(null),
    callLaunchRef = useRef(null),
    callFocusRef = useRef(null),
    returnCallFocus = useRef(false),
    setupRef = useRef(null);
  function openSetup(field) {
    if (!setupRef.current) return;
    setupRef.current.open = true;
    setupRef.current.querySelector(`[data-outreach-field="${field}"]`)?.focus();
  }
  function selectProgress(selection, opener) {
    if (busy || editing) return;
    if (!progressFocus)
      previousFilters.current = { scope, status, search, page };
    progressOpener.current = opener;
    setProgressFocus(selection);
    setScope("all");
    setStatus("all");
    setSearch("");
    setPage(0);
    setSelected([]);
    setConfirm(false);
  }
  function clearProgress(restore = false) {
    if (restore && previousFilters.current) {
      const previous = previousFilters.current;
      setScope(previous.scope);
      setStatus(previous.status);
      setSearch(previous.search);
      setPage(previous.page);
      progressOpener.current?.focus();
    }
    setProgressFocus(null);
    previousFilters.current = null;
    setSelected([]);
    setConfirm(false);
  }
  useEffect(() => {
    if (progressFocus && !callMode) progressHeading.current?.focus();
  }, [progressFocus, callMode]);
  useEffect(() => {
    if (callMode) callFocusRef.current?.focus();
    else if (returnCallFocus.current) {
      (callStartRef.current?.disabled
        ? callLaunchRef.current
        : callStartRef.current
      )?.focus();
      returnCallFocus.current = false;
    } else if (!editing) outcomeOpener.current?.focus();
  }, [editing, callMode, callAttempt]);
  const endpoint = `/api/reports/lists/${encodeURIComponent(report.key)}/outreach`;
  async function load(signal) {
    const data = await requestProjectOutreach(endpoint, { signal });
    if (
      data.revision !== report.revision ||
      data.snapshotAt !== (snapshot?.generatedAt || null) ||
      !Array.isArray(data.tasks) ||
      !Array.isArray(data.callers)
    )
      throw new Error(
        "The saved query changed. Reload the project to continue; your recorded outcomes are kept.",
      );
    if (!signal.aborted) {
      setSaved(data);
      setError("");
      setSelected([]);
      setConfirm(false);
    }
    return data;
  }
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setSaving(false);
    load(current.signal)
      .catch((e) => {
        if (!current.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!current.signal.aborted) setLoading(false);
      });
    return () => current.abort();
  }, [endpoint, report.revision, snapshot?.generatedAt]);
  async function reload() {
    if (writing.current) return;
    setLoading(true);
    try {
      await load(controller.current.signal);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function run(body, afterSave) {
    if (writing.current || loading || refreshing || error) return;
    writing.current = true;
    setSaving(true);
    setNotice("Saving...");
    const signal = controller.current.signal;
    let acknowledged = false;
    try {
      const result = await requestProjectOutreach(endpoint, {
        signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, revision: report.revision }),
      });
      if (signal.aborted) return;
      acknowledged = true;
      if (afterSave) await afterSave(result, signal);
      const message =
        result.message ||
        (result.state === "confirmed"
          ? "NXT action confirmed. Nothing was sent to the constituent."
          : result.state === "processing"
            ? "Submission is still protected. Reload saved status; do not submit it again."
            : "Changes saved. Portfolio ownership is unchanged.");
      const data = await load(signal);
      if (!signal.aborted) {
        if (
          result.state === "confirmed" &&
          !data.tasks.some((task) =>
            task.events.some(
              (event) =>
                event.id === (body.eventId || body.result?.eventId) &&
                event.state === "confirmed",
            ),
          )
        )
          throw new Error(
            "NXT confirmation is not present in saved status. Reload saved outreach before continuing; do not submit a replacement.",
          );
        setNotice(message);
        return data;
      }
    } catch (e) {
      if (!signal.aborted) {
        if (
          body.operation === "record" &&
          !acknowledged &&
          [400, 403, 409, 413, 422].includes(e.status)
        )
          setCallAttempt(null);
        setNotice("");
        setError(e.message);
      }
    } finally {
      writing.current = false;
      if (!signal.aborted) setSaving(false);
    }
  }
  async function record(result, send) {
    if (writing.current || loading || refreshing || error) return;
    const attempt = { result, send };
    if (callMode) setCallAttempt(attempt);
    const data = await run(
      {
        operation: "record",
        result,
        settingsVersion: saved.settingsVersion,
        snapshotAt: saved.snapshotAt,
      },
      async (value, signal) => {
        if (value.id !== result.eventId)
          throw new Error(
            "The save returned incomplete status. Reload saved outreach before continuing; do not record a replacement.",
          );
        setEditing(null);
        if (send) {
          let synced;
          try {
            synced = await requestProjectOutreach(endpoint, {
              signal,
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                operation: "submit",
                eventId: value.id,
                confirm: true,
                revision: report.revision,
              }),
            });
          } catch {
            throw new Error(
              "Your outcome is saved. NXT confirmation is unavailable. Reload saved status before continuing; do not record a replacement outcome.",
            );
          }
          if (synced.state !== "confirmed")
            throw new Error(
              synced.message ||
                "Outcome saved; NXT is not yet confirmed. Reload saved outreach to check.",
            );
          value.state = "confirmed";
        }
      },
    );
    if (callMode && data) {
      if (canAdvanceCall(data, attempt)) advanceCall(data, result.taskId);
      else {
        setNotice("");
        setError(
          "The saved outcome is not confirmed in the reloaded status. Reload saved outreach before continuing; do not record a replacement.",
        );
      }
    }
  }
  function advanceCall(data, taskId) {
    const handled = [...new Set([...handledCalls, taskId])];
    setHandledCalls(handled);
    setCallAttempt(null);
    const next = outreachCallQueue(data, [...handled, ...pausedCalls])[0];
    setEditing(next?.id || null);
  }
  function stopCalls() {
    returnCallFocus.current = true;
    if (callAttempt) {
      const remember = canAdvanceCall(saved, callAttempt)
        ? setHandledCalls
        : setPausedCalls;
      remember((current) => [
        ...new Set([...current, callAttempt.result.taskId]),
      ]);
    }
    setCallMode(false);
    setCallAttempt(null);
    setEditing(null);
  }
  const identity = projectIdentity(snapshot, report.dataConfiguration);
  const settingsError =
    saved?.settings &&
    validateOutreachSettings(saved.settings, snapshot?.headers);
  const busy = loading || saving || refreshing;
  const blocked = busy || !!error;
  const tasks = saved?.tasks || [];
  const pledgeContexts = outreachPledgeContext(snapshot, report.dataConfiguration, saved?.settings, saved?.today);
  const people = outreachPeople(
    snapshot,
    report.dataConfiguration,
    saved?.settings,
  ).map((person) => ({ ...person, pledgeContext: pledgeContexts.get(person.constituentId) }));
  const peopleById = new Map(people.map((p) => [p.constituentId, p]));
  const tasksById = new Map(tasks.map((t) => [t.constituentId, t]));
  const rows = [
    ...people.map((p) => ({ ...p, task: tasksById.get(p.constituentId) })),
    ...tasks
      .filter((t) => !peopleById.has(t.constituentId))
      .map((t) => ({
        constituentId: t.constituentId,
        name: t.name,
        phones: [],
        restrictions: [],
        task: t,
      })),
  ];
  const effectiveScope = scope || (saved?.canManage ? "all" : "mine");
  const visible = rows.filter((p) => {
    const t = p.task;
    return (
      (!saved?.canManage ||
        matchesOutreachProgress(p, progressFocus, saved.today)) &&
      (!search ||
        `${p.name} ${p.constituentId} ${t?.assigneeName || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (effectiveScope === "all" ||
        t?.assigneeId === saved?.viewerId ||
        t?.events.some(
          (e) => e.actorId === saved?.viewerId && e.state !== "confirmed",
        )) &&
      (status === "all" ||
        (status === "unassigned" && !t) ||
        (status === "open" &&
          (t?.stage !== "complete" ||
            t.events.some((e) => e.state !== "confirmed"))) ||
        status === t?.stage ||
        (status === "attention" &&
          t &&
          (!t.inCurrentQuery ||
            !t.assigneeAvailable ||
            t.events.some((e) => e.state !== "confirmed"))))
    );
  });
  const counts = outreachCounts(
    effectiveScope === "all"
      ? tasks
      : tasks.filter((t) => t.assigneeId === saved?.viewerId),
  );
  const selectable = (p) =>
    !!saved?.canManage &&
    !!saved.settings &&
    !settingsError &&
    !identity.error &&
    peopleById.has(p.constituentId) &&
    !p.task?.events.some((e) => ["processing", "review"].includes(e.state));
  const pages = Math.max(1, Math.ceil(visible.length / 25)),
    currentPage = Math.min(page, pages - 1);
  const editingTask = tasks.find((t) => t.id === editing);
  const callQueue = outreachCallQueue(saved, [...handledCalls, ...pausedCalls]);
  const callEvent = recordedCallOutcome(saved, callAttempt);
  const canContinueCall = canAdvanceCall(saved, callAttempt);
  const activeCallTask =
    editingTask || tasks.find((t) => t.id === callAttempt?.result.taskId);
  const callUnavailable =
    !!activeCallTask &&
    (!saved?.canRecord ||
      activeCallTask.assigneeId !== saved.viewerId ||
      !activeCallTask.assigneeAvailable ||
      !activeCallTask.inCurrentQuery ||
      !!settingsError ||
      !!identity.error ||
      activeCallTask.events.some((e) =>
        ["processing", "review"].includes(e.state),
      ));
  return (
    <section
      className={styles.panel}
      aria-label="Project outreach"
      aria-busy={busy}
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>PROJECT OUTREACH</span>
          <h2>Call assignments &amp; outcomes</h2>
          <p>
            Temporary project work, not portfolio ownership. Opening this view
            does not contact NXT.
          </p>
        </div>
        <button disabled={busy} onClick={reload}>
          Reload saved outreach
        </button>
      </div>
      {loading && <p role="status">Loading saved outreach...</p>}
      {error && (
        <div className={styles.warning} role="alert">
          {error}{" "}
          <button disabled={busy} onClick={reload}>
            Reload saved status
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {saved && (
        <ProjectOutreachReadiness
          report={report}
          snapshot={snapshot}
          saved={saved}
          busy={blocked}
          onSetup={openSetup}
          onReviewSource={onReviewSource}
        />
      )}
      {identity.error && (
        <p className={styles.warning}>
          Map the constituent system record ID in Project settings before
          assigning people.
        </p>
      )}
      {saved?.canManage && (
        <details ref={setupRef} open={!saved.settings || !!settingsError}>
          <summary>Outreach setup</summary>
          <Setup
            key={saved.settingsVersion}
            saved={saved}
            headers={snapshot?.headers || []}
            busy={blocked}
            onSave={(settings) =>
              run({
                operation: "settings",
                settings,
                settingsVersion: saved.settingsVersion,
              })
            }
          />
        </details>
      )}
      {saved && !saved.settings && (
        <p>
          No outreach assignments yet. An Admin or Advancement Services user
          needs to save the project deadline and contact columns.
        </p>
      )}
      {saved?.settings && (
        <>
          {!callMode && (
            <div className={styles.brief}>
              <strong>Project deadline: {saved.settings.deadline}</strong>
              <p>
                {saved.settings.instructions ||
                  "No additional instructions saved."}
              </p>
            </div>
          )}
          {settingsError && (
            <p className={styles.warning}>
              {settingsError} Existing assignments and history are kept.
            </p>
          )}
          {saved.canRecord && !callMode && (
            <section
              className={styles.callLaunch}
              aria-label="My next call"
              ref={callLaunchRef}
              tabIndex={-1}
            >
              <div>
                <h3>Work through my calls</h3>
                <p>
                  {callQueue.length}{" "}
                  {callQueue.length === 1 ? "person ready" : "people ready"}.
                  Overdue follow-ups first, then due assignments, then people
                  not yet contacted.
                </p>
                <p className={styles.help}>
                  Uses your assignments across this project, not the list
                  filters. Future follow-ups, completed outreach and uncertain
                  NXT actions stay in the list, not this call queue.
                </p>
                {pausedCalls.length > 0 && (
                  <p className={styles.warning}>
                    {pausedCalls.length} paused after an unconfirmed save.
                    Review saved history in the list before recording a
                    replacement outcome.
                  </p>
                )}
              </div>
              <button
                className={styles.primary}
                disabled={
                  blocked ||
                  !!settingsError ||
                  !!identity.error ||
                  !!editing ||
                  !callQueue.length
                }
                ref={callStartRef}
                onClick={() => {
                  setCallAttempt(null);
                  setCallMode(true);
                  setEditing(callQueue[0].id);
                  setConfirm(false);
                  setSelected([]);
                  setNotice("");
                }}
              >
                Start my next call
              </button>
            </section>
          )}
          {callMode ? (
            <section
              className={styles.callWorkspace}
              aria-label="Guided call workspace"
            >
              <div className={styles.heading}>
                <div>
                  <h3>One person at a time</h3>
                  <p className={styles.help}>
                    Save locally, or explicitly submit an NXT action. We move on
                    only after reloading and confirming the saved result.
                  </p>
                </div>
                <span>{handledCalls.length} handled this session</span>
              </div>
              {activeCallTask && (
                <CallContext
                  task={activeCallTask}
                  person={peopleById.get(activeCallTask.constituentId)}
                  saved={saved}
                  focusRef={callFocusRef}
                />
              )}
              {callEvent || (callAttempt && !editingTask) ? (
                <div className={styles.callRecovery}>
                  <h3>Check this saved outcome before moving on</h3>
                  {callEvent ? (
                    <>
                      <p>
                        {callEvent.result.actionDate}:{" "}
                        {OUTREACH_OUTCOMES[callEvent.result.outcome]}
                      </p>
                      <p className={styles.notes}>{callEvent.result.notes}</p>
                      <EventActions
                        event={callEvent}
                        own={
                          saved.canRecord &&
                          callEvent.actorId === saved.viewerId
                        }
                        busy={blocked}
                        run={run}
                      />
                    </>
                  ) : (
                    <p>
                      The save was acknowledged, but its current status has not
                      loaded. Reload saved status; do not record a replacement.
                    </p>
                  )}
                  <button
                    disabled={blocked || !canContinueCall}
                    onClick={() =>
                      advanceCall(saved, callAttempt.result.taskId)
                    }
                  >
                    Continue to next person
                  </button>{" "}
                  <button disabled={busy} onClick={stopCalls}>
                    Return to list
                  </button>
                </div>
              ) : editingTask ? (
                <>
                  {callUnavailable && (
                    <p className={styles.warning}>
                      This assignment or its saved status changed. New outcomes
                      are paused. Return to the list to review; no replacement
                      action will be submitted.
                    </p>
                  )}
                  <OutcomeForm
                    key={editingTask.id}
                    task={editingTask}
                    saved={saved}
                    busy={blocked}
                    unavailable={callUnavailable}
                    onSave={record}
                    onCancel={stopCalls}
                    guided
                  />
                </>
              ) : callQueue.length > 0 ? (
                <div role="status">
                  <h3 ref={callFocusRef} tabIndex={-1}>
                    More people are ready
                  </h3>
                  <p>Saved assignments have changed. Continue when ready.</p>
                  <button
                    disabled={blocked || !!settingsError || !!identity.error}
                    onClick={() => setEditing(callQueue[0].id)}
                  >
                    Start next available call
                  </button>{" "}
                  <button disabled={busy} onClick={stopCalls}>
                    Return to list
                  </button>
                </div>
              ) : (
                <div role="status">
                  <h3 ref={callFocusRef} tabIndex={-1}>
                    No more people ready in this session
                  </h3>
                  <p>
                    Future follow-ups and any saved NXT paperwork remain in the
                    list. Nothing was marked complete automatically.
                  </p>
                  <button onClick={stopCalls}>Return to list</button>
                </div>
              )}
            </section>
          ) : (
            <>
              <ProjectOutreachProgress
                saved={saved}
                people={people}
                busy={blocked || !!editing}
                onSelect={selectProgress}
              />
              <div className={styles.metrics}>
                {[
                  ["Assigned", counts.assigned],
                  ["Attempted", counts.attempted],
                  ["Reached", counts.reached],
                  ["Follow-up", counts.followUp],
                  ["Outreach complete", counts.complete],
                  ["NXT not confirmed", counts.pendingNxt],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className={styles.tools}>
                <label>
                  Queue
                  <select
                    value={effectiveScope}
                    onChange={(e) => {
                      clearProgress();
                      setScope(e.target.value);
                      setPage(0);
                      setSelected([]);
                      setConfirm(false);
                    }}
                  >
                    <option value="mine">My outreach</option>
                    <option value="all">Project overview</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(e) => {
                      clearProgress();
                      setStatus(e.target.value);
                      setPage(0);
                      setSelected([]);
                      setConfirm(false);
                    }}
                  >
                    {[
                      ["open", "Open outreach"],
                      ["all", "All people"],
                      ["unassigned", "Unassigned"],
                      ["follow_up", "Follow-up needed"],
                      ["complete", "Outreach complete"],
                      ["attention", "Needs attention"],
                    ].map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Find a person or caller
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      clearProgress();
                      setSearch(e.target.value);
                      setPage(0);
                      setSelected([]);
                      setConfirm(false);
                    }}
                  />
                </label>
              </div>
              {saved.canManage && progressFocus && (
                <section
                  className={styles.progressFocus}
                  aria-label="Focused outreach list"
                >
                  <h3 ref={progressHeading} tabIndex={-1}>
                    {progressFocus.label}
                  </h3>
                  <p>
                    {visible.length} matching {visible.length === 1 ? "person" : "people"}. This uses saved outreach,
                    not a live NXT check.
                  </p>
                  <button
                    disabled={busy || !!editing}
                    onClick={() => clearProgress(true)}
                  >
                    Back to previous view
                  </button>
                </section>
              )}
              {saved.canManage && (
                <div className={styles.assignment}>
                  <div className={styles.tools}>
                    <button
                      disabled={blocked}
                      onClick={() => {
                        setSelected(
                          visible
                            .filter(selectable)
                            .slice(0, 100)
                            .map((p) => p.constituentId),
                        );
                        setConfirm(false);
                      }}
                    >
                      Select up to 100 matching people
                    </button>
                    <button
                      disabled={blocked || !selected.length}
                      onClick={() => {
                        setSelected([]);
                        setConfirm(false);
                      }}
                    >
                      Clear selection
                    </button>
                    <span>{selected.length} selected</span>
                    <label>
                      Assign caller
                      <select
                        value={assignee}
                        disabled={blocked}
                        onChange={(e) => {
                          setAssignee(e.target.value);
                          setConfirm(false);
                        }}
                      >
                        <option value="">Choose a project member</option>
                        {saved.callers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Assignment due date
                      <input
                        type="date"
                        value={dueDate || saved.settings.deadline}
                        disabled={blocked}
                        onChange={(e) => {
                          setDueDate(e.target.value);
                          setConfirm(false);
                        }}
                      />
                    </label>
                    <button
                      className={styles.primary}
                      disabled={
                        blocked ||
                        !selected.length ||
                        !assignee ||
                        !!settingsError
                      }
                      onClick={() => setConfirm(true)}
                    >
                      Review assignments
                    </button>
                  </div>
                  {confirm && (
                    <div className={styles.confirm}>
                      <p>
                        Assign {selected.length} people to{" "}
                        <strong>
                          {
                            saved.callers.find((u) => String(u.id) === assignee)
                              ?.name
                          }
                        </strong>
                        , due {dueDate || saved.settings.deadline}?{" "}
                        {selected.filter((id) => tasksById.has(id)).length}{" "}
                        existing assignments will be updated. Previous outcomes
                        remain saved. No NXT portfolios or custom fields will
                        change.
                      </p>
                      <button
                        className={styles.primary}
                        disabled={blocked || !selected.length}
                        onClick={() =>
                          run({
                            operation: "assign",
                            people: selected.map((id) => ({
                              constituentId: id,
                              version: tasksById.get(id)?.version || 0,
                            })),
                            assigneeId: Number(assignee),
                            dueDate: dueDate || saved.settings.deadline,
                            settingsVersion: saved.settingsVersion,
                            snapshotAt: saved.snapshotAt,
                          })
                        }
                      >
                        Confirm assignments
                      </button>{" "}
                      <button
                        disabled={blocked}
                        onClick={() => setConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
              {editingTask && (
                <OutcomeForm
                  key={editingTask.id}
                  task={editingTask}
                  saved={saved}
                  busy={blocked}
                  onSave={record}
                  onCancel={() => setEditing(null)}
                />
              )}
              <p className={styles.help}>
                {visible.length} people shown. Contact details are from the
                saved query. Check current NXT contact preferences before
                calling; blank or missing restriction columns are not proof of
                permission.
              </p>
              <div className={styles.list}>
                {visible
                  .slice(currentPage * 25, (currentPage + 1) * 25)
                  .map((person) => {
                    const task = person.task,
                      overlap = (saved.overlaps || []).find(
                        (o) => o.constituent_id === person.constituentId,
                      );
                    return (
                      <article
                        key={person.constituentId}
                        className={styles.person}
                      >
                        <div className={styles.heading}>
                          <div className={styles.identity}>
                            {saved.canManage && (
                              <input
                                type="checkbox"
                                aria-label={`Select ${person.name}`}
                                disabled={
                                  blocked ||
                                  !selectable(person) ||
                                  (!selected.includes(person.constituentId) &&
                                    selected.length >= 100)
                                }
                                checked={selected.includes(
                                  person.constituentId,
                                )}
                                onChange={(e) => {
                                  setSelected((current) =>
                                    e.target.checked
                                      ? [...current, person.constituentId]
                                      : current.filter(
                                          (id) => id !== person.constituentId,
                                        ),
                                  );
                                  setConfirm(false);
                                }}
                              />
                            )}
                            <div>
                              <h3>{person.name}</h3>
                              <small>System ID {person.constituentId}</small>
                            </div>
                          </div>
                          <span>
                            {task ? stageLabel[task.stage] : "Unassigned"}
                          </span>
                        </div>
                        <p>
                          {person.phones.length
                            ? person.phones.join(" / ")
                            : "No phone number in the saved query."}
                        </p>
                        {person.restrictions.length > 0 && (
                          <p className={styles.warning}>
                            Review contact restrictions:{" "}
                            {person.restrictions.join(" / ")}
                          </p>
                        )}
                        <PledgeContext context={person.pledgeContext} />
                        {overlap && (
                          <p className={styles.help}>
                            Also has open outreach in {overlap.count} other
                            project(s) you can access. Coordinate before
                            calling.
                          </p>
                        )}
                        {task && (
                          <p>
                            {task.assigneeName}{" "}
                            <span aria-hidden="true">/</span> Due {task.dueDate}
                            {task.dueDate < saved.today &&
                            task.stage !== "complete"
                              ? " / Overdue"
                              : ""}
                          </p>
                        )}
                        {task && !task.inCurrentQuery && (
                          <p className={styles.warning}>
                            No longer in the latest saved query, or identity
                            mapping needs review. New outcomes are paused;
                            existing history is kept.
                          </p>
                        )}
                        {task && !task.assigneeAvailable && (
                          <p className={styles.warning}>
                            Caller is inactive or no longer has project access.
                            A manager should review this assignment.
                          </p>
                        )}
                        <div className={styles.tools}>
                          <a
                            href={buildBlackbaudConstituentProfileUrl(
                              person.constituentId,
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open NXT record
                          </a>
                          {task?.assigneeId === saved.viewerId &&
                            saved.canRecord && (
                              <button
                                disabled={
                                  blocked ||
                                  !task.inCurrentQuery ||
                                  !!settingsError ||
                                  !!editing
                                }
                                onClick={(event) => {
                                  outcomeOpener.current = event.currentTarget;
                                  setEditing(task.id);
                                }}
                              >
                                Record outcome
                              </button>
                            )}
                        </div>
                        {task?.events.length > 0 && (
                          <details>
                            <summary>
                              {task.events.length} recorded outcome(s)
                            </summary>
                            {task.events.map((event) => (
                              <div key={event.id} className={styles.event}>
                                <strong>
                                  {event.result.actionDate}:{" "}
                                  {OUTREACH_OUTCOMES[event.result.outcome]}
                                </strong>
                                <p>{event.actorName}</p>
                                <p className={styles.notes}>
                                  {event.result.notes}
                                </p>
                                {event.result.nextDate && (
                                  <p>Follow-up date: {event.result.nextDate}</p>
                                )}
                                <EventActions
                                  event={event}
                                  own={
                                    saved.canRecord &&
                                    event.actorId === saved.viewerId
                                  }
                                  busy={blocked}
                                  run={run}
                                />
                              </div>
                            ))}
                          </details>
                        )}
                      </article>
                    );
                  })}
              </div>
              {!visible.length && (
                <p>
                  No people match this queue. Try All people, or ask a project
                  manager to assign outreach to you.
                </p>
              )}
              {pages > 1 && (
                <nav className={styles.tools} aria-label="Outreach pages">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentPage + 1} of {pages}
                  </span>
                  <button
                    disabled={currentPage + 1 === pages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
