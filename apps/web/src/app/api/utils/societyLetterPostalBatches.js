import { randomUUID, createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import PizZip from "pizzip";
import {
  letterError,
  normalizeLetterAddress,
  normalizeLetterMergeSettings,
} from "@/utils/societyLetters";
import { letterSelectionSummary } from "@/utils/societyLetterBatchSummary";
import { renderSocietyLetter } from "./societyLetterDocuments";
import {
  previewFinalPostalLetter,
  reservePostalLetter,
  syncLetterAppeals,
  assertLetterAppealsComplete,
} from "./societyLetterFinalization";
import {
  convertLetterPdf,
  documentHash,
  postalPdfCapability,
  POSTAL_DOCUMENT_LIMIT,
} from "./societyLetterPdf";
import { readPostalDocument } from "./societyLetterStore";

export const POSTAL_BATCH_LIMIT = 10;
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprint = (state, preview) =>
  hash([
    preview.row,
    preview.appeal,
    preview.hierarchy,
    state.settings,
    state.snapshot.generatedAt,
    state.snapshot.signature,
    state.readiness.policy,
    state.readiness.exclusionPolicy,
  ]);
const stableFingerprint = (state, preview) =>
  hash([
    preview.row,
    preview.appeal,
    preview.hierarchy,
    state.settings,
    state.snapshot.signature,
    state.templates[preview.row.templateVersion],
    state.readiness.policy,
    state.readiness.exclusionPolicy,
  ]);
const comparableRow = (row) => ({
  ...normalizeLetterAddress(row, false),
  ...(row.recipientCandidates
    ? {
        recipientCandidates: row.recipientCandidates.map((candidate) =>
          normalizeLetterAddress(candidate, false),
        ),
      }
    : {}),
});
const mime = (format) =>
  format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function draftFor(state, id) {
  const draft = state.postalDraft;
  if (!draft || draft.id !== id || draft.status !== "draft")
    throw letterError(
      "This draft is no longer open. Reload saved history before continuing.",
      409,
    );
  return draft;
}

function currentEntry(state, definitions, today, entry) {
  const preview = previewFinalPostalLetter(
    state,
    definitions,
    today,
    {
      householdId: entry.householdId,
    },
    entry.row.letterDate,
  );
  const template = state.templates[preview.row.templateVersion];
  // Template versions address the content/settings, unlike DOCX byte hashes:
  // ZIP timestamps can change on re-render even when every letter value is identical.
  const sameTemplateContent =
    template.version ===
    hash([
      template.content,
      template.subject,
      template.emailBody,
      normalizeLetterMergeSettings(template.mergeSettings),
    ]);
  const matches =
    entry.fingerprintVersion === 2
      ? stableFingerprint(state, preview) === entry.fingerprint
      : fingerprint(state, preview) === entry.fingerprint ||
        (isDeepStrictEqual(
          comparableRow(preview.row),
          comparableRow(entry.row),
        ) &&
          isDeepStrictEqual(preview.appeal, entry.appeal) &&
          entry.document?.sourceHash &&
          sameTemplateContent);
  if (!matches)
    throw letterError(
      "Recipient, template, membership, date, or appeal settings changed. Discard this draft and review a new batch. No new appeals were applied.",
      409,
    );
  return preview;
}

export async function startPostalDraft(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
) {
  if (state.postalDraft)
    throw letterError("Finish or discard the saved approval draft first.", 409);
  const ids = body.householdIds;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > POSTAL_BATCH_LIMIT ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string")
  )
    throw letterError(
      `Choose 1-${POSTAL_BATCH_LIMIT} distinct ready households.`,
    );
  if (!["pdf", "docx"].includes(body.format))
    throw letterError("Choose PDF or Word output.");
  const pdf = postalPdfCapability();
  if (body.format === "pdf" && !pdf.enabled)
    throw letterError(
      "Private PDF conversion is not configured. Choose Word explicitly or ask your administrator to finish PDF setup.",
      503,
    );
  if (body.format === "pdf" && ids.length > pdf.maxBatchSize)
    throw letterError(
      `Choose 1-${pdf.maxBatchSize} households for this PDF batch. Word batches remain available.`,
    );
  const members = new Set();
  const entries = ids.map((householdId) => {
    const preview = previewFinalPostalLetter(state, definitions, today, {
      householdId,
    });
    for (const id of preview.row.members) {
      if (members.has(id))
        throw letterError(
          "A constituent appears in more than one selected household. Review membership before approving.",
        );
      members.add(id);
    }
    return {
      householdId,
      fingerprint: stableFingerprint(state, preview),
      fingerprintVersion: 2,
      row: preview.row,
      appeal: preview.appeal,
    };
  });
  const draft = {
    id: randomUUID(),
    status: "draft",
    format: body.format,
    createdAt: new Date().toISOString(),
    createdBy: ctx.user.id,
    entries,
  };
  await store.createPostalDraft(draft);
  return draft.id;
}

