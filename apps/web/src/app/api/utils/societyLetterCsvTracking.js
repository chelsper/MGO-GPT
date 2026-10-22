import { createHash, randomUUID } from "node:crypto";
import { letterError } from "@/utils/societyLetters";
import { societyLetterCsvPlan } from "@/utils/societyLetterCsvExport";
import { normalizeCsvFormat } from "@/utils/societyLetterCsvFormat";
import { selectedCsvLetters } from "@/utils/societyLetterCsvTracking";
import { LETTER_APPEAL_SELECTION_LIMIT } from "@/utils/societyLetterBulkAppeals";
import { exportSocietyLetterCsv } from "./societyLetterCsvExport";
import { letterWorkspace } from "./societyLetterWorkflow";
import {
  previewPostalLetterData,
  reservePostalLetter,
} from "./societyLetterFinalization";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (columns, entry) =>
  hash(
    JSON.stringify(
      columns.flatMap((column, index) =>
        column.source === "metadata:membership_checked_at"
          ? []
          : [[column, entry.cells[index]]],
      ),
    ),
  );

export function csvRunSummary(run) {
  const {
    id,
    societyKey,
    societyName,
    periodKey,
    letterDate,
    createdAt,
    createdBy,
    count,
    filename,
    sha256,
  } = run;
  return {
    id,
    societyKey,
    societyName,
    periodKey,
    letterDate,
    createdAt,
    createdBy,
    count,
    filename,
    sha256,
    ...(run.csvFormat ? { csvFormat: run.csvFormat } : {}),
  };
}

export async function saveCsvFormat(state, definitions, body, store) {
  if (
    !state.settings?.societyKeys?.includes(body.societyKey) ||
    !definitions.some(
      (item) =>
        item.key === body.societyKey && item.active && item.basis === "annual",
    )
  )
    throw letterError("Choose a configured annual giving society.");
  const csvFormat = normalizeCsvFormat(body.csvFormat);
  await store.save({
    ...state,
    csv_formats: { ...(state.csv_formats || {}), [body.societyKey]: csvFormat },
  });
}

export function assertCsvRun(run) {
  if (
    !run ||
    typeof run.csv !== "string" ||
    hash(run.csv) !== run.sha256 ||
    !Array.isArray(run.entries) ||
    run.entries.length !== run.count ||
    new Set(run.entries.map((entry) => entry.householdId)).size !== run.count
  )
    throw letterError(
      "The saved CSV is missing or changed. Do not apply appeals from an unverified export.",
      409,
    );
  return run;
}

// Read-only feedback for the saved-export picker. Confirmation still rechecks
// every selected row under the workflow lease before reserving any letters.
export function csvRunReview(state, definitions, today, run) {
  assertCsvRun(run);
  const workspace = letterWorkspace(state, definitions, today);
  const plan = societyLetterCsvPlan(
    workspace,
    run.societyKey,
    run.letterDate,
    run.csvFormat,
  );
  const current = new Map(
    plan.entries.map((entry) => [entry.householdId, entry]),
  );
  const omitted = new Map(
    plan.omitted.map((entry) => [entry.householdId, entry.reason]),
  );
  const receipts = new Map();
  for (const item of state.history) {
    if (item.csvMailMerge?.runId !== run.id) continue;
    if (!receipts.has(item.householdId)) receipts.set(item.householdId, []);
    receipts.get(item.householdId).push(item);
  }
  return {
    ...csvRunSummary(run),
    entries: run.entries.map((saved) => {
      const own = receipts.get(saved.householdId) || [];
      let confirmationIssue = "";
      if (own.some((item) => item.status === "cancelled"))
        confirmationIssue =
          "Returned to review. Use a new tracked CSV after correcting the recipient.";
      else if (!own.length) {
        const entry = current.get(saved.householdId);
        confirmationIssue =
          run.periodKey !== workspace.period?.key
            ? "This export belongs to another recognition period. Use Letter history for letters already recorded."
            : plan.issue ||
              omitted.get(saved.householdId) ||
              (!entry || fingerprint(plan.columns, entry) !== saved.fingerprint
                ? "Letter fields or qualification changed since this export. Use a new tracked CSV for this recipient; do not mail their old merge."
                : "");
      }
      return {
        householdId: saved.householdId,
        name: saved.name,
        confirmationIssue,
      };
    }),
  };
}

