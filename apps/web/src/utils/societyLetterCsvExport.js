import {
  LETTER_TAGS,
  MAX_COMBINED_LETTER_HOUSEHOLDS,
  dateOnly,
  letterMergeData,
  normalizeLetterMergeSettings,
} from "./societyLetters";
import { letterMergeBlockers } from "./societyLetterDocumentReadiness";
import {
  csvRecipientWording,
  formatCsvLetterDate,
  normalizeCsvFormat,
} from "./societyLetterCsvFormat";

const dateFields = ["letter_date", "period_start", "period_end"];
const metadata = [
  "household_id",
  "member_ids",
  "recipient_id",
  "address_source_id",
  "society_key",
  "period_key",
  "template_version",
  "membership_checked_at",
];
const unsafeCell = (value) =>
  /^\s*[=+@-]/u.test(value) ||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

function csvColumns(template, settings, format) {
  const columns = [];
  const names = new Map();
  function add(name, source, exact = false) {
    const existing = names.get(name.toLowerCase());
    if (existing?.source === source) return;
    if (existing && exact)
      throw new Error(
        "Two Word fields use the same name with different mappings. Correct the saved merge settings first.",
      );
    while (names.has(name.toLowerCase())) name = `app_${name}`;
    const column = { name, source };
    names.set(name.toLowerCase(), column);
    columns.push(column);
  }
  for (const field of template.wordFields?.fields || []) {
    const standardField =
      format &&
      ["addressee", "salutation", "address", "letter_date"].includes(
        String(field.name).toLowerCase(),
      )
        ? field.name.toLowerCase()
        : null;
    const source =
      format &&
      format.greetingField !== "saved" &&
      field.name === format.greetingField
        ? "salutation"
        : standardField ||
          settings.wordBindings?.[field.name] ||
          field.suggestedField;
    if (
      !/^[A-Za-z][A-Za-z0-9_ .-]{0,79}$/.test(field.name) ||
      !LETTER_TAGS.includes(source)
    )
      throw new Error(
        "Map every field in this society's saved Word letter before exporting.",
      );
    add(field.name, source, true);
  }
  if (format && format.greetingField !== "saved")
    add(format.greetingField, "salutation", true);
  for (const field of LETTER_TAGS) add(field, field);
  for (const field of metadata) add(`app_${field}`, `metadata:${field}`);
  return columns;
}