export async function preparePostalDocument(
  state,
  definitions,
  today,
  body,
  store,
  convert = convertLetterPdf,
) {
  const draft = structuredClone(draftFor(state, body.draftId));
  const entry = draft.entries.find((e) => e.householdId === body.householdId);
  if (!entry) throw letterError("Choose a recipient from this draft.", 404);
  currentEntry(state, definitions, today, entry);
  if (entry.document) return;
  const rendered = renderSocietyLetter(
    state.templates[entry.row.templateVersion],
    entry.row,
    entry.row.letterDate,
  ).document;
  const bytes = draft.format === "pdf" ? await convert(rendered) : rendered;
  if (!bytes.length || bytes.length > POSTAL_DOCUMENT_LIMIT)
    throw letterError("This document is too large. No appeals were applied.");
  const document = {
    id: randomUUID(),
    householdId: entry.householdId,
    sha256: documentHash(bytes),
    content: bytes.toString("base64"),
  };
  entry.document = {
    id: document.id,
    sha256: document.sha256,
    size: bytes.length,
    format: draft.format,
    sourceHash: documentHash(rendered),
  };
  await store.savePostalDraft(draft, document);
}

export async function savedPostalDocument(metadata, read = readPostalDocument) {
  if (!metadata || !/^[a-f0-9-]{36}$/.test(metadata.id || ""))
    throw letterError("The saved letter document is unavailable.", 409);
  const record = await read(metadata.id);
  const bytes = record ? Buffer.from(record.content, "base64") : null;
  if (
    !bytes ||
    bytes.length !== metadata.size ||
    bytes.length > POSTAL_DOCUMENT_LIMIT ||
    record.sha256 !== metadata.sha256 ||
    documentHash(bytes) !== metadata.sha256
  )
    throw letterError(
      "The saved document could not be verified. No appeals were applied; ask an administrator to check the stored letter.",
      409,
    );
  return {
    bytes,
    mime: mime(metadata.format),
    filename: `society-letter.${metadata.format}`,
  };
}

export async function draftPostalDocument(
  state,
  definitions,
  today,
  body,
  read,
) {
  const draft = draftFor(state, body.draftId);
  const entry = draft.entries.find((e) => e.householdId === body.householdId);
  if (!entry) throw letterError("Draft recipient not found.", 404);
  currentEntry(state, definitions, today, entry);
  return savedPostalDocument(entry.document, read);
}

export async function reviewPostalDocument(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
) {
  const draft = structuredClone(draftFor(state, body.draftId));
  const entry = draft.entries.find((e) => e.householdId === body.householdId);
  if (
    !entry?.document ||
    body.documentHash !== entry.document.sha256 ||
    body.confirm !== true
  )
    throw letterError("Preview and approve the exact saved document first.");
  currentEntry(state, definitions, today, entry);
  entry.reviewedHash = entry.document.sha256;
  entry.reviewedAt = new Date().toISOString();
  entry.reviewedBy = ctx.user.id;
  await store.savePostalDraft(draft);
}

