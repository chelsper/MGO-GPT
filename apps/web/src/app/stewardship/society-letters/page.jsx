"use client";
import { useEffect, useRef, useState } from "react";
import {
  LETTER_BATCH_LIMIT,
  LETTER_COLUMNS,
  GROUPED_LETTER_COLUMNS,
  GROUPED_LETTER_LABELS,
  CONSTITUENT_LETTER_COLUMNS,
  CONSTITUENT_LETTER_LABELS,
  isLetterPreviewSource,
  normalizeLetterMergeSettings,
} from "@/utils/societyLetters";
import SocietyQueryEditors, { sourceForSociety } from "./SocietyQueryEditors";
import LetterMergeFieldsEditor from "./LetterMergeFieldsEditor";
import SavedLetterPreview, { savedTemplateUrl } from "./SavedLetterPreview";
import LetterExclusionDialog from "./LetterExclusionDialog";
import ExclusionAppealSettings, {
  ExclusionSyncStatus,
} from "./ExclusionAppealSettings";
import LetterRecipientDialog from "./LetterRecipientDialog";
import RecipientReviewQueue from "./RecipientReviewQueue";
import LetterReadinessPanel, { readinessLabels } from "./LetterReadinessPanel";
import QueryColumnMapper from "./QueryColumnMapper";
import WorkflowReturnLink from "@/components/WorkflowReturnLink";

