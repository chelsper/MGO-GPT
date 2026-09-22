"use client";
import { useEffect, useRef, useState } from "react";
import {
  LETTER_BATCH_LIMIT,
  LETTER_COLUMNS,
  LETTER_TAGS,
} from "@/utils/societyLetters";
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
  queryId: "",
  periodBasis: "calendar_year",
  fiscalYearStartMonth: 7,
  startDate: "",
  endDate: "",
  societyKeys: [],
  columns: LETTER_COLUMNS,
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

function TemplateEditor({ template, busy, save }) {
  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState(
    template.subject || "Your {society_name} recognition",
  );
  const [emailBody, setEmailBody] = useState(
    template.emailBody ||
      "Dear {salutation},\n\nPlease find your {society_name} letter attached. Thank you for your support.",
  );
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!file || !/\.docx$/i.test(file.name) || file.size > 1024 * 1024) {
      setError("Choose a Word .docx template up to 1 MB.");
      return;
    }
    try {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await save({
        action: "template",
        societyKey: template.societyKey,
        template: { filename: file.name, content, subject, emailBody },
      });
    } catch {
      setError(
        "The template could not be saved. Check the file and try again.",
      );
    }
  }
  return (
    <form onSubmit={submit} className={card}>
      <h3 className="text-lg font-bold">{template.societyName}</h3>
      <p className="mt-1 text-sm text-gray-600">
        {template.filename
          ? `Saved: ${template.filename}. New versions do not change already prepared letters.`
          : "No template saved yet."}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">
          Word letter template
          <input
            aria-label={`${template.societyName} Word template`}
            className={input}
            type="file"
            accept=".docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label className="text-sm font-semibold">
          Email subject
          <input
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
      {error && (
        <p role="alert" className="mt-3 text-red-800">
          {error}
        </p>
      )}
      <button disabled={busy} className={`${primary} mt-4`}>
        Save template
      </button>
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
  const filtered = ready.filter((row) =>
    `${row.name} ${row.societyName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const canSelect = (row) =>
    !row.issues[channel] && (channel !== "email" || data.emailEnabled);
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
    ["ready", "Ready to acknowledge"],
    ["history", "Letter history"],
    ["templates", "Letter templates"],
    ["settings", "Source & period"],
  ];
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
              ["Ready for a new letter", ready.length],
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
              {data.sourceIssue && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p>{data.sourceIssue}</p>
                  {!data.settings && (
                    <button
                      className={`${button} mt-3`}
                      onClick={() => setTab("settings")}
                    >
                      Set up household source
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
                <div className="grid gap-4 sm:grid-cols-2">
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
                              <p className="mt-1 text-xs text-gray-500">
                                {row.reason}
                              </p>
                            </td>
                            <td className="p-3">{row.societyName}</td>
                            <td className="whitespace-pre-line p-3">
                              {row.issues[channel] ||
                                (channel === "email" ? row.email : row.address)}
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
                  Upload one Word (.docx) template per society, up to 1 MB. Use
                  the fields below in the letter or email cover message. Keep
                  logos embedded, not linked to external files. Word formatting
                  is retained; PDF conversion is not included.
                </p>
                <p className="mt-3 break-words font-mono text-sm">
                  {LETTER_TAGS.map((tag) => `{${tag}}`).join("  ")}
                </p>
              </div>
              {!data.templates.length && (
                <p>Choose societies in Source &amp; period first.</p>
              )}
              {data.templates.map((template) => (
                <TemplateEditor
                  key={`${template.societyKey}:${template.version}`}
                  template={template}
                  busy={busy}
                  save={act}
                />
              ))}
            </section>
          )}
          {tab === "settings" && (
            <form
              className={card}
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
                Use a saved NXT query of qualified households, not individual
                portfolio summaries. It must include every member system ID, the
                stable household/head system ID, period boundaries, approved
                mailing values, and communication eligibility. No fuzzy
                household matching or gift-total summing is performed here.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  NXT saved query ID
                  <input
                    className={input}
                    value={settings.queryId}
                    onChange={(e) =>
                      setSettings({ ...settings, queryId: e.target.value })
                    }
                    inputMode="numeric"
                    required
                  />
                </label>
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
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            societyKeys: e.target.checked
                              ? [...settings.societyKeys, d.key]
                              : settings.societyKeys.filter((k) => k !== d.key),
                          })
                        }
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
              <details className="mt-6" open={!data.settings}>
                <summary className="cursor-pointer font-bold">
                  Map returned query columns
                </summary>
                <p className="mt-2 text-sm text-gray-600">
                  Society must be the configured society name or key. Member IDs
                  must include the household/head ID, separated by |, semicolon,
                  or comma. Period dates accept YYYY-MM-DD or M/D/YYYY. Email
                  Allowed and Mail Allowed must be Yes/True/1 only when
                  deceased, inactive, opt-out, and contact restrictions have
                  been checked.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(LETTER_COLUMNS).map(([key, label]) => (
                    <label className="text-sm font-semibold" key={key}>
                      {label}
                      <input
                        className={input}
                        value={settings.columns[key]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            columns: {
                              ...settings.columns,
                              [key]: e.target.value,
                            },
                          })
                        }
                        required
                      />
                    </label>
                  ))}
                </div>
              </details>
              <label className="mt-6 flex items-start gap-3 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={confirmedSource}
                  onChange={(e) => setConfirmedSource(e.target.checked)}
                />
                I verified this query's household membership, giving
                qualification, period, and communication restrictions. Higher
                letters cover lower tiers in this hierarchy.
              </label>
              <button
                className={`${primary} mt-5`}
                disabled={busy || !confirmedSource}
              >
                Save source settings
              </button>
              <p className="mt-3 text-xs text-gray-500">
                Query output is limited to 1,000 rows and 512 KB; larger results
                are rejected, never partially sent. Opening this workspace never
                refreshes NXT or sends letters. New calendar and fiscal periods
                roll forward automatically; overlapping period/hierarchy changes
                require a reviewed migration.
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
        </>
      )}
    </main>
  );
}