export async function approvePostalDraft(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  read,
) {
  if (body.confirm !== true)
    throw letterError(
      "Confirm the documents and appeal updates for every listed member.",
    );
  const draft = structuredClone(draftFor(state, body.draftId));
  const items = [];
  for (const entry of draft.entries) {
    if (
      !entry.document ||
      (entry.reviewedHash !== entry.document.sha256 &&
        body.approvePreparedDocuments !== true)
    )
      throw letterError(
        "Preview and approve every document before creating the batch.",
      );
    const preview = currentEntry(state, definitions, today, entry);
    await savedPostalDocument(entry.document, read);
    // One explicit batch approval covers the exact prepared documents. Opening
    // each preview again is optional, not a second approval requirement.
    if (entry.reviewedHash !== entry.document.sha256) {
      entry.reviewedHash = entry.document.sha256;
      entry.reviewedBy = ctx.user.id;
      entry.reviewedAt = new Date().toISOString();
    }
    const item = reservePostalLetter(preview, state, today, ctx, draft.id);
    item.postalDocument = entry.document;
    item.postalApproval = {
      batchId: draft.id,
      index: items.length,
      approvedBy: ctx.user.id,
      approvedAt: new Date().toISOString(),
      reviewedBy: entry.reviewedBy,
      reviewedAt: entry.reviewedAt,
    };
    items.push(item);
  }
  const selectionSummary = letterSelectionSummary(state, items);
  for (const item of items) item.selectionSummary = selectionSummary;
  draft.status = "approved";
  draft.approvedBy = ctx.user.id;
  draft.approvedAt = new Date().toISOString();
  await store.approvePostalDraft(draft, items);
  return draft.id;
}

export async function discardPostalDraft(state, body, store) {
  if (body.confirm !== true)
    throw letterError("Confirm discarding this uncreated draft.");
  const draft = structuredClone(draftFor(state, body.draftId));
  draft.status = "cancelled";
  await store.savePostalDraft(draft);
}

export async function updateLetterDates(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
) {
  if (body.confirm !== true)
    throw letterError("Confirm using today's date for all uncreated letters.");
  if ((state.postalDraft?.id || null) !== (body.draftId || null))
    throw letterError(
      "The approval draft changed. Reload before updating dates.",
      409,
    );
  // New previews already use the organization's current date. Finalized history is immutable.
  if (
    !state.postalDraft ||
    state.postalDraft.entries.every((entry) => entry.row.letterDate === today)
  )
    return;
  const draft = structuredClone(draftFor(state, body.draftId));
  draft.entries = draft.entries.map((entry) => {
    const preview = previewFinalPostalLetter(state, definitions, today, {
      householdId: entry.householdId,
    });
    if (
      !isDeepStrictEqual(
        comparableRow({ ...entry.row, letterDate: today }),
        comparableRow(preview.row),
      ) ||
      !isDeepStrictEqual(entry.appeal, preview.appeal)
    )
      throw letterError(
        "More than the date changed. Discard this draft and review the updated letter details; saved recipient choices are kept.",
        409,
      );
    return {
      householdId: entry.householdId,
      fingerprint: stableFingerprint(state, preview),
      fingerprintVersion: 2,
      row: preview.row,
      appeal: preview.appeal,
    };
  });
  draft.dateUpdatedAt = new Date().toISOString();
  draft.dateUpdatedBy = ctx.user.id;
  await store.savePostalDraft(draft);
}

export async function continuePostalBatch(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  sync = syncLetterAppeals,
  read,
) {
  if (body.confirm !== true)
    throw letterError(
      "Confirm continuing the approved batch's appeal updates.",
    );
  const items = state.history
    .filter(
      (i) =>
        i.batchId === body.batchId &&
        i.postalApproval &&
        i.status === "prepared",
    )
    .sort((a, b) => a.postalApproval.index - b.postalApproval.index);
  if (!items.length) throw letterError("Approved postal batch not found.", 404);
  // Never skip over an unresolved household and silently continue writing other records.
  if (
    items.some((i) =>
      i.letterAppeals.members.some((m) => m.status === "uncertain"),
    )
  )
    throw letterError(
      "This batch is paused for an unconfirmed NXT result. Verify the household in Letter history before continuing.",
      409,
    );
  const next = items.find((i) => i.letterAppeals.status !== "complete");
  if (!next) return;
  await savedPostalDocument(next.postalDocument, read);
  await sync(
    state,
    definitions,
    today,
    { action: "continue_letter_appeals", deliveryId: next.id, confirm: true },
    store,
    ctx,
  );
}

export async function postalBatchDownload(items, read) {
  assertLetterAppealsComplete(items);
  const zip = new PizZip();
  let size = 0;
  for (const item of items) {
    const doc = await savedPostalDocument(item.postalDocument, read);
    size += doc.bytes.length;
    if (size > POSTAL_DOCUMENT_LIMIT)
      throw letterError(
        "This batch is too large for one download. Download each saved letter below instead.",
        413,
      );
    zip.file(
      `${item.householdId}-${item.id}.${item.postalDocument.format}`,
      doc.bytes,
    );
  }
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