const endpoint = "/api/stewardship/society-letters";
const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-emerald-700 !bg-emerald-700 !text-white`;
const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900";
const card = "rounded-2xl border border-gray-200 bg-white p-5 sm:p-6";
const labels = {
  prepared: "Prepared for postal mail",
  pending_email: "Email queued, not sent",
  sending: "Submission started: verify before any retry",
  emailed: "Email accepted",
  delivered: "Email delivered",
  mailed: "Marked mailed",
  needs_review: "Delivery needs review",
  cancelled: "Cancelled before sending",
};
const defaults = {
  sourceMode: "constituents",
  queryId: "",
  periodBasis: "calendar_year",
  fiscalYearStartMonth: 7,
  startDate: "",
  endDate: "",
  societyKeys: [],
  columns: CONSTITUENT_LETTER_COLUMNS,
};

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BatchConfirmation({ value, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="batch-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl backdrop:bg-gray-900/40"
    >
      <h2 id="batch-confirm-title" className="text-xl font-bold">
        {value.title}
      </h2>
      <p className="my-4 text-gray-600">{value.description}</p>
      <div className="flex gap-3">
        <button autoFocus className={button} disabled={busy} onClick={onCancel}>
          Go back
        </button>
        <button className={primary} disabled={busy} onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </dialog>
  );
}

function TemplateEditor({ template, busy, save, onEdit }) {
  const [file, setFile] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const fileInput = useRef(null),
    subjectInput = useRef(null),
    messageInput = useRef(null);
  const [mergeSettings, setMergeSettings] = useState(() =>
    normalizeLetterMergeSettings(template.mergeSettings),
  );
  const [subject, setSubject] = useState(
    template.subject || "Your {society_name} recognition",
  );
  const [emailBody, setEmailBody] = useState(
    template.emailBody ||
      "Dear {salutation},\n\nPlease find your {society_name} letter attached. Thank you for your support.",
  );
  const [error, setError] = useState("");
  function insertField(target, token) {
    const element =
      target === "subject" ? subjectInput.current : messageInput.current;
    const value = target === "subject" ? subject : emailBody;
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? start;
    const updated = `${value.slice(0, start)}${token}${value.slice(end)}`;
    if (target === "subject") setSubject(updated);
    else setEmailBody(updated);
    onEdit();
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    onEdit();
    if (
      (!file && !template.version) ||
      (file && (!/\.docx$/i.test(file.name) || file.size > 1024 * 1024))
    ) {
      setError("Choose a Word .docx template up to 1 MB.");
      return;
    }
    try {
      const content = file
        ? await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
        : null;
      const result = await save({
        action: "template",
        societyKey: template.societyKey,
        ...(!file ? { existingVersion: template.version } : {}),
        template: {
          ...(file ? { filename: file.name, content } : {}),
          subject,
          emailBody,
          mergeSettings,
        },
      });
      if (result) {
        setFile(null);
        setReplacing(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    } catch {
      setError(
        "The template could not be saved. Check the file and try again.",
      );
    }
  }
  return (
    <form
      onSubmit={submit}
      onChange={onEdit}
      aria-label={`${template.societyName} letter template`}
      className={card}
    >
      <h3 className="text-lg font-bold">{template.societyName}</h3>
      <p className="mt-1 text-sm text-gray-600">
        {template.filename
          ? `Saved: ${template.filename}. New versions do not change already prepared letters.`
          : "No template saved yet."}
      </p>
      {template.version && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Saved and reusable. No need to upload again.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              onClick={() => setPreviewOpen(true)}
            >
              Preview saved letter
            </button>
            <a
              className={`${button} inline-flex items-center`}
              href={savedTemplateUrl(template.version)}
              download={template.filename}
            >
              Download Word file
            </a>
            <button
              type="button"
              className={button}
              disabled={busy || replacing}
              onClick={() => setReplacing(true)}
            >
              Replace Word file
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            Keep the saved Word file to update only its fields, date appearance,
            or email text. Previously prepared letters keep their original
            settings.
          </p>
        </div>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(!template.version || replacing) && (
          <div>
            <label className="text-sm font-semibold">
              {template.version
                ? "Replacement Word template"
                : "Word letter template"}
              <input
                ref={fileInput}
                aria-label={`${template.societyName} Word template`}
                className={input}
                type="file"
                accept=".docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            {template.version && (
              <>
                <p className="mt-2 text-sm text-gray-600">
                  Your saved file stays in place until you save a replacement.
                  Preview always shows the saved version.
                </p>
                <button
                  type="button"
                  className={`${button} mt-2`}
                  onClick={() => {
                    setFile(null);
                    setReplacing(false);
                  }}
                >
                  Keep saved Word file
                </button>
              </>
            )}
          </div>
        )}
        <label className="text-sm font-semibold">
          Email subject
          <input
            ref={subjectInput}
            className={input}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            required
          />
        </label>
      </div>
      <label className="mt-4 block text-sm font-semibold">
        Email cover message
        <textarea
          ref={messageInput}
          className={input}
          rows={4}
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          required
        />
      </label>
      <p className="mt-2 text-xs text-gray-500">
        The personalized Word letter is attached to the email. This does not
        create a reply inbox.
      </p>
      <LetterMergeFieldsEditor
        name={template.societyName}
        value={mergeSettings}
        onChange={(value) => {
          setMergeSettings(value);
          onEdit();
        }}
        onInsert={insertField}
        busy={busy}
      />
      {error && (
        <p role="alert" className="mt-3 text-red-800">
          {error}
        </p>
      )}
      <button disabled={busy} className={`${primary} mt-4`}>
        Save template and field settings
      </button>
      {previewOpen && (
        <SavedLetterPreview
          template={template}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </form>
  );
}

export default function SocietyLettersPage() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [tab, setTab] = useState("ready");
  const [settings, setSettings] = useState(defaults),
    [confirmedSource, setConfirmedSource] = useState(false);
  const [channel, setChannel] = useState("post"),
    [selected, setSelected] = useState([]),
    [search, setSearch] = useState("");
  const [preview, setPreview] = useState(null),
    [confirmation, setConfirmation] = useState(null);
  const [receiptIds, setReceiptIds] = useState({});
  const [societyFilter, setSocietyFilter] = useState("");
  const [templateNotice, setTemplateNotice] = useState("");
  const [excluding, setExcluding] = useState(null);
  const [reviewingRecipient, setReviewingRecipient] = useState(null);
  const [reviewQueue, setReviewQueue] = useState(null);
  const [reviewScope, setReviewScope] = useState("unreviewed");
  const [reviewNotice, setReviewNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false),
    [sendingBatch, setSendingBatch] = useState(null);
  const inFlight = useRef(false);
  function accept(payload) {
    setData(payload);
    setSettings(
      payload.settings || {
        ...defaults,
        societyKeys: payload.definitions.map((d) => d.key),
      },
    );
  }
  async function load() {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      accept(payload);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load stewardship.");
    }
  }
  async function downloadBatch(batchId, deliveryId) {
    setError("");
    try {
      const params = new URLSearchParams({ download: batchId });
      if (deliveryId) params.set("deliveryId", deliveryId);
      const response = await fetch(`${endpoint}?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error((await response.json()).error);
      saveBlob(
        await response.blob(),
        deliveryId ? "society-letter.docx" : "society-letters.zip",
      );
    } catch (err) {
      setError(
        err.message ||
          "The letters could not be downloaded. Saved history is unchanged.",
      );
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function act(body, download = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, revision: data.revision }),
      });
      if (download && response.ok) {
        saveBlob(await response.blob(), "society-letter-preview.docx");
        return;
      }
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "This operation could not finish.");
      if (payload.preview) setPreview(payload.preview);
      else {
        accept(payload);
        setPreview(null);
        setSelected([]);
      }
      return payload;
    } catch (err) {
      setError(err.message);
      setRefreshing(false);
      setSendingBatch(null);
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!refreshing || busy) return;
    if (data?.job?.status !== "running") {
      setRefreshing(false);
      return;
    }
    const timer = setTimeout(
      () => act({ action: "resume", jobId: data.job.id }),
      3000,
    );
    return () => clearTimeout(timer);
  }, [refreshing, busy, data]);
  useEffect(() => {
    if (!sendingBatch || busy) return;
    const batch = data.history.filter((item) => item.batchId === sendingBatch);
    if (
      batch.some((item) => ["needs_review", "sending"].includes(item.status)) ||
      !batch.some((item) => item.status === "pending_email")
    ) {
      setSendingBatch(null);
      return;
    }
    const timer = setTimeout(
      () => act({ action: "send", batchId: sendingBatch, confirm: true }),
      1500,
    );
    return () => clearTimeout(timer);
  }, [sendingBatch, busy, data]);
  const ready = (data?.rows || []).filter((row) => row.status === "ready");
  const householdPreview = isLetterPreviewSource(data?.settings);
  const filtered = ready.filter(
    (row) =>
      (!societyFilter || row.societyKey === societyFilter) &&
      `${row.name} ${row.societyName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const canSelect = (row) =>
    !row.issues[channel] && (channel !== "email" || data.emailEnabled);
  const reviewable = filtered.filter(
    (row) =>
      row.recipientReview?.editable &&
      (reviewScope === "all" || row.recipientReview.status !== "saved"),
  );
  const batches = Object.values(
    (data?.history || []).reduce((groups, item) => {
      (groups[item.batchId] ||= {
        id: item.batchId,
        items: [],
        date: item.preparedAt,
        channel: item.channel,
      }).items.push(item);
      return groups;
    }, {}),
  );
  const tabs = [
    ["ready", "Ready for letters"],
    ["excluded", `Excluded (${data?.exclusions?.length || 0})`],
    ["history", "Letter history"],
    ["templates", "Letter templates"],
    ["settings", "Source & period"],
  ];
  function changeSourceMode(mode, fields) {
    const constituentColumns = Object.fromEntries(
      Object.entries(CONSTITUENT_LETTER_COLUMNS).map(([key, fallback]) => {
        const existing =
          fields ||
          settings.sourceMode === "constituents" ||
          settings.columns?.[key] !== LETTER_COLUMNS[key]
            ? settings.columns?.[key]
            : "";
        const candidate =
          existing || fields?.suggestedColumns?.[key] || fallback;
        return [
          key,
          fields
            ? ["constituentId", "spouseId"].includes(key)
              ? fields.suggestedColumns?.[key] || ""
              : fields.fields.includes(candidate)
                ? candidate
                : fields.suggestedColumns?.[key] || ""
            : candidate,
        ];
      }),
    );
    setConfirmedSource(false);
    setSettings({
      ...settings,
      sourceMode: mode,
      ...(mode === "society_queries"
        ? {
            societySources: settings.societyKeys.map((key) =>
              sourceForSociety(settings, key),
            ),
          }
        : {}),
      columns:
        mode === "constituents" ? constituentColumns : GROUPED_LETTER_COLUMNS,
    });
  }
  async function confirmAction() {
    const action = confirmation;
    setConfirmation(null);
    if (action.action === "send") {
      const result = await act({ ...action, confirm: true });
      if (
        result &&
        !result.history.some(
          (item) =>
            item.batchId === action.batchId &&
            ["needs_review", "sending"].includes(item.status),
        )
      )
        setSendingBatch(action.batchId);
    } else {
      const result = await act({ ...action, confirm: true });
      if (action.action === "restart" && result?.job?.status === "running")
        setRefreshing(true);
    }
  }
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-gray-900 sm:px-8">
      <WorkflowReturnLink href="/stewardship" />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Stewardship
          </p>
          <h1 className="mt-2 text-3xl font-bold">Society Letter Creation</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            One household. Its highest qualifying letter. A shared history that
            prevents repeat acknowledgments within the same period.
          </p>
        </div>
        {data?.settings && (
          <button
            className={button}
            disabled={busy || refreshing || !!sendingBatch}
            onClick={async () => {
              const action =
                data.job?.status === "running" ? "resume" : "refresh";
              const result = await act({ action, jobId: data.job?.id });
              if (result?.job?.status === "running") setRefreshing(true);
            }}
          >
            {refreshing
              ? "Refreshing membership..."
              : data.job?.status === "running"
                ? "Resume membership refresh"
                : "Refresh membership"}
          </button>
        )}
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
        >
          {error}
          <button className="ml-3 underline" disabled={busy} onClick={load}>
            Reload saved results
          </button>
        </div>
      )}
      {!data && !error && (
        <p role="status">Loading saved stewardship records...</p>
      )}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                householdPreview
                  ? "Households to review"
                  : "Ready for a new letter",
                ready.length,
              ],
              [
                "Already covered this period",
                data.rows.filter((r) => r.status === "covered").length,
              ],
              [
                "Prepared or awaiting verification",
                data.rows.filter((r) => r.status === "held").length,
              ],
            ].map(([label, count]) => (
              <div className={card} key={label}>
                <p className="text-sm text-gray-600">{label}</p>
                <p className="mt-2 text-3xl font-bold">{count}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
            <p>
              {data.period
                ? `${data.period.start} through ${data.period.end}`
                : "Choose a qualification period to begin."}
            </p>
            <p>
              {data.refreshedAt
                ? `Membership checked ${new Date(data.refreshedAt).toLocaleString()}`
                : "No household membership loaded yet."}
            </p>
          </div>
          <nav
            aria-label="Society letter workspace"
            className="flex flex-wrap gap-2"
          >
            {tabs.map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? primary : button}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "ready" && (
            <>
              <ExclusionAppealSettings
                key={`${data.period?.key}/${data.exclusionAppeals?.policy?.savedAt || "new"}`}
                data={data}
                busy={busy || refreshing || !!sendingBatch}
                act={act}
              />
              <LetterReadinessPanel
                data={data}
                channel={channel}
                rows={filtered}
                busy={busy}
                blocked={
                  refreshing ||
                  !!sendingBatch ||
                  !!reviewingRecipient ||
                  !!reviewQueue ||
                  !!excluding ||
                  !!confirmation
                }
                act={act}
              />
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <h2 className="font-bold text-emerald-950">
                  Your letter holding list
                </h2>
                <p className="mt-1 text-sm text-emerald-950">
                  After you load membership, recipients stay here while you
                  prepare. Opening or leaving this page never sends letters or
                  marks them sent. Exclude a recipient for this period if you do
                  not want them to receive a letter; restore them later from
                  Excluded.
                </p>
                {householdPreview && (
                  <p className="mt-2 text-sm text-emerald-950">
                    You can organize this list now. Delivery checks are still
                    required before these recipients can receive letters.
                  </p>
                )}
              </section>
              {data.sourceIssue && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p>{data.sourceIssue}</p>
                  {(!data.settings || !data.refreshedAt) && (
                    <button
                      className={`${button} mt-3`}
                      onClick={() => setTab("settings")}
                    >
                      Set up membership source
                    </button>
                  )}
                </div>
              )}
              {data.job && data.job.status !== "complete" && (
                <div className="space-y-2">
                  <p role="status" className="text-sm text-gray-600">
                    {data.job.message ||
                      "NXT is preparing the household query."}{" "}
                    Saved letter history is unchanged.
                  </p>
                  {!refreshing && (
                    <button
                      className={button}
                      disabled={busy || !!sendingBatch}
                      onClick={() =>
                        setConfirmation({
                          action: "restart",
                          title: "Restart the unfinished membership query?",
                          description:
                            "This starts one new read-only NXT query with your connected account. The earlier query result will not be used. Prepared letters, sent history, and saved membership remain unchanged until valid results arrive.",
                        })
                      }
                    >
                      Restart unfinished query
                    </button>
                  )}
                </div>
              )}
              <section className={card}>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-sm font-semibold">
                    Find a household
                    <input
                      className={input}
                      type="search"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setSelected([]);
                        setPreview(null);
                      }}
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Society letter
                    <select
                      className={input}
                      value={societyFilter}
                      onChange={(e) => {
                        setSocietyFilter(e.target.value);
                        setSelected([]);
                        setPreview(null);
                      }}
                    >
                      <option value="">All societies</option>
                      {data.definitions.map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Delivery method
                    <select
                      className={input}
                      value={channel}
                      onChange={(e) => {
                        setChannel(e.target.value);
                        setSelected([]);
                        setPreview(null);
                      }}
                    >
                      <option value="post">Postal letters</option>
                      <option value="email">
                        Email with letter attachment
                      </option>
                    </select>
                  </label>
                </div>
                {channel === "email" && !data.emailEnabled && (
                  <p className="mt-3 text-sm text-amber-900">
                    Email delivery is off for this environment until the
                    household source and templates are verified. Postal
                    preparation is available after setup.
                  </p>
                )}
                {filtered.some((row) => row.recipientReview) && (
                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-sm font-semibold">
                        Recipient review
                        <select
                          className={input}
                          value={reviewScope}
                          onChange={(event) =>
                            setReviewScope(event.target.value)
                          }
                        >
                          <option value="unreviewed">
                            Needs recipient review
                          </option>
                          <option value="all">All editable recipients</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className={primary}
                        disabled={
                          busy ||
                          refreshing ||
                          !!sendingBatch ||
                          !reviewable.length
                        }
                        onClick={() => {
                          setError("");
                          setReviewNotice("");
                          setReviewQueue(
                            reviewable.slice(0, LETTER_BATCH_LIMIT),
                          );
                        }}
                      >
                        Review recipients in bulk
                      </button>
                      <span className="pb-3 text-sm text-emerald-900">
                        {reviewable.length} available in this view
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">
                      Review up to {LETTER_BATCH_LIMIT} recipients at a time.
                      Preview each personalized letter, make individual edits,
                      and save before moving to the next. Nothing is sent or
                      marked ready for delivery.
                    </p>
                  </div>
                )}
                {reviewNotice && (
                  <p
                    role="status"
                    className="my-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
                  >
                    {reviewNotice}
                  </p>
                )}
                <div className="my-4 flex flex-wrap items-center gap-3">
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      setSelected(
                        filtered
                          .filter(canSelect)
                          .slice(0, LETTER_BATCH_LIMIT)
                          .map((r) => r.householdId),
                      );
                      setPreview(null);
                    }}
                  >
                    Select ready households (up to {LETTER_BATCH_LIMIT})
                  </button>
                  <button
                    className={button}
                    disabled={!selected.length || busy}
                    onClick={() => {
                      setSelected([]);
                      setPreview(null);
                    }}
                  >
                    Clear selection
                  </button>
                  <span className="text-sm">{selected.length} selected</span>
                  <button
                    className={primary}
                    disabled={busy || !selected.length}
                    onClick={() =>
                      act({
                        action: "preview",
                        channel,
                        householdIds: selected,
                      })
                    }
                  >
                    Review selected letters
                  </button>
                </div>
                <p className="mb-4 text-sm text-gray-500">
                  Small batches protect against timeouts. Sending a higher
                  letter covers the lower tiers; those lower letters are not
                  sent.
                </p>
                {!filtered.length ? (
                  <p className="py-8 text-gray-600">
                    {data.refreshedAt
                      ? "No new households match this view. Completed acknowledgments are in Letter history."
                      : "Configure and refresh your household query to see eligible recipients."}
                  </p>
                ) : (
                  <div className="max-h-[600px] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>
                          {[
                            "Select",
                            "Household",
                            "Letter",
                            "Recipient / eligibility",
                            "Holding list",
                          ].map((h) => (
                            <th key={h} className="p-3">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((row) => (
                          <tr
                            key={row.householdId}
                            className="border-t border-gray-100"
                          >
                            <td className="p-3">
                              <input
                                aria-label={`Select ${row.name}`}
                                type="checkbox"
                                checked={selected.includes(row.householdId)}
                                disabled={
                                  busy ||
                                  !canSelect(row) ||
                                  (!selected.includes(row.householdId) &&
                                    selected.length >= LETTER_BATCH_LIMIT)
                                }
                                onChange={(e) => {
                                  setPreview(null);
                                  setSelected(
                                    e.target.checked
                                      ? [...selected, row.householdId]
                                      : selected.filter(
                                          (id) => id !== row.householdId,
                                        ),
                                  );
                                }}
                              />
                            </td>
                            <td className="p-3">
                              <p className="font-semibold">{row.name}</p>
                              {row.members?.length > 0 && (
                                <p className="mt-1 text-xs text-gray-500">
                                  Member system IDs: {row.members.join(", ")}
                                </p>
                              )}
                              {row.membersOutsideQuery?.length > 0 && (
                                <p className="mt-1 text-xs text-gray-500">
                                  Spouse outside query:{" "}
                                  {row.membersOutsideQuery.join(", ")}.
                                  Membership and contact restrictions still need
                                  verification.
                                </p>
                              )}
                              <p className="mt-1 text-xs text-gray-500">
                                {row.reason}
                              </p>
                            </td>
                            <td className="p-3">
                              <p className="font-semibold">{row.societyName}</p>
                              {row.sourceQueries && (
                                <>
                                  <p className="mt-1 text-xs text-gray-500">
                                    Highest match in the configured queries. Not
                                    yet cleared for delivery.
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    Also matched:{" "}
                                    {row.qualifiedKeys
                                      .filter((key) => key !== row.societyKey)
                                      .map(
                                        (key) =>
                                          data.definitions.find(
                                            (d) => d.key === key,
                                          )?.name || key,
                                      )
                                      .join(", ") || "No lower society query"}
                                  </p>
                                </>
                              )}
                            </td>
                            <td className="whitespace-pre-line p-3">
                              {row.recipientCandidates ? (
                                <>
                                  {row.readiness?.[channel] && (
                                    <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm">
                                      <p className="font-semibold">
                                        {
                                          readinessLabels[
                                            row.readiness[channel].status
                                          ]
                                        }
                                      </p>
                                      {row.readiness[channel].reasons.map(
                                        (reason) => (
                                          <p
                                            className="mt-1 text-gray-600"
                                            key={reason}
                                          >
                                            {reason}
                                          </p>
                                        ),
                                      )}
                                    </div>
                                  )}
                                  <p className="mb-2 text-sm font-semibold text-gray-700">
                                    {row.recipientReview?.status === "saved"
                                      ? "Recipient choices saved"
                                      : row.recipientReview?.status ===
                                          "needs_review"
                                        ? "Recipient choices need review"
                                        : "Choose letter recipient"}
                                  </p>
                                  {row.recipientReview?.status === "saved" && (
                                    <div className="mb-3 text-sm text-gray-600">
                                      <p>{row.addressee}</p>
                                      <p>
                                        {row.address ||
                                          "No mailing address selected"}
                                      </p>
                                      <p>Salutation: {row.salutation}</p>
                                      <p className="mt-1 text-xs">
                                        Saved for this period. No letter has
                                        been sent.
                                      </p>
                                    </div>
                                  )}
                                  <button
                                    className={`${button} mb-3`}
                                    disabled={
                                      busy ||
                                      refreshing ||
                                      !!sendingBatch ||
                                      !row.recipientReview?.editable
                                    }
                                    aria-label={`Review letter recipient for ${row.name}`}
                                    onClick={() => {
                                      setError("");
                                      setReviewingRecipient(row);
                                    }}
                                  >
                                    {row.recipientReview?.status === "saved"
                                      ? "Edit recipient choices"
                                      : "Review letter recipient"}
                                  </button>
                                  <details>
                                    <summary className="cursor-pointer font-semibold text-emerald-800">
                                      Review address and salutation options
                                    </summary>
                                    <p className="mt-2 text-xs text-gray-500">
                                      Returned query details. A primary
                                      addressee may address only one spouse; use
                                      recipient review to save joint wording.
                                    </p>
                                    {row.recipientCandidates.map(
                                      (candidate) => (
                                        <div
                                          key={candidate.constituentId}
                                          className="mt-3 rounded-lg border border-gray-200 p-3"
                                        >
                                          <p className="font-semibold">
                                            {candidate.addressee ||
                                              "No addressee returned"}
                                          </p>
                                          <p>
                                            Salutation:{" "}
                                            {candidate.salutation ||
                                              "Not returned"}
                                          </p>
                                          <p>
                                            {candidate.address ||
                                              "No address returned"}
                                          </p>
                                          {candidate.emailCandidates?.length >
                                          1 ? (
                                            <div className="mt-2 text-sm">
                                              <p className="font-semibold">
                                                Multiple email values: choose
                                                during recipient review
                                              </p>
                                              <ul className="list-inside list-disc">
                                                {candidate.emailCandidates.map(
                                                  (email) => (
                                                    <li key={email}>{email}</li>
                                                  ),
                                                )}
                                              </ul>
                                              <p className="text-xs text-gray-500">
                                                No email was selected
                                                automatically. Mailing details
                                                are retained separately.
                                              </p>
                                            </div>
                                          ) : (
                                            <p>{candidate.email}</p>
                                          )}
                                          <p className="text-xs text-gray-500">
                                            From constituent{" "}
                                            {candidate.constituentId}
                                          </p>
                                        </div>
                                      ),
                                    )}
                                  </details>
                                </>
                              ) : (
                                row.issues[channel] ||
                                (channel === "email" ? row.email : row.address)
                              )}
                            </td>
                            <td className="p-3">
                              <button
                                className={button}
                                disabled={busy || refreshing || !!sendingBatch}
                                onClick={() => {
                                  setError("");
                                  setExcluding({
                                    ...row,
                                    period: row.period || data.period,
                                  });
                                }}
                                aria-label={`Exclude ${row.name} for this period`}
                              >
                                Exclude for this period
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              {preview && (
                <section
                  className="rounded-2xl border-2 border-emerald-700 bg-white p-6"
                  aria-label="Review letter batch"
                >
                  <h2 className="text-xl font-bold">
                    Review {preview.rows.length}{" "}
                    {preview.channel === "email" ? "email" : "postal"} letters
                  </h2>
                  <p className="mt-2 text-gray-600">
                    Review the generated Word letters before proceeding.
                    Preparing reserves these households; it does not mark them
                    sent.
                  </p>
                  <ul className="my-4 max-h-96 space-y-3 overflow-auto">
                    {preview.rows.map((row) => (
                      <li
                        key={row.householdId}
                        className="rounded-xl border p-4"
                      >
                        <p className="font-bold">
                          {row.name} / {row.societyName}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm">
                          {row.addressee}
                          {"\n"}
                          {preview.channel === "email"
                            ? row.email
                            : row.address}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Template: {row.templateFilename}
                        </p>
                        {preview.channel === "email" && (
                          <details className="mt-2 text-sm">
                            <summary>Email cover message</summary>
                            <p className="mt-2 font-semibold">{row.subject}</p>
                            <p className="whitespace-pre-line">
                              {row.coverMessage}
                            </p>
                          </details>
                        )}
                        <button
                          className={`${button} mt-3`}
                          disabled={busy}
                          onClick={() =>
                            act(
                              {
                                action: "preview_document",
                                channel: preview.channel,
                                householdId: row.householdId,
                              },
                              true,
                            )
                          }
                        >
                          Download letter preview
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    className={primary}
                    disabled={busy}
                    onClick={async () => {
                      const result = await act({
                        action: "prepare",
                        householdIds: preview.rows.map((r) => r.householdId),
                        channel: preview.channel,
                        previewToken: preview.token,
                        confirm: true,
                      });
                      if (result) setTab("history");
                    }}
                  >
                    Confirm recipients and prepare batch
                  </button>
                </section>
              )}
            </>
          )}
          {tab === "history" && (
            <section className="space-y-4">
              <p className="text-sm text-gray-600">
                Prepared is not sent. Mark postal batches mailed only after
                dispatch. An uncertain email stays protected against duplicate
                sending.
              </p>
              {!batches.length && (
                <div className={card}>No letter batches yet.</div>
              )}
              {batches.map((batch) => (
                <article className={card} key={batch.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">
                        {batch.items.length}{" "}
                        {batch.channel === "post"
                          ? "postal letters"
                          : "email letters"}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Prepared {new Date(batch.date).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {batch.channel === "post" &&
                        batch.items.some((i) => i.status !== "cancelled") && (
                          <button
                            className={button}
                            onClick={() => downloadBatch(batch.id)}
                          >
                            Download Word letters (.zip)
                          </button>
                        )}
                      {batch.channel === "post" &&
                        batch.items.some((i) => i.status === "prepared") && (
                          <button
                            className={primary}
                            disabled={busy}
                            onClick={() =>
                              setConfirmation({
                                action: "mailed",
                                batchId: batch.id,
                                title: "Confirm these letters have been mailed",
                                description:
                                  "This records the prepared postal letters as mailed and covers their lower society tiers for the same period.",
                              })
                            }
                          >
                            Mark batch mailed
                          </button>
                        )}
                      {batch.items.some(
                        (i) => i.status === "pending_email",
                      ) && (
                        <button
                          className={primary}
                          disabled={
                            busy || !!sendingBatch || !data.emailEnabled
                          }
                          onClick={() =>
                            setConfirmation({
                              action: "send",
                              batchId: batch.id,
                              title: "Send the remaining queued emails?",
                              description:
                                "This sends the prepared letters to the listed households, three at a time. Already submitted emails will not be sent again.",
                            })
                          }
                        >
                          {sendingBatch === batch.id
                            ? "Sending..."
                            : "Send queued emails"}
                        </button>
                      )}
                      {batch.items.some((i) =>
                        ["prepared", "pending_email"].includes(i.status),
                      ) && (
                        <button
                          className={button}
                          disabled={busy || !!sendingBatch}
                          onClick={() =>
                            setConfirmation({
                              action: "cancel",
                              batchId: batch.id,
                              title: "Cancel the remaining unsent letters?",
                              description:
                                "Confirm the queued or prepared letters have not been sent or mailed. Only their reservations will be released. Submitted and uncertain emails remain protected, and history is retained.",
                            })
                          }
                        >
                          Cancel unsent letters
                        </button>
                      )}
                    </div>
                  </div>
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Recipients and acknowledgment coverage
                    </summary>
                    <ul className="mt-3 space-y-3">
                      {batch.items.map((item) => (
                        <li key={item.id} className="border-t pt-3 text-sm">
                          <p>
                            <strong>{item.name}</strong> / {item.societyName} /{" "}
                            {labels[item.status]}
                          </p>
                          <p className="mt-1 text-gray-500">
                            {item.period.start} through {item.period.end}.{" "}
                            {item.channel === "email"
                              ? item.email
                              : item.addressee}
                          </p>
                          {item.updatedAt && (
                            <p className="mt-1 text-gray-500">
                              Status recorded{" "}
                              {new Date(item.updatedAt).toLocaleString()}
                            </p>
                          )}
                          <p className="mt-1 text-gray-500">
                            Lower-tier letters covered after sending:{" "}
                            {item.coveredKeys
                              .slice(1)
                              .map(
                                (k) =>
                                  data.definitions.find((d) => d.key === k)
                                    ?.name || k,
                              )
                              .join(", ") || "None"}
                            . No extra letters sent.
                          </p>
                          {item.providerId &&
                            ["emailed", "needs_review"].includes(
                              item.status,
                            ) && (
                              <button
                                className={`${button} mt-2`}
                                disabled={busy}
                                onClick={() =>
                                  act({ action: "verify", deliveryId: item.id })
                                }
                              >
                                Check email delivery
                              </button>
                            )}
                          {item.channel === "post" &&
                            item.status !== "cancelled" && (
                              <button
                                className={`${button} mt-2`}
                                onClick={() => downloadBatch(batch.id, item.id)}
                              >
                                Download this Word letter
                              </button>
                            )}
                          {item.channel === "email" &&
                            !item.providerId &&
                            ["sending", "needs_review"].includes(
                              item.status,
                            ) && (
                              <form
                                className="mt-3 max-w-lg"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  act({
                                    action: "verify",
                                    deliveryId: item.id,
                                    providerId: receiptIds[item.id] || "",
                                  });
                                }}
                              >
                                <p className="text-amber-900">
                                  Check the sender's Resend log for this letter.
                                  Verification will match its recipient and
                                  saved letter tag; no email is resent.
                                </p>
                                <label className="mt-2 block font-semibold">
                                  Existing Resend email ID
                                  <input
                                    className={input}
                                    value={receiptIds[item.id] || ""}
                                    onChange={(e) =>
                                      setReceiptIds({
                                        ...receiptIds,
                                        [item.id]: e.target.value,
                                      })
                                    }
                                    required
                                  />
                                </label>
                                <button
                                  className={`${button} mt-2`}
                                  disabled={busy}
                                >
                                  Verify existing email
                                </button>
                              </form>
                            )}
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
            </section>
          )}
          {tab === "templates" && (
            <section className="space-y-4">
              <div className={card}>
                <h2 className="text-xl font-bold">
                  Personalized society letters
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Saved letters stay here for future batches. Preview or
                  download a saved letter, or choose Replace Word file to update
                  it. Upload one Word (.docx) template per society, up to 1 MB.
                  Use the fields below in the letter or email cover message.
                  Keep logos embedded, not linked to external files. Word
                  formatting is retained; PDF conversion is not included. You
                  can save each annual society's template before its query is
                  ready. Saving a template never sends letters.
                </p>
                <p className="mt-3 text-sm font-semibold text-emerald-800">
                  Choose and save reusable merge fields in each society's
                  template below.
                </p>
              </div>
              {!data.templates.length && (
                <p>
                  Add active annual societies in Organization Settings first.
                </p>
              )}
              {templateNotice && (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                >
                  {templateNotice}
                </p>
              )}
              {data.templates.map((template) => (
                <TemplateEditor
                  key={`${template.societyKey}:${template.version}`}
                  template={template}
                  busy={busy}
                  onEdit={() => setTemplateNotice("")}
                  save={async (body) => {
                    const result = await act(body);
                    if (result)
                      setTemplateNotice(
                        `${template.societyName}: Template and merge-field settings saved. No letters were sent.`,
                      );
                    return result;
                  }}
                />
              ))}
            </section>
          )}
          {tab === "excluded" && (
            <section className={card} aria-label="Excluded recipients">
              <h2 className="text-xl font-bold">
                Not receiving letters this period
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Exclusions survive query refreshes and cover all society levels
                for the individual or household. Restoring does not send
                anything; recipients reappear only if they remain in the current
                membership list and are not already covered or prepared.
              </p>
              <div className="mt-4">
                <ExclusionAppealSettings
                  key={`${data.period?.key}/${data.exclusionAppeals?.policy?.savedAt || "new"}`}
                  data={data}
                  busy={busy || refreshing || !!sendingBatch}
                  act={act}
                />
              </div>
              {!(data.exclusions || []).length && (
                <p className="mt-5 text-gray-600">
                  No recipients excluded for this period.
                </p>
              )}
              {(data.exclusions || []).map((item) => (
                <div
                  key={item.id}
                  className="mt-4 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-gray-200 p-4"
                >
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {item.period.start} through {item.period.end}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {item.reason || "No reason recorded."}
                    </p>
                    <ExclusionSyncStatus
                      item={item}
                      busy={busy || refreshing || !!sendingBatch}
                      act={act}
                    />
                  </div>
                  <button
                    className={button}
                    disabled={busy || refreshing || !!sendingBatch}
                    aria-label={`Restore ${item.name}`}
                    onClick={() =>
                      act({ action: "restore_recipient", exclusionId: item.id })
                    }
                  >
                    {item.nxt
                      ? "Verify NXT removal and restore"
                      : "Restore to holding list"}
                  </button>
                </div>
              ))}
            </section>
          )}
          {tab === "settings" && (
            <form
              className={card}
              onChange={(event) => {
                if (event.target.name !== "confirmedSource")
                  setConfirmedSource(false);
              }}
              onSubmit={async (event) => {
                event.preventDefault();
                const result = await act({
                  action: "settings",
                  settings: { ...settings, confirmSource: confirmedSource },
                });
                if (result) setConfirmedSource(false);
              }}
            >
              <h2 className="text-xl font-bold">
                Household source and qualification period
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Use a saved NXT qualification query, not portfolio summaries.
                The app can group constituent and spouse system IDs; NXT does
                not need to household the query. Names and addresses are never
                used to guess a relationship, and individual gift totals are not
                added together.
              </p>
              {(!settings.sourceMode ||
                settings.sourceMode === "households") && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="font-bold">
                    Does your query return people and spouse IDs?
                  </h3>
                  <p className="mt-1 text-sm">
                    The form below is for queries already grouped into
                    households. For a normal constituent query, switch formats
                    instead of trying to supply Household ID, Member IDs, or
                    permission columns. Individuals without a spouse are
                    included too.
                  </p>
                  <button
                    type="button"
                    className={`${button} mt-3`}
                    onClick={() => changeSourceMode("constituents")}
                  >
                    Use constituent and spouse fields
                  </button>
                  <p className="mt-2 text-xs text-gray-600">
                    Changes this form only until you save. Query ID and letter
                    period are retained; select the query's society and confirm
                    its actual qualification dates.
                  </p>
                </div>
              )}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Query format
                  <select
                    className={input}
                    value={settings.sourceMode || "households"}
                    onChange={(e) => changeSourceMode(e.target.value)}
                  >
                    <option value="households">
                      Already grouped households (advanced)
                    </option>
                    <option value="constituents">
                      Constituents with spouse IDs (preview only)
                    </option>
                    <option value="society_queries">
                      Separate query for each society (preview only)
                    </option>
                  </select>
                </label>
                {settings.sourceMode !== "society_queries" && (
                  <label className="text-sm font-semibold">
                    NXT saved query ID
                    <input
                      className={input}
                      value={settings.queryId || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, queryId: e.target.value })
                      }
                      inputMode="numeric"
                      required
                    />
                  </label>
                )}
                <label className="text-sm font-semibold">
                  Letter period
                  <select
                    className={input}
                    value={settings.periodBasis}
                    onChange={(e) =>
                      setSettings({ ...settings, periodBasis: e.target.value })
                    }
                  >
                    <option value="calendar_year">Current calendar year</option>
                    <option value="fiscal_year">Current fiscal year</option>
                    <option value="custom">Custom established period</option>
                  </select>
                </label>
                {settings.periodBasis === "fiscal_year" && (
                  <label className="text-sm font-semibold">
                    Fiscal start month
                    <input
                      className={input}
                      type="number"
                      min={1}
                      max={12}
                      value={settings.fiscalYearStartMonth}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          fiscalYearStartMonth: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                )}
                {settings.periodBasis === "custom" &&
                  ["startDate", "endDate"].map((key) => (
                    <label className="text-sm font-semibold" key={key}>
                      {key === "startDate" ? "Period start" : "Period end"}
                      <input
                        className={input}
                        type="date"
                        value={settings[key]}
                        onChange={(e) =>
                          setSettings({ ...settings, [key]: e.target.value })
                        }
                        required
                      />
                    </label>
                  ))}
              </div>
              {settings.sourceMode === "constituents" && (
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-blue-900">
                    This option previews households only. It does not generate
                    letters, send email, or apply appeal codes. A single-society
                    query cannot establish whether a spouse qualifies for a
                    higher society.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <label className="text-sm font-semibold">
                      Society qualified by this query
                      <select
                        className={input}
                        required
                        value={settings.querySocietyKey || ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            querySocietyKey: e.target.value,
                          })
                        }
                      >
                        <option value="">Choose society</option>
                        {data.definitions
                          .filter((d) => settings.societyKeys.includes(d.key))
                          .map((d) => (
                            <option key={d.key} value={d.key}>
                              {d.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {["queryPeriodStart", "queryPeriodEnd"].map((key) => (
                      <label key={key} className="text-sm font-semibold">
                        {key === "queryPeriodStart"
                          ? "Query qualification start"
                          : "Query qualification end"}
                        <input
                          className={input}
                          type="date"
                          required
                          value={settings[key] || ""}
                          onChange={(e) =>
                            setSettings({ ...settings, [key]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-blue-900">
                    Enter the dates actually used in the query. A new year
                    requires re-confirming these dates; a CY2026 query will not
                    silently qualify people for CY2027.
                  </p>
                </div>
              )}
              <fieldset className="mt-6">
                <legend className="font-bold">
                  Letter hierarchy, highest first
                </legend>
                <p className="mt-1 text-sm text-gray-600">
                  Uses the order in Organization Settings. Select only tiers
                  where a higher letter should replace every lower letter.
                  Lifetime societies are not part of this first annual-letter
                  workflow.
                </p>
                <div className="mt-3 flex flex-wrap gap-4">
                  {data.definitions.map((d) => (
                    <label
                      key={d.key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={settings.societyKeys.includes(d.key)}
                        onChange={(e) => {
                          const keys = e.target.checked
                            ? [...settings.societyKeys, d.key]
                            : settings.societyKeys.filter((k) => k !== d.key);
                          setSettings({
                            ...settings,
                            societyKeys: keys,
                            ...(settings.sourceMode === "society_queries"
                              ? {
                                  societySources: keys.map((key) =>
                                    sourceForSociety(settings, key),
                                  ),
                                }
                              : {}),
                          });
                        }}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
                <a
                  className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline"
                  href="/organization-configurations"
                >
                  Review society definitions
                </a>
              </fieldset>
              {settings.sourceMode === "society_queries" && (
                <SocietyQueryEditors
                  settings={settings}
                  definitions={data.definitions}
                  templates={data.templates}
                  onChange={(value) => {
                    setSettings(value);
                    setConfirmedSource(false);
                  }}
                />
              )}
              {settings.sourceMode !== "society_queries" && (
                <details className="mt-6" open={!data.refreshedAt}>
                  <summary className="cursor-pointer font-bold">
                    Map returned query columns
                  </summary>
                  <p className="mt-2 text-sm text-gray-600">
                    {settings.sourceMode === "constituents" ? (
                      "Map System Record ID and Spouse System Record ID, not lookup IDs. Repeated constituency rows are collapsed. Leave optional mappings blank if that field is not in the query. No communication permission is inferred from an address or email."
                    ) : (
                      <>
                        Society must be the configured society name or key.
                        Member IDs must include the household/head ID, separated
                        by |, semicolon, or comma. Period dates accept
                        YYYY-MM-DD or M/D/YYYY. Email Allowed and Mail Allowed
                        must be Yes/True/1 only when deceased, inactive,
                        opt-out, and contact restrictions have been checked.
                      </>
                    )}
                  </p>
                  <QueryColumnMapper
                    queryId={settings.queryId}
                    columns={settings.columns}
                    constituent={settings.sourceMode === "constituents"}
                    onUseConstituents={(fields) =>
                      changeSourceMode("constituents", fields)
                    }
                    labels={
                      settings.sourceMode === "constituents"
                        ? CONSTITUENT_LETTER_LABELS
                        : GROUPED_LETTER_LABELS
                    }
                    onChange={(columns) => {
                      setSettings({ ...settings, columns });
                      setConfirmedSource(false);
                    }}
                  />
                </details>
              )}
              <label className="mt-6 flex items-start gap-3 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  name="confirmedSource"
                  checked={confirmedSource}
                  onChange={(e) => setConfirmedSource(e.target.checked)}
                />
                {isLetterPreviewSource(settings) ? (
                  "I verified this query's giving qualification and dates. I understand these are household previews only; recipient selection, restrictions, prior appeals, and higher-society eligibility still need verification."
                ) : (
                  <>
                    I verified this query's household membership, giving
                    qualification, period, and communication restrictions.
                    Higher letters cover lower tiers in this hierarchy.
                  </>
                )}
              </label>
              <button
                className={`${primary} mt-5`}
                disabled={busy || !confirmedSource}
              >
                Save source settings
              </button>
              <p className="mt-3 text-xs text-gray-500">
                Each query is limited to 1,000 rows and 512 KB. Combined
                previews are limited to 5,000 households and 4 MB. Larger
                results are rejected, never partially sent. Opening this
                workspace never refreshes NXT or sends letters. New calendar and
                fiscal periods roll forward automatically; overlapping
                period/hierarchy changes require a reviewed migration.
              </p>
            </form>
          )}
          {confirmation && (
            <BatchConfirmation
              value={confirmation}
              busy={busy}
              onCancel={() => setConfirmation(null)}
              onConfirm={confirmAction}
            />
          )}
          {excluding && (
            <LetterExclusionDialog
              recipient={excluding}
              appealSettings={data.exclusionAppeals}
              today={data.today}
              busy={busy}
              error={error}
              onClose={() => setExcluding(null)}
              onSave={async (values) => {
                const result = await act({
                  action: "exclude_recipient",
                  householdId: excluding.householdId,
                  ...values,
                });
                if (result) {
                  setExcluding(null);
                  setTab("excluded");
                }
              }}
            />
          )}
          {reviewingRecipient && (
            <LetterRecipientDialog
              recipient={reviewingRecipient}
              template={data.templates.find(
                (template) =>
                  template.societyKey === reviewingRecipient.societyKey,
              )}
              busy={busy}
              error={error}
              onClose={() => setReviewingRecipient(null)}
              onSave={async (values) => {
                const result = await act({
                  action: "save_recipient",
                  householdId: reviewingRecipient.householdId,
                  reviewToken: reviewingRecipient.recipientReview.token,
                  ...values,
                });
                if (result) setReviewingRecipient(null);
              }}
            />
          )}
          {reviewQueue && (
            <RecipientReviewQueue
              items={reviewQueue}
              rows={data.rows}
              templates={data.templates}
              busy={busy}
              error={error}
              onNavigate={() => setError("")}
              onSave={(values) => act({ action: "save_recipient", ...values })}
              onClose={(saved, total) => {
                setReviewQueue(null);
                setError("");
                setReviewNotice(
                  `${saved} of ${total} recipients saved in this review session. All other recipients are unchanged. No letters were sent or marked ready for delivery.`,
                );
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