export async function createTrackedCsvRun(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
) {
  const workspace = letterWorkspace(state, definitions, today);
  const exported = exportSocietyLetterCsv(workspace, body);
  const plan = societyLetterCsvPlan(
    workspace,
    body.societyKey,
    body.letterDate,
    body.csvFormat,
  );
  const run = {
    id: randomUUID(),
    ...exported,
    sha256: hash(exported.csv),
    societyKey: body.societyKey,
    societyName: workspace.definitions.find(
      (item) => item.key === body.societyKey,
    )?.name,
    periodKey: workspace.period.key,
    letterDate: body.letterDate,
    ...(body.csvFormat !== undefined
      ? { csvFormat: normalizeCsvFormat(body.csvFormat) }
      : {}),
    createdAt: new Date().toISOString(),
    createdBy: ctx.user.id,
    entries: plan.entries.map((entry) => ({
      householdId: entry.householdId,
      name: workspace.rows.find((row) => row.householdId === entry.householdId)
        ?.name,
      fingerprint: fingerprint(plan.columns, entry),
    })),
  };
  await store.createCsvRun(run, csvRunSummary(run));
  return run.id;
}

export async function confirmCsvLetters(
  state,
  definitions,
  today,
  body,
  store,
  ctx,
  run,
) {
  if (body.confirm !== true || body.automatic)
    throw letterError(
      "Confirm that you created and checked the selected letters in Word first.",
    );
  assertCsvRun(run);
  if (run.id !== body.runId || run.sha256 !== body.sha256)
    throw letterError(
      "The CSV selection changed. Reload the saved export.",
      409,
    );
  const ids = body.householdIds;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > LETTER_APPEAL_SELECTION_LIMIT ||
    ids.some((id) => typeof id !== "string" || !id) ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !run.entries.some((entry) => entry.householdId === id))
  )
    throw letterError("Select up to 50 households from this saved CSV.");
  const workspace = letterWorkspace(state, definitions, today);
  if (run.periodKey !== workspace.period?.key)
    throw letterError(
      "This CSV belongs to a different recognition period. Use Letter history for letters already recorded.",
      409,
    );
  const plan = societyLetterCsvPlan(
    workspace,
    run.societyKey,
    run.letterDate,
    run.csvFormat,
  );
  const batchId = randomUUID();
  const pending = [],
    deliveries = [];
  for (const id of ids) {
    const saved = run.entries.find((entry) => entry.householdId === id);
    if (
      state.history.some(
        (item) =>
          item.status === "cancelled" &&
          item.householdId === id &&
          item.csvMailMerge?.runId === run.id,
      )
    )
      throw letterError(
        `${saved.name}: this CSV letter was returned to review. Use a new tracked export after correcting the recipient.`,
        409,
      );
    // An interrupted confirmation resumes its durable reservation, never creates
    // a second letter or silently retries an uncertain NXT submission.
    const existing = state.history.filter(
      (item) =>
        item.status !== "cancelled" &&
        item.householdId === id &&
        item.csvMailMerge?.runId === run.id,
    );
    if (
      existing.length === 1 &&
      existing[0].csvMailMerge.csvSha256 === run.sha256
    ) {
      deliveries.push(existing[0]);
      continue;
    }
    const entry = plan.entries.find((item) => item.householdId === id);
    if (
      existing.length ||
      plan.issue ||
      !entry ||
      fingerprint(plan.columns, entry) !== saved.fingerprint
    )
      throw letterError(
        `${saved.name}: the saved review, qualification, template, or letter fields changed. Review this recipient and download a new tracked CSV before confirming their letter. Nothing was submitted.`,
        409,
      );
    const preview = previewPostalLetterData(
      state,
      definitions,
      today,
      { householdId: id },
      run.letterDate,
    );
    const item = reservePostalLetter(preview, state, today, ctx, batchId);
    if (entry.wording) {
      item.addressee = entry.wording.addressee;
      item.salutation = entry.wording.salutation;
    }
    item.csvMailMerge = {
      runId: run.id,
      csvSha256: run.sha256,
      confirmedAt: new Date().toISOString(),
      confirmedBy: ctx.user.id,
      ...(run.csvFormat
        ? { csvFormat: run.csvFormat, wording: entry.wording }
        : {}),
    };
    pending.push(item);
    deliveries.push(item);
  }
  // Validate the entire selection first, then reserve atomically, before any NXT
  // request. The existing appeal worker processes these receipts separately.
  if (pending.length) await store.reserve(pending);
  return deliveries
    .filter((item) => item.status === "prepared")
    .map((item) => item.id);
}

export async function mailSelectedCsvLetters(state, body, store) {
  if (body.confirm !== true || body.automatic)
    throw letterError(
      "Confirm the selected letters were physically dispatched by postal mail.",
    );
  const items = selectedCsvLetters(
    state.history,
    body.batchId,
    body.deliveryIds,
  );
  await store.mailSelectedLetters(body.batchId, items, "csv");
}