// This is a saved-data export, not delivery authorization. Use the workspace's
// existing hierarchy, exclusions and review validity, but never request NXT writes.
export function societyLetterCsvPlan(
  workspace,
  societyKey,
  letterDate,
  csvFormat,
) {
  const result = { columns: [], entries: [], omitted: [], issue: "" };
  const fail = (issue) => ({ ...result, issue });
  if (!societyKey) return fail("Choose a society to export.");
  if (
    workspace.settings?.sourceMode !== "society_queries" ||
    !workspace.setup?.membershipCurrent
  )
    return fail(
      "Save source settings and finish a membership refresh for this period before exporting.",
    );
  if (
    !workspace.settings.societyKeys?.includes(societyKey) ||
    !workspace.definitions?.some((item) => item.key === societyKey)
  )
    return fail("Choose a configured annual giving society.");
  if (!dateOnly(letterDate) || dateOnly(letterDate) !== letterDate)
    return fail("Choose a valid letter date.");
  const rows = workspace.rows || [];
  if (rows.length > MAX_COMBINED_LETTER_HOUSEHOLDS)
    return fail(
      `The saved results exceed ${MAX_COMBINED_LETTER_HOUSEHOLDS.toLocaleString()} households. Review the source before exporting.`,
    );
  const template = workspace.templates?.find(
    (item) => item.societyKey === societyKey,
  );
  if (!template?.version)
    return fail("Save this society's Word letter and merge settings first.");
  let settings, formattedDates, format;
  try {
    format =
      csvFormat === undefined ? undefined : normalizeCsvFormat(csvFormat);
    settings = normalizeLetterMergeSettings(template.mergeSettings);
    result.columns = csvColumns(template, settings, format);
    formattedDates = letterMergeData({ period: workspace.period }, letterDate, {
      fields: dateFields,
      dateFormat: settings.dateFormat,
    });
    if (format)
      formattedDates.letter_date = formatCsvLetterDate(
        letterDate,
        format.dateFormat,
      );
  } catch (error) {
    return fail(error.message || "Check the saved letter's merge settings.");
  }
  const requiredFields = [
    ...new Set([
      "addressee",
      "salutation",
      "address",
      ...(template.usedFields || []),
      ...(template.wordFields?.fields || []).map(
        (field) => settings.wordBindings?.[field.name] || field.suggestedField,
      ),
    ]),
  ];
  const identities = new Map();
  for (const row of rows) {
    for (const key of new Set([
      `household:${row.householdId}`,
      ...(row.members || []).map((id) => `member:${id}`),
    ]))
      identities.set(key, (identities.get(key) || 0) + 1);
  }
  const draftIds = new Set(
    workspace.postalDraft?.entries?.map((entry) => entry.householdId) || [],
  );
  for (const row of rows.filter((item) => item.societyKey === societyKey)) {
    let reason = "";
    if (row.period?.key !== workspace.period?.key)
      reason = "Qualification period does not match.";
    else if (row.status !== "ready")
      reason =
        {
          excluded: "Excluded for this period.",
          held: "A letter is already in progress. Use Letter history.",
          covered: "Already covered for this period.",
        }[row.status] || "This recipient needs attention.";
    else if (draftIds.has(row.householdId))
      reason =
        "Already in document approval. Finish or discard that draft first.";
    else if (row.recipientReview?.status !== "saved")
      reason =
        row.recipientReview?.reason === "expired"
          ? "Review is over 15 days old. Review and save again."
          : "Review and save recipient choices first.";
    else if (
      !row.householdId ||
      !row.members?.length ||
      new Set(row.members).size !== row.members.length ||
      !row.members.every((id) => typeof id === "string" && /^\d+$/.test(id)) ||
      identities.get(`household:${row.householdId}`) !== 1 ||
      row.members.some((id) => identities.get(`member:${id}`) !== 1)
    )
      reason =
        "Household membership is incomplete or appears more than once. Review the source.";
    else if (row.documentReadiness?.status !== "ready")
      reason =
        row.documentReadiness?.blockers?.[0]?.message ||
        "Check this recipient's saved letter fields.";
    let wording;
    if (!reason && format) {
      try {
        wording = csvRecipientWording(row, format);
      } catch (error) {
        reason = error.message;
      }
    }
    const missing = reason
      ? []
      : letterMergeBlockers({ ...row, ...wording }, requiredFields);
    if (missing.length) reason = missing[0].message;
    if (!reason) {
      const values = {
        ...letterMergeData(row, letterDate, {
          fields: LETTER_TAGS,
          dateFormat: "iso",
        }),
        ...formattedDates,
        ...wording,
      };
      const details = {
        household_id: row.householdId,
        member_ids: row.members.join("|"),
        recipient_id: row.recipientConstituentId || "",
        address_source_id: row.addressConstituentId || "",
        society_key: row.societyKey,
        period_key: row.period.key,
        template_version: template.version,
        membership_checked_at: workspace.refreshedAt || "",
      };
      const cells = result.columns.map(({ source }) =>
        String(
          source.startsWith("metadata:")
            ? (details[source.slice(9)] ?? "")
            : (values[source] ?? ""),
        ),
      );
      const unsafeIndex = cells.findIndex(unsafeCell);
      if (unsafeIndex !== -1)
        reason = `The ${result.columns[unsafeIndex].name} value starts like a spreadsheet formula or contains unsupported control characters. Review it before exporting; no wording was changed.`;
      else
        result.entries.push({
          householdId: row.householdId,
          cells,
          ...(wording ? { wording } : {}),
        });
    }
    if (reason)
      result.omitted.push({
        householdId: row.householdId,
        name: row.name || row.householdId,
        reason,
      });
  }
  return result;
}

export function societyLetterCsvFilename(societyKey, letterDate) {
  const society =
    String(societyKey)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "society";
  return `${society}-${letterDate}-mail-merge.csv`;
}
