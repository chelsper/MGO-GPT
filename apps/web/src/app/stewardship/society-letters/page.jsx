"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useLetterNavigation from "./useLetterNavigation";
import useAutomaticAppealVerification from "./useAutomaticAppealVerification";
import BulkLetterAppealUpdates from "./BulkLetterAppealUpdates";
import { letterViewHref } from "@/utils/societyLetterNavigation";
import {
  LETTER_BATCH_LIMIT,
  LETTER_COLUMNS,
  GROUPED_LETTER_COLUMNS,
  GROUPED_LETTER_LABELS,
  CONSTITUENT_LETTER_COLUMNS,
  CONSTITUENT_LETTER_LABELS,
  isLetterPreviewSource,
  CONSTITUENT_LETTER_PREVIEW_NOTICE,
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
import { reviewScope, useLetterReviewRecovery } from "./letterReviewRecovery";
import LetterReadinessPanel, {
  ReadinessSettings,
} from "./LetterReadinessPanel";
import LetterWorkspaceFilters from "./LetterWorkspaceFilters";
import LetterWorkspaceRow from "./LetterWorkspaceRow";
import LetterBatchCard from "./LetterBatchCard";
import LetterBatchSummary from "./LetterBatchSummary";
import LetterWorkflow from "./LetterWorkflow";
import FinalPostalLetterDialog from "./FinalPostalLetterDialog";
import {
  ATTENTION_FILTERS,
  letterReviewCounts,
  letterReviewView,
  matchesLetterReview,
} from "./letterWorkspaceView";
import QueryColumnMapper from "./QueryColumnMapper";
import LetterSetupChecklist from "./LetterSetupChecklist";
import PostalBatchApproval from "./PostalBatchApproval";
import LetterHistoryFilters from "./LetterHistoryFilters";
import {
  matchesLetterHistory,
  searchLetterHistory,
} from "@/utils/societyLetterHistory";

const endpoint = "/api/stewardship/society-letters";
const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-emerald-700 !bg-emerald-700 !text-white`;
const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900";
const card = "rounded-2xl border border-gray-200 bg-white p-5 sm:p-6";
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
  const [wordFields, setWordFields] = useState(template.wordFields || null);
  const [readingFields, setReadingFields] = useState(false);
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
  async function fileContent() {
    if (!file) return null;
    if (!/\.docx$/i.test(file.name) || file.size > 1024 * 1024)
      throw new Error("Choose a Word .docx template up to 1 MB.");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () =>
        reject(new Error("The Word file could not be read."));
      reader.readAsDataURL(file);
    });
  }
  async function readWordFields() {
    setReadingFields(true);
    setError("");
    try {
      const content = await fileContent();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inspect_template",
          ...(file ? { content } : { templateVersion: template.version }),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Word fields could not be read.");
      setWordFields(result);
      setMergeSettings((current) => {
        const bindings = Object.fromEntries(
          result.fields.map(({ name, suggestedField }) => [
            name,
            current.wordBindings?.[name] || suggestedField,
          ]),
        );
        return {
          ...current,
          wordBindings: bindings,
          fields: [
            ...new Set([
              ...current.fields,
              ...Object.values(bindings).filter(Boolean),
              "address",
              "letter_date",
            ]),
          ],
          wordAddressMode: current.wordAddressMode || "block",
          mergeDateLabel: current.mergeDateLabel ?? result.hasDateLabel,
        };
      });
      onEdit();
    } catch (error) {
      setError(error.message);
    } finally {
      setReadingFields(false);
    }
  }
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
      const content = await fileContent();
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
                disabled={busy || readingFields}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setWordFields(null);
                }}
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
                    setWordFields(template.wordFields || null);
                    setMergeSettings(
                      normalizeLetterMergeSettings(template.mergeSettings),
                    );
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
        busy={busy || readingFields}
        wordFields={wordFields}
        onReadFields={readWordFields}
        canReadFields={Boolean(file || template.version)}
        readingFields={readingFields}
      />
      {error && (
        <p role="alert" className="mt-3 text-red-800">
          {error}
        </p>
      )}
      <button disabled={busy || readingFields} className={`${primary} mt-4`}>
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
  const [requestBusy, setBusy] = useState(false);
  const [bulkAppealsActive, setBulkAppealsActive] = useState(false);
  const busy = requestBusy || bulkAppealsActive;
  const navigation = useLetterNavigation();
  const { tab, showMappings, navigate: setTab } = navigation;
  const [settings, setSettings] = useState(defaults),
    [confirmedSource, setConfirmedSource] = useState(false);
  const [channel, setChannel] = useState("post"),
    [selected, setSelected] = useState([]),
    [search, setSearch] = useState("");
  const [preview, setPreview] = useState(null),
    [confirmation, setConfirmation] = useState(null);
  const [finalPreview, setFinalPreview] = useState(null);
  const [postalFormat, setPostalFormat] = useState("docx");
  const [historySearch, setHistorySearch] = useState("");
  const latestData = useRef(null);
  const [receiptIds, setReceiptIds] = useState({});
  const [societyFilter, setSocietyFilter] = useState("");
  const [templateNotice, setTemplateNotice] = useState("");
  const [excluding, setExcluding] = useState(null);
  const [reviewingRecipient, setReviewingRecipient] = useState(null);
  const [reviewFocus, setReviewFocus] = useState(null);
  const [reviewQueue, setReviewQueue] = useState(null);
  const [queueStart, setQueueStart] = useState(0);
  const [reviewConflict, setReviewConflict] = useState(false);
  const recovery = useLetterReviewRecovery(reviewScope(data));
  const loadedScope = useRef(undefined);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [attentionFilter, setAttentionFilter] = useState("all");
  const [reviewNotice, setReviewNotice] = useState("");
  const [sampleViews, setSampleViews] = useState([]);
  const setupContent = useRef(null);
  const [setupNavigation, setSetupNavigation] = useState(0);
  const [refreshing, setRefreshing] = useState(false),
    [sendingBatch, setSendingBatch] = useState(null);
  const [approvedPostalStart, setApprovedPostalStart] = useState(null);
  // Undefined restores an unfinished batch for display only, never for submission.
  const [workspaceBatchId, setWorkspaceBatchId] = useState(undefined);
  const [showRecipients, setShowRecipients] = useState(false);
  const activeBatchPanel = useRef(null);
  const inFlight = useRef(false);
  const setupOpen = ["setup", "templates", "settings", "appeals"].includes(tab);
  function navigateSetup(destination) {
    setTab(destination);
    setSetupNavigation((value) => value + 1);
  }
  function showNewBatch() {
    navigation.setHistoryFilter("all");
    setHistorySearch("");
    setTab("history");
  }
  useEffect(() => {
    if (!data || !setupOpen) return;
    const target = showMappings
      ? document.getElementById("letter-query-mappings")
      : setupContent.current;
    target?.focus();
  }, [setupNavigation, navigation.view, Boolean(data)]);
  function accept(payload, keepForm = false) {
    latestData.current = payload;
    const nextScope = reviewScope(payload);
    if (
      loadedScope.current !== undefined &&
      loadedScope.current !== nextScope
    ) {
      setReviewQueue(null);
      setReviewingRecipient(null);
      setReviewConflict(false);
      setSelected([]);
      setPreview(null);
      setWorkspaceBatchId(undefined);
      setApprovedPostalStart(null);
      setShowRecipients(false);
    }
    loadedScope.current = nextScope;
    setData(payload);
    if (!keepForm)
      setSettings(
        payload.settings || {
          ...defaults,
          societyKeys: payload.definitions.map((d) => d.key),
        },
      );
  }
  async function load() {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      accept(payload);
      setError("");
      return payload;
    } catch (err) {
      setError(err.message || "Could not load stewardship.");
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function downloadBatch(batchId, deliveryId, format = "docx") {
    setError("");
    try {
      const params = new URLSearchParams({ download: batchId });
      if (deliveryId) params.set("deliveryId", deliveryId);
      if (!deliveryId && format === "combined-pdf")
        params.set("format", "combined-pdf");
      const response = await fetch(`${endpoint}?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error((await response.json()).error);
      saveBlob(
        await response.blob(),
        deliveryId
          ? `society-letter.${format}`
          : format === "combined-pdf"
            ? "society-letters-print-ready.pdf"
            : "society-letters.zip",
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
    const automatic =
      body.automatic === true &&
      ["verify_letter_appeals", "verify_exclusion_appeal"].includes(
        body.action,
      );
    if (!automatic) setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          revision: latestData.current?.revision ?? data.revision,
        }),
      });
      if (download && response.ok) {
        saveBlob(await response.blob(), "society-letter-preview.docx");
        return;
      }
      const payload = await response.json();
      if (!response.ok) {
        if (body.action === "save_recipient" && response.status === 409)
          setReviewConflict(true);
        throw new Error(payload.error || "This operation could not finish.");
      }
      if (payload.finalPreview) setFinalPreview(payload.finalPreview);
      else if (payload.preview) setPreview(payload.preview);
      else {
        accept(payload, automatic);
        if (!automatic) {
          setPreview(null);
          if (body.action !== "update_letter_dates") setSelected([]);
        }
      }
      return payload;
    } catch (err) {
      if (!automatic) {
        setError(err.message);
        setRefreshing(false);
        setSendingBatch(null);
      }
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function reloadRecipient(householdId) {
    if (inFlight.current) throw new Error("An operation is already running.");
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error("Saved choices unavailable.");
      accept(payload);
      return (
        payload.rows.find((row) => row.householdId === householdId) || null
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function resolveReviewConflict() {
    setReviewConflict(false);
    setError("");
  }
  async function saveRecipient(values) {
    const result = await act({ action: "save_recipient", ...values });
    if (result) {
      recovery.keepDraft(values.householdId, null);
      resolveReviewConflict();
    }
    return result;
  }
  async function excludeRecipient(values) {
    const remainingSelection = selected.filter(
      (id) => id !== values.householdId,
    );
    const result = await act({ action: "exclude_recipient", ...values });
    if (result) {
      if (reviewScope(result) === reviewScope(data))
        setSelected(
          remainingSelection.filter((id) =>
            result.rows.some(
              (row) => row.householdId === id && row.status === "ready",
            ),
          ),
        );
      recovery.keepDraft(values.householdId, null);
      const row = result.rows.find(
        (row) => row.householdId === values.householdId,
      );
      const excluded = result.exclusions?.find((item) =>
        item.members.some((id) => row?.members?.includes(id)),
      );
      setReviewNotice(
        `${row?.name || "Recipient"} excluded for this period. No letter was sent. ${
          excluded?.nxt && excluded.nxt.status !== "complete"
            ? "NXT updates need attention; check Excluded for details."
            : "Find this decision in Excluded."
        }`,
      );
    }
    return result;
  }
  function resumeReview() {
    const checkpoint = recovery.checkpoint;
    if (!checkpoint) return;
    const items = checkpoint.ids
      .map((id) => data.rows.find((row) => row.householdId === id))
      .filter(
        (row) => row?.status === "ready" && row.recipientReview?.editable,
      );
    if (!items.length) {
      recovery.clearCheckpoint();
      setReviewNotice(
        "The previous review no longer has editable recipients. The current holding list is unchanged.",
      );
      return;
    }
    setQueueStart(
      Math.max(
        0,
        items.findIndex((row) => row.householdId === checkpoint.currentId),
      ),
    );
    setChannel(checkpoint.channel);
    resolveReviewConflict();
    setReviewQueue(items);
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
  const sourceDirty = Boolean(
    data?.settings &&
    JSON.stringify(settings) !== JSON.stringify(data.settings),
  );
  const verificationNotice = useAutomaticAppealVerification({
    data,
    paused:
      busy ||
      refreshing ||
      !!sendingBatch ||
      setupOpen ||
      sourceDirty ||
      !!preview ||
      !!confirmation ||
      !!finalPreview ||
      !!excluding ||
      !!reviewingRecipient ||
      !!reviewQueue,
    verify: act,
  });
  const householdPreview = isLetterPreviewSource(data?.settings);
  const queryPostal = data?.settings?.sourceMode === "society_queries";
  const selectionLimit = LETTER_BATCH_LIMIT;
  const deliveryBatchLimit = queryPostal
    ? postalFormat === "pdf"
      ? Math.min(10, data.postalPdf?.maxBatchSize || 10)
      : 10
    : LETTER_BATCH_LIMIT;
  const matching = ready.filter(
    (row) =>
      (!societyFilter || row.societyKey === societyFilter) &&
      `${row.name} ${row.societyName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const views = new Map(
    matching.map((row) => [
      row.householdId,
      letterReviewView(row, channel, data?.sourceIssue, queryPostal),
    ]),
  );
  const counts = letterReviewCounts([...views.values()]);
  const reviewMatches = matching.filter((row) =>
    matchesLetterReview(views.get(row.householdId), reviewFilter),
  );
  const attentionCounts = Object.fromEntries(
    ATTENTION_FILTERS.map(([key]) => [
      key,
      reviewMatches.filter((row) =>
        views.get(row.householdId).attention.includes(key),
      ).length,
    ]),
  );
  const filtered = reviewMatches.filter(
    (row) =>
      attentionFilter === "all" ||
      views.get(row.householdId).attention.includes(attentionFilter),
  );
  const reviewingUnreviewed =
    reviewFilter === "all" && attentionFilter === "all";
  const reviewedView = reviewFilter === "reviewed";
  const reviewedInView = filtered.filter(
    (row) => row.recipientReview?.status === "saved",
  ).length;
  function changeReviewFilter(value) {
    setReviewFilter(value);
    setAttentionFilter("all");
    setSelected([]);
    setPreview(null);
  }
  function changeAttentionFilter(value) {
    setAttentionFilter(value);
    setSelected([]);
    setPreview(null);
  }
  const canPrepare = (row) =>
    householdPreview
      ? queryPostal &&
        channel === "post" &&
        row.recipientReview?.status === "saved"
      : !row.issues?.[channel] && (channel !== "email" || data.emailEnabled);
  const selectable = filtered.filter(canPrepare);
  // Selecting a recipient is only a local review choice, not delivery approval.
  const canReview = (row) => !!row.recipientReview?.editable;
  const canSelect = (row) =>
    (householdPreview && canReview(row)) || canPrepare(row);
  const selectedRows = filtered.filter((row) =>
    selected.includes(row.householdId),
  );
  const selectedReviewable = selectedRows.filter(canReview);
  const selectionBusy = busy || refreshing || !!sendingBatch;
  function selectionReason(row) {
    if (selectionBusy) return "Wait for the current operation to finish.";
    if (!canSelect(row))
      return householdPreview
        ? "Recipient review is unavailable. Reload saved results; refresh membership if the query settings changed."
        : row.issues?.[channel] || "Email delivery is not enabled.";
    if (
      !selected.includes(row.householdId) &&
      selected.length >= selectionLimit
    )
      return `Review up to ${selectionLimit} recipients at a time. Clear a selection to choose someone else.`;
    return "";
  }
  const preparationIssue =
    !selected.length || (householdPreview && !queryPostal)
      ? ""
      : selectedRows.length !== selected.length
        ? "The holding list changed. Clear your selection and choose recipients again."
        : sourceDirty
          ? "Save your source settings, then refresh membership before preparing letters."
          : queryPostal && data.postalDraft
            ? "Finish or cancel the current document approval batch before starting another."
            : queryPostal && channel !== "post"
              ? "These query lists support postal approval only. You can still review selected recipients."
              : queryPostal && data.job && data.job.status !== "complete"
                ? "Finish the membership refresh before preparing letters. You can still select recipients for review."
                : queryPostal && data.readiness?.issue
                  ? data.readiness.issue
                  : selected.length > deliveryBatchLimit
                    ? `Document approval is limited to ${deliveryBatchLimit} households at a time. Choose fewer recipients or use Select reviewed households.`
                    : !selectedRows.every(canPrepare)
                      ? "Some selected recipients still need their names and addresses reviewed. Save their recipient choices before starting document approval. No separate delivery check is required."
                      : "";
  const reviewable = filtered.filter(
    (row) =>
      row.recipientReview?.editable &&
      (!reviewingUnreviewed || row.recipientReview.status !== "saved"),
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
  const visibleBatches = batches.filter(
    (batch) =>
      matchesLetterHistory(batch, navigation.historyFilter) &&
      searchLetterHistory(batch, historySearch),
  );
  const workspaceBatch =
    workspaceBatchId === null
      ? null
      : batches.find((batch) =>
          workspaceBatchId
            ? batch.id === workspaceBatchId
            : batch.items.every((item) => item.postalApproval) &&
              batch.items.some(
                (item) =>
                  item.status === "prepared" &&
                  item.letterAppeals?.status !== "complete",
              ),
        );
  const activeWork = Boolean(data?.postalDraft || workspaceBatch);
  const guidedPostal = queryPostal && (channel === "post" || activeWork);
  const batchComplete = Boolean(
    workspaceBatch?.items.filter((item) => item.status !== "cancelled").length >
      0 &&
    workspaceBatch.items
      .filter((item) => item.status !== "cancelled")
      .every((item) => item.letterAppeals?.status === "complete"),
  );
  const recipientChoicesSaved = selected.length
    ? selectedRows.length === selected.length && selectedRows.every(canPrepare)
    : selectable.length > 0 && selectable.length === filtered.length;
  const workflowStage = data?.postalDraft
    ? "approve"
    : workspaceBatch
      ? batchComplete
        ? "download"
        : "create"
      : recipientChoicesSaved
        ? "approve"
        : "review";
  useEffect(() => {
    // Keep a restored batch on screen when its final receipt is confirmed.
    // Selecting a saved batch is display-only; only a new approval auto-starts.
    if (workspaceBatchId === undefined && workspaceBatch)
      setWorkspaceBatchId(workspaceBatch.id);
  }, [workspaceBatchId, workspaceBatch?.id]);
  useEffect(() => {
    if (workspaceBatchId && tab === "ready") {
      activeBatchPanel.current?.focus();
      activeBatchPanel.current?.scrollIntoView?.({ block: "start" });
    }
  }, [workspaceBatchId, tab]);
  function renderCurrentBatch() {
    if (data?.postalDraft)
      return (
        <PostalBatchApproval
          key={`${data.postalDraft.id}-${data.postalDraft.dateUpdatedAt || ""}`}
          draft={data.postalDraft}
          revision={data.revision}
          busy={busy || refreshing || !!sendingBatch}
          act={act}
          onApproved={(batchId) => {
            setApprovedPostalStart(batchId);
            setWorkspaceBatchId(batchId);
            setShowRecipients(false);
          }}
        />
      );
    if (!workspaceBatch) return null;
    return (
      <section
        ref={activeBatchPanel}
        tabIndex={-1}
        aria-label="Current letter batch"
        className="scroll-mt-24 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
      >
        {renderBatch(workspaceBatch, true)}
        <button
          className={`${button} mt-3`}
          disabled={selectionBusy}
          onClick={() => {
            setWorkspaceBatchId(null);
            setSelected([]);
            setShowRecipients(false);
          }}
        >
          {batchComplete ? "Start another batch" : "Back to recipient list"}
        </button>
      </section>
    );
  }
  function renderBatch(batch, guided = false) {
    return (
      <LetterBatchCard
        key={batch.id}
        batch={batch}
        guided={guided}
        busy={busy || refreshing}
        sendingBatch={sendingBatch}
        emailEnabled={data.emailEnabled}
        definitions={data.definitions}
        downloadBatch={downloadBatch}
        setConfirmation={setConfirmation}
        act={act}
        autoStart={approvedPostalStart === batch.id}
        onAutoStartConsumed={() => setApprovedPostalStart(null)}
        historySearch={guided ? "" : historySearch}
        receiptIds={receiptIds}
        setReceiptIds={setReceiptIds}
        onReload={load}
      />
    );
  }
  const tabs = [
    ["ready", "Letter workspace"],
    ["excluded", `Excluded (${data?.exclusions?.length || 0})`],
    ["history", "Letter history"],
    ["setup", "Setup"],
  ];
  async function refreshMembership() {
    const action = data.job?.status === "running" ? "resume" : "refresh";
    const result = await act({ action, jobId: data.job?.id });
    if (result?.job?.status === "running") setRefreshing(true);
  }
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
      if (action.action === "update_letter_dates" && result)
        setReviewNotice(
          `Uncreated letters use ${result.today}. Saved recipient reviews were kept. Previously created letters are unchanged.`,
        );
      if (action.action === "return_letter_to_review" && result) {
        setApprovedPostalStart(null);
        setWorkspaceBatchId(null);
        setShowRecipients(true);
        setSearch("");
        setSocietyFilter("");
        setReviewFilter("all");
        setAttentionFilter("all");
        const row = result.rows.find(
          (item) => item.householdId === action.householdId,
        );
        setSelected(
          row?.status === "ready" && row.recipientReview?.editable
            ? [row.householdId]
            : [],
        );
        setReviewNotice(
          "Letter returned to review. Saved wording was kept and no NXT records changed. Other letters remain in Letter history. Refresh membership if this recipient is not currently in the holding list.",
        );
        setTab("ready");
      }
    }
  }
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-gray-900 sm:px-8">
      <a
        href={navigation.backHref}
        onClick={navigation.back}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg py-2 text-sm font-semibold text-indigo-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {navigation.backLabel}
      </a>
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
            disabled={busy || refreshing || !!sendingBatch || sourceDirty}
            onClick={refreshMembership}
          >
            {refreshing
              ? "Refreshing membership..."
              : data.job?.status === "running"
                ? "Resume membership refresh"
                : "Refresh membership"}
          </button>
        )}
      </header>
      {verificationNotice && (
        <p role="status" className="text-sm text-gray-600">
          {verificationNotice}
        </p>
      )}
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
                className={
                  (key === "setup" ? setupOpen : tab === key) ? primary : button
                }
                aria-pressed={key === "setup" ? setupOpen : tab === key}
                onClick={() => navigateSetup(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {setupOpen && (
            <>
              <nav
                aria-label="Letter setup"
                className="flex flex-wrap gap-2 border-b border-gray-200 pb-4"
              >
                {[
                  ["setup", "Setup checklist"],
                  ["settings", "Source & period"],
                  ["templates", "Letter templates"],
                  ["appeals", "Appeal settings"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? primary : button}
                    aria-pressed={tab === key}
                    onClick={() => navigateSetup(key)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div
                ref={setupContent}
                tabIndex={-1}
                className="scroll-mt-24 focus:outline-none"
              >
                <h2 className="sr-only">
                  {tab === "setup"
                    ? "Setup checklist"
                    : tab === "settings"
                      ? "Source and period settings"
                      : tab === "appeals"
                        ? "Appeal settings"
                        : "Saved letter settings"}
                </h2>
              </div>
            </>
          )}
          {tab === "setup" && (
            <LetterSetupChecklist
              data={data}
              viewed={sampleViews}
              onViewed={(key) =>
                setSampleViews((current) =>
                  current.includes(key) ? current : [...current, key],
                )
              }
              onNavigate={navigateSetup}
              busy={busy || refreshing || !!sendingBatch}
            />
          )}
          {tab === "ready" && (
            <>
              {guidedPostal && (
                <LetterWorkflow stage={workflowStage}>
                  {data.postalDraft ? (
                    <p>
                      Your recipient choices are saved. Prepare the documents,
                      then approve this batch once.
                    </p>
                  ) : workspaceBatch ? (
                    <p>
                      {batchComplete
                        ? "Your letters and NXT appeal updates are complete. Download the files, then mark the batch mailed after dispatch."
                        : "Your approval is saved. NXT checks and appeal updates run here; you do not need to review these letters again."}
                    </p>
                  ) : (
                    <p>
                      {recipientChoicesSaved
                        ? "Recipient choices are saved. Select reviewed households to prepare and approve their letters."
                        : "Review names and addresses, select reviewed households, then approve their letters. Nothing is sent just by reviewing."}
                    </p>
                  )}

                  {!data.postalDraft &&
                    batches.some((batch) =>
                      batch.items.every((item) => item.postalApproval),
                    ) && (
                      <label className="mt-4 block max-w-lg text-sm font-semibold">
                        Open a saved batch
                        <select
                          className={input}
                          value={workspaceBatch?.id || ""}
                          disabled={selectionBusy}
                          onChange={(event) => {
                            setWorkspaceBatchId(event.target.value || null);
                            setShowRecipients(false);
                          }}
                        >
                          <option value="">Recipient list</option>
                          {batches
                            .filter((batch) =>
                              batch.items.every((item) => item.postalApproval),
                            )
                            .map((batch) => (
                              <option key={batch.id} value={batch.id}>
                                {batch.items.length} letters ·{" "}
                                {new Date(batch.date).toLocaleString()} ·{" "}
                                {batch.items.every(
                                  (item) =>
                                    item.letterAppeals?.status === "complete",
                                )
                                  ? "Created"
                                  : "In progress"}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                </LetterWorkflow>
              )}
              <details
                open={!guidedPostal || undefined}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <summary className="cursor-pointer text-sm font-semibold text-gray-600">
                  Setup and checks
                </summary>
                <div className="mt-4 space-y-3">
                  <LetterSetupChecklist
                    compact
                    data={data}
                    viewed={sampleViews}
                    onNavigate={navigateSetup}
                    busy={busy || refreshing || !!sendingBatch}
                  />
                  <LetterReadinessPanel
                    data={data}
                    optional={queryPostal && channel === "post"}
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
                    onOpenSettings={() => navigateSetup("appeals")}
                  />
                </div>
              </details>
              {data.sourceIssue &&
                !(
                  guidedPostal &&
                  data.sourceIssue === CONSTITUENT_LETTER_PREVIEW_NOTICE
                ) && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p>
                      {data.settings?.sourceMode === "society_queries" &&
                      data.sourceIssue === CONSTITUENT_LETTER_PREVIEW_NOTICE
                        ? "Review recipients, then select reviewed households to prepare and approve their documents. NXT is checked automatically for the selected households before appeals are applied. No separate delivery check is required. Email delivery is not enabled for these query lists."
                        : data.sourceIssue}
                    </p>
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
              {renderCurrentBatch()}
              {activeWork && (
                <button
                  className={button}
                  aria-expanded={showRecipients}
                  onClick={() => setShowRecipients((value) => !value)}
                >
                  {showRecipients
                    ? "Hide recipient list"
                    : "Show recipient list"}
                </button>
              )}
              {(!activeWork || showRecipients) && (
                <section
                  className={card}
                  aria-labelledby="letter-holding-title"
                >
                  <h2 id="letter-holding-title" className="text-lg font-bold">
                    Your letter holding list
                  </h2>
                  <p className="mb-5 mt-1 text-sm text-gray-600">
                    Review recipients at your pace. Nothing is sent when you
                    open this list or save recipient choices. Exclude someone
                    for this period when needed; find them again in Excluded.
                  </p>
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
                          setAttentionFilter("all");
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
                  <LetterWorkspaceFilters
                    value={reviewFilter}
                    onChange={changeReviewFilter}
                    counts={counts}
                    attention={attentionFilter}
                    onAttentionChange={changeAttentionFilter}
                    attentionCounts={attentionCounts}
                    channel={channel}
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p role="status">
                      Showing {filtered.length} of {matching.length} matching
                      recipients
                    </p>
                    {(reviewFilter !== "all" ||
                      attentionFilter !== "all" ||
                      search ||
                      societyFilter) && (
                      <button
                        className="min-h-11 font-semibold text-emerald-800 underline underline-offset-4"
                        onClick={() => {
                          changeReviewFilter("all");
                          setSearch("");
                          setSocietyFilter("");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  {channel === "email" && !data.emailEnabled && (
                    <p className="mt-3 text-sm text-amber-900">
                      Email delivery is off for this environment until the
                      household source and templates are verified. Postal
                      preparation is available after setup.
                    </p>
                  )}
                  {(recovery.checkpoint ||
                    matching.some((row) => row.recipientReview)) && (
                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                      {reviewedInView > 0 && (
                        <p className="w-full text-sm text-gray-600">
                          {reviewedView ? "Recipient review complete. " : ""}
                          {reviewedInView}{" "}
                          {reviewedInView === 1
                            ? "recipient in this view is"
                            : "recipients in this view are"}{" "}
                          already reviewed. You do not need to save them again
                          unless you want to make changes.
                        </p>
                      )}
                      {recovery.checkpoint && (
                        <button
                          type="button"
                          className={button}
                          disabled={selectionBusy}
                          onClick={resumeReview}
                        >
                          Resume review
                        </button>
                      )}
                      <button
                        type="button"
                        className={
                          !activeWork && !selected.length && !selectable.length
                            ? primary
                            : button
                        }
                        disabled={selectionBusy || !reviewable.length}
                        onClick={() => {
                          setError("");
                          setReviewConflict(false);
                          setQueueStart(0);
                          setReviewNotice("");
                          setReviewQueue(
                            reviewable.slice(0, LETTER_BATCH_LIMIT),
                          );
                        }}
                      >
                        {reviewedView
                          ? "Edit reviewed recipients"
                          : "Review recipients in bulk"}
                      </button>
                      <span className="text-sm text-gray-500">
                        {reviewable.length}{" "}
                        {reviewingUnreviewed
                          ? "unreviewed recipients"
                          : "editable recipients"}{" "}
                        in this view
                      </span>
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
                  {queryPostal && (
                    <section
                      aria-label="From review to final letters"
                      className="my-4"
                    >
                      {data.readiness?.issue && (
                        <div
                          role="status"
                          className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
                        >
                          <p>{data.readiness.issue}</p>
                          <button
                            type="button"
                            className={`${button} mt-2`}
                            onClick={() => navigateSetup("appeals")}
                          >
                            Open appeal settings
                          </button>
                        </div>
                      )}
                      <details className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <summary className="cursor-pointer text-sm font-semibold">
                          Letter options:{" "}
                          {postalFormat === "pdf" ? "PDF" : "Word"}
                          {data.today ? ` · ${data.today}` : ""}
                        </summary>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <label className="text-sm font-semibold">
                            Final letter format
                            <select
                              className={input}
                              value={postalFormat}
                              disabled={busy || !!data.postalDraft}
                              onChange={(e) => setPostalFormat(e.target.value)}
                            >
                              <option value="docx">Word (.docx)</option>
                              <option
                                value="pdf"
                                disabled={!data.postalPdf?.enabled}
                              >
                                PDF
                                {data.postalPdf?.enabled
                                  ? ""
                                  : " (private converter not configured)"}
                              </option>
                            </select>
                          </label>
                          <section aria-label="Letter date" className="text-sm">
                            <p>
                              New letters use {data.today || "today's date"}.
                              Saved recipient reviews last 15 days.
                            </p>
                            <button
                              type="button"
                              className={`${button} mt-2`}
                              disabled={selectionBusy}
                              onClick={() =>
                                setConfirmation({
                                  action: "update_letter_dates",
                                  draftId: data.postalDraft?.id || null,
                                  title:
                                    "Use today's date for all uncreated letters?",
                                  description:
                                    "Saved recipient reviews are kept for 15 days. Older draft documents will be regenerated with today's date and included in one batch approval; reopening every preview is optional. NXT checks run automatically before appeal updates. Created letters and NXT records stay unchanged.",
                                })
                              }
                            >
                              Use today's date for all letters
                            </button>
                          </section>
                        </div>
                        <p className="mt-3 text-sm text-gray-600">
                          Up to {deliveryBatchLimit} documents per batch. Each
                          household or individual receives one letter. A higher
                          society letter covers lower tiers without extra
                          letters.
                        </p>
                      </details>
                    </section>
                  )}
                  {queryPostal && !selectable.length && filtered.length > 0 && (
                    <p role="status" className="my-3 text-sm text-gray-600">
                      Save recipient choices before preparing documents.
                    </p>
                  )}
                  {householdPreview && !queryPostal && (
                    <p className="my-4 text-sm">
                      These query results support recipient review only.
                      Configure one query per society in Setup to enable postal
                      approval and appeal updates.
                    </p>
                  )}
                  <div className="my-4 space-y-3">
                    {householdPreview && (
                      <p
                        id="letter-selection-help"
                        className="text-sm text-gray-600"
                      >
                        {reviewedView
                          ? "Checkboxes choose reviewed recipients for document approval or optional edits."
                          : "Checkboxes choose recipients for review or document approval once their recipient choices are saved."}{" "}
                        Selecting someone does not send a letter or add an
                        appeal in NXT.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      {householdPreview && (
                        <>
                          <button
                            className={button}
                            disabled={
                              selectionBusy || !filtered.some(canReview)
                            }
                            onClick={() => {
                              setSelected(
                                filtered
                                  .filter(canReview)
                                  .slice(0, selectionLimit)
                                  .map((row) => row.householdId),
                              );
                              setPreview(null);
                            }}
                          >
                            {reviewedView
                              ? "Select to edit"
                              : "Select for review"}{" "}
                            (up to {selectionLimit})
                          </button>
                          <button
                            className={
                              !activeWork &&
                              selected.length > 0 &&
                              !selectedRows.every(canPrepare)
                                ? primary
                                : button
                            }
                            disabled={
                              selectionBusy ||
                              !selected.length ||
                              selectedReviewable.length !== selected.length
                            }
                            onClick={() => {
                              setError("");
                              setReviewConflict(false);
                              setQueueStart(0);
                              setReviewNotice("");
                              setReviewQueue(selectedReviewable);
                            }}
                          >
                            {reviewedView
                              ? "Edit selected recipients"
                              : "Review selected recipients"}
                          </button>
                        </>
                      )}
                      {(!householdPreview || queryPostal) && (
                        <button
                          className={
                            !activeWork && !selected.length && selectable.length
                              ? primary
                              : button
                          }
                          disabled={
                            selectionBusy ||
                            !selectable.length ||
                            (queryPostal && !!data.postalDraft)
                          }
                          onClick={() => {
                            setSelected(
                              selectable
                                .slice(0, deliveryBatchLimit)
                                .map((r) => r.householdId),
                            );
                            setPreview(null);
                          }}
                        >
                          {queryPostal
                            ? "Select reviewed households"
                            : "Select eligible households"}{" "}
                          (up to {deliveryBatchLimit})
                        </button>
                      )}
                      <button
                        className={button}
                        disabled={!selected.length || selectionBusy}
                        onClick={() => {
                          setSelected([]);
                          setPreview(null);
                        }}
                      >
                        Clear selection
                      </button>
                      <span className="text-sm">
                        {selected.length} selected
                      </span>
                      {(!householdPreview || queryPostal) && (
                        <button
                          className={
                            !activeWork &&
                            selected.length > 0 &&
                            !preparationIssue
                              ? primary
                              : button
                          }
                          aria-describedby={
                            preparationIssue
                              ? "letter-preparation-help"
                              : undefined
                          }
                          disabled={
                            selectionBusy ||
                            !selected.length ||
                            !!preparationIssue ||
                            (queryPostal && !!data.postalDraft)
                          }
                          onClick={() => {
                            if (
                              selectionBusy ||
                              preparationIssue ||
                              !selected.length
                            )
                              return;
                            act({
                              action: queryPostal
                                ? "start_postal_draft"
                                : "preview",
                              ...(queryPostal ? { format: postalFormat } : {}),
                              channel,
                              householdIds: selected,
                            });
                          }}
                        >
                          {queryPostal
                            ? "Start document approval"
                            : "Review selected letters"}
                        </button>
                      )}
                    </div>
                    {preparationIssue && (
                      <p
                        id="letter-preparation-help"
                        role="status"
                        className="text-sm text-amber-900"
                      >
                        {preparationIssue}
                      </p>
                    )}
                  </div>
                  {!householdPreview && !selectable.length && (
                    <p role="status" className="mb-3 text-sm">
                      No eligible households in this view. Review the delivery
                      readiness messages below before selecting a batch.
                    </p>
                  )}
                  <p className="mb-4 text-sm text-gray-500">
                    Small batches protect against timeouts. Sending a higher
                    letter covers the lower tiers; those lower letters are not
                    sent.
                  </p>
                  {!filtered.length ? (
                    <p className="py-8 text-gray-600">
                      {data.refreshedAt
                        ? "No recipients match these filters. Clear filters to see the holding list; completed acknowledgments are in Letter history."
                        : "Configure and refresh your household query to see eligible recipients."}
                    </p>
                  ) : (
                    <div
                      className="max-h-[600px] overflow-auto rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                      role="region"
                      aria-label="Scrollable letter recipients"
                      tabIndex={0}
                    >
                      <p className="sticky left-0 mb-2 max-w-full text-xs text-gray-500 md:hidden">
                        Scroll across to see review status and recipient
                        actions.
                      </p>
                      <table
                        className="w-full min-w-[760px] text-left text-sm"
                        aria-label="Letter recipients"
                      >
                        <thead className="sticky top-0 z-10 bg-gray-50">
                          <tr>
                            {[
                              "Select",
                              "Recipient & letter",
                              "Recipient review",
                              queryPostal && channel === "post"
                                ? "Next step"
                                : "Delivery readiness",
                              "Actions",
                            ].map((h) => (
                              <th key={h} scope="col" className="p-3">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((row) => (
                            <LetterWorkspaceRow
                              key={row.householdId}
                              row={row}
                              view={views.get(row.householdId)}
                              channel={channel}
                              definitions={data.definitions}
                              sourceIssue={data.sourceIssue}
                              automaticPostalChecks={queryPostal}
                              onFinalize={
                                data.settings?.sourceMode === "society_queries"
                                  ? () =>
                                      act({
                                        action: "start_postal_draft",
                                        householdIds: [row.householdId],
                                        format: postalFormat,
                                      })
                                  : undefined
                              }
                              checked={selected.includes(row.householdId)}
                              selectionDisabled={!!selectionReason(row)}
                              selectionReason={selectionReason(row)}
                              selectionHelpId={
                                householdPreview
                                  ? "letter-selection-help"
                                  : undefined
                              }
                              reviewDisabled={
                                busy ||
                                refreshing ||
                                !!sendingBatch ||
                                !row.recipientReview?.editable
                              }
                              excludeDisabled={
                                busy || refreshing || !!sendingBatch
                              }
                              onSelect={(checked) => {
                                if (selectionReason(row)) return;
                                setPreview(null);
                                setSelected((current) =>
                                  checked
                                    ? [
                                        ...new Set([
                                          ...current,
                                          row.householdId,
                                        ]),
                                      ]
                                    : current.filter(
                                        (id) => id !== row.householdId,
                                      ),
                                );
                              }}
                              onReview={(field) => {
                                setError("");
                                setReviewFocus(field);
                                setReviewingRecipient(row);
                                setReviewConflict(false);
                                recovery.remember({
                                  ids: [row.householdId],
                                  currentId: row.householdId,
                                  channel,
                                });
                              }}
                              onReadiness={
                                data.readiness
                                  ? () => {
                                      const heading = document.getElementById(
                                        "letter-readiness-title",
                                      );
                                      heading?.focus();
                                      heading?.scrollIntoView?.({
                                        block: "center",
                                      });
                                    }
                                  : undefined
                              }
                              onExclude={() => {
                                setError("");
                                setExcluding({
                                  ...row,
                                  period: row.period || data.period,
                                });
                              }}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
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
                  <LetterBatchSummary
                    items={preview.rows}
                    selectionSummary={preview.selectionSummary}
                    preview
                  />
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
                      if (result) showNewBatch();
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
              <fieldset disabled={busy || refreshing || !!sendingBatch}>
                <LetterHistoryFilters
                  batches={batches}
                  filter={navigation.historyFilter}
                  onFilter={navigation.setHistoryFilter}
                  search={historySearch}
                  onSearch={setHistorySearch}
                  visibleCount={visibleBatches.length}
                />
              </fieldset>
              <BulkLetterAppealUpdates
                items={visibleBatches
                  .flatMap((batch) => batch.items)
                  .filter((item) =>
                    searchLetterHistory({ items: [item] }, historySearch),
                  )}
                busy={requestBusy || refreshing || !!sendingBatch}
                act={act}
                onActiveChange={setBulkAppealsActive}
              />
              <p className="text-sm text-gray-600">
                Prepared is not sent. Mark postal batches mailed only after
                dispatch. An uncertain email stays protected against duplicate
                sending.
              </p>
              {!batches.length && (
                <div className={card}>No letter batches yet.</div>
              )}
              {!!batches.length && !visibleBatches.length && (
                <div className={card}>
                  No saved batches match this view. Change the status or clear
                  your search.
                </div>
              )}
              {visibleBatches.map((batch) => renderBatch(batch))}
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
                  formatting is retained. Automatic PDF letters require the
                  private PDF converter to be configured. You can save each
                  annual society's template before its query is ready. Saving a
                  template never sends letters.
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
                <button
                  className={button}
                  onClick={() => navigateSetup("appeals")}
                >
                  Open appeal settings
                </button>
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
                      automatic
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
          {tab === "appeals" && (
            <section className={card} aria-label="Appeal configuration">
              <h2 className="text-xl font-bold">NXT appeal settings</h2>
              <p className="mt-2 text-sm text-gray-600">
                Configure letter-sent and exclusion appeals here. Saving
                settings does not assign an appeal or send a letter. Recipient
                optional NXT preflight checks remain in the holding list.
              </p>
              {data.readiness && (
                <ReadinessSettings
                  key={`${data.period?.key}/${data.readiness.policy?.savedAt || "new"}`}
                  data={data}
                  busy={
                    busy ||
                    refreshing ||
                    !!sendingBatch ||
                    ["running", "paused"].includes(data.readiness.job?.status)
                  }
                  act={act}
                />
              )}
              <div className="mt-4">
                <ExclusionAppealSettings
                  key={`${data.period?.key}/${data.exclusionAppeals?.policy?.savedAt || "new"}`}
                  data={data}
                  busy={
                    busy ||
                    refreshing ||
                    !!sendingBatch ||
                    ["running", "paused"].includes(data.readiness?.job?.status)
                  }
                  act={act}
                />
              </div>
            </section>
          )}
          {tab === "settings" && (
            <>
              {data.settings && (
                <section
                  className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
                  aria-label="Check saved source output"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="max-w-2xl">
                      <h2 className="font-bold">Check saved source output</h2>
                      <p className="mt-1 text-sm text-gray-600">
                        Save changes below first, then load membership to check
                        the returned fields. This runs the saved queries but
                        does not create letters or change NXT records.
                      </p>
                    </div>
                    <button
                      className={button}
                      disabled={
                        busy ||
                        refreshing ||
                        !!sendingBatch ||
                        !data.setup?.sourceConfigured ||
                        sourceDirty
                      }
                      onClick={refreshMembership}
                    >
                      {refreshing
                        ? "Loading membership..."
                        : data.job?.status === "running"
                          ? "Resume saved query check"
                          : "Load membership from saved queries"}
                    </button>
                  </div>
                  {sourceDirty && (
                    <p className="mt-2 text-sm text-amber-900">
                      Save your source changes before loading membership.
                    </p>
                  )}
                  {data.job?.message && (
                    <p role="status" className="mt-2 text-sm text-gray-700">
                      {data.job.message}
                    </p>
                  )}
                  {data.setup?.membershipCurrent && (
                    <p className="mt-2 text-sm font-semibold text-emerald-800">
                      A completed membership result is available for the saved
                      settings. Delivery checks remain separate.
                    </p>
                  )}
                </section>
              )}
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
                  used to guess a relationship, and individual gift totals are
                  not added together.
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
                      period are retained; select the query's society and
                      confirm its actual qualification dates.
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
                        Separate query for each society
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
                        setSettings({
                          ...settings,
                          periodBasis: e.target.value,
                        })
                      }
                    >
                      <option value="calendar_year">
                        Current calendar year
                      </option>
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
                      letters, send email, or apply appeal codes. A
                      single-society query cannot establish whether a spouse
                      qualifies for a higher society.
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
                              setSettings({
                                ...settings,
                                [key]: e.target.value,
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-blue-900">
                      Enter the dates actually used in the query. A new year
                      requires re-confirming these dates; a CY2026 query will
                      not silently qualify people for CY2027.
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
                    href={`/organization-configurations?${new URLSearchParams({ returnTo: letterViewHref(navigation.view) })}#giving-societies`}
                    onClick={(event) => {
                      if (
                        sourceDirty &&
                        !window.confirm(
                          "You have unsaved source settings. Leave without saving these changes?",
                        )
                      )
                        event.preventDefault();
                    }}
                  >
                    Review society definitions
                  </a>
                </fieldset>
                {settings.sourceMode === "society_queries" && (
                  <SocietyQueryEditors
                    settings={settings}
                    definitions={data.definitions}
                    templates={data.templates}
                    showMappings={showMappings}
                    onChange={(value) => {
                      setSettings(value);
                      setConfirmedSource(false);
                    }}
                  />
                )}
                {settings.sourceMode !== "society_queries" && (
                  <details
                    id="letter-query-mappings"
                    tabIndex={-1}
                    className="mt-6"
                    open={showMappings || !data.refreshedAt}
                  >
                    <summary className="cursor-pointer font-bold">
                      Map returned query columns
                    </summary>
                    <p className="mt-2 text-sm text-gray-600">
                      {settings.sourceMode === "constituents" ? (
                        "Map System Record ID and Spouse System Record ID, not lookup IDs. Repeated constituency rows are collapsed. Leave optional mappings blank if that field is not in the query. No communication permission is inferred from an address or email."
                      ) : (
                        <>
                          Society must be the configured society name or key.
                          Member IDs must include the household/head ID,
                          separated by |, semicolon, or comma. Period dates
                          accept YYYY-MM-DD or M/D/YYYY. Email Allowed and Mail
                          Allowed must be Yes/True/1 only when deceased,
                          inactive, opt-out, and contact restrictions have been
                          checked.
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
                  workspace never refreshes NXT or sends letters. New calendar
                  and fiscal periods roll forward automatically; overlapping
                  period/hierarchy changes require a reviewed migration.
                </p>
              </form>
            </>
          )}
          {finalPreview && (
            <FinalPostalLetterDialog
              preview={finalPreview}
              revision={data.revision}
              busy={busy}
              error={error}
              onClose={() => setFinalPreview(null)}
              onConfirm={async () => {
                const result = await act({
                  action: "finalize_postal",
                  householdId: finalPreview.row.householdId,
                  previewToken: finalPreview.token,
                  confirm: true,
                });
                if (result) {
                  setFinalPreview(null);
                  showNewBatch();
                }
              }}
            />
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
                const result = await excludeRecipient({
                  householdId: excluding.householdId,
                  ...values,
                });
                if (result) {
                  setExcluding(null);
                }
              }}
            />
          )}
          {reviewingRecipient && (
            <LetterRecipientDialog
              recipient={
                data.rows.find(
                  (row) => row.householdId === reviewingRecipient.householdId,
                ) || reviewingRecipient
              }
              unavailable={
                !data.rows.some(
                  (row) =>
                    row.householdId === reviewingRecipient.householdId &&
                    row.status === "ready" &&
                    row.recipientReview?.editable,
                )
              }
              draft={recovery.drafts[reviewingRecipient.householdId]}
              onDraftChange={(draft) =>
                recovery.keepDraft(reviewingRecipient.householdId, draft)
              }
              onDiscardDraft={() =>
                recovery.keepDraft(reviewingRecipient.householdId, null)
              }
              conflict={reviewConflict}
              onReloadSaved={() =>
                reloadRecipient(reviewingRecipient.householdId)
              }
              onResolveConflict={resolveReviewConflict}
              initialFocus={reviewFocus}
              channel={channel}
              template={data.templates.find(
                (template) =>
                  template.societyKey === reviewingRecipient.societyKey,
              )}
              busy={busy}
              error={error}
              onClose={() => setReviewingRecipient(null)}
              exclusion={{
                appealSettings: data.exclusionAppeals,
                today: data.today,
                period: data.period,
                disabled: refreshing || !!sendingBatch,
              }}
              onExclude={async (values) => {
                const result = await excludeRecipient({
                  householdId: reviewingRecipient.householdId,
                  ...values,
                });
                if (result) {
                  recovery.clearCheckpoint();
                  setReviewingRecipient(null);
                }
                return result;
              }}
              onSave={async (values) => {
                const result = await saveRecipient({
                  householdId: reviewingRecipient.householdId,
                  reviewToken: reviewingRecipient.recipientReview.token,
                  ...values,
                });
                if (result) {
                  recovery.clearCheckpoint();
                  setReviewingRecipient(null);
                }
              }}
            />
          )}
          {reviewQueue && (
            <RecipientReviewQueue
              items={reviewQueue}
              startIndex={queueStart}
              drafts={recovery.drafts}
              onDraftChange={recovery.keepDraft}
              onDiscardDraft={(id) => recovery.keepDraft(id, null)}
              onPosition={(currentId) =>
                recovery.remember({
                  ids: reviewQueue.map((row) => row.householdId),
                  currentId,
                  channel,
                })
              }
              conflict={reviewConflict}
              onReloadSaved={reloadRecipient}
              onResolveConflict={resolveReviewConflict}
              channel={channel}
              rows={data.rows}
              templates={data.templates}
              busy={busy}
              error={error}
              onNavigate={resolveReviewConflict}
              onSave={saveRecipient}
              onExclude={excludeRecipient}
              exclusion={{
                appealSettings: data.exclusionAppeals,
                today: data.today,
                period: data.period,
                disabled: refreshing || !!sendingBatch,
              }}
              notice={reviewNotice}
              onClose={(saved, total, complete, excluded = 0) => {
                if (complete) recovery.clearCheckpoint();
                setReviewQueue(null);
                setError("");
                setReviewNotice(
                  `${saved} of ${total} recipients saved in this review session. ${excluded ? `${excluded} excluded for this period. Check Excluded for decisions and any NXT updates needing attention. ` : ""}All other recipients are unchanged. No letters were sent or marked ready for delivery.`,
                );
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
