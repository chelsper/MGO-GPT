import {
  BlackbaudQueryResultTooLargeError,
  downloadBlackbaudQueryResultWithMetadata,
} from "./blackbaud";
import { decodeResult, visitResultCsv } from "./dashboardQueryResults";
import {
  isValidDashboardTableData,
  QUERY_RESULTS_LIMITS,
} from "./dashboardConfiguration";
import {
  CONSTITUENT_LETTER_COLUMNS,
  letterError,
} from "@/utils/societyLetters";
import {
  ORGANIZATION_CONTACT_COLUMNS,
  organizationContactsFromRow,
  mergeOrganizationContacts,
  validateOrganizationContactColumns,
} from "@/utils/societyLetterContacts";

export const SOCIETY_CONSTITUENT_RESULT_LIMITS = Object.freeze({
  bytes: 12 * 1024 * 1024,
  rawRows: 100000,
  constituents: 1000,
  emailCandidates: 20,
});
const validId = (value) => /^[1-9]\d{0,18}$/.test(value);
const boundedError = (message) =>
  letterError(`${message} No partial membership was saved.`, 413);

export function deduplicateSocietyConstituentCsv(content, settings) {
  validateOrganizationContactColumns(settings.columns || {});
  const configured = Object.entries(CONSTITUENT_LETTER_COLUMNS)
    .map(([key]) => [key, settings.columns?.[key]])
    .filter(([, column]) => column);
  const headers = [...new Set(configured.map(([, column]) => column))];
  const contactColumns = configured.filter(
    ([key]) => key in ORGANIZATION_CONTACT_COLUMNS,
  );
  const idIndex = headers.indexOf(settings.columns?.constituentId);
  const spouseIndex = headers.indexOf(settings.columns?.spouseId);
  const emailIndex = settings.columns?.email
    ? headers.indexOf(settings.columns.email)
    : -1;
  if (idIndex < 0 || spouseIndex < 0 || idIndex === spouseIndex)
    throw letterError(
      "Map distinct constituent and spouse System Record ID columns before refreshing.",
    );
  if (
    emailIndex >= 0 &&
    configured.some(
      ([key, column]) => key !== "email" && column === settings.columns.email,
    )
  )
    throw letterError(
      "The email output column cannot also be mapped to another letter field.",
    );

  const records = new Map();
  if (
    contactColumns.some(
      ([, column]) =>
        configured.filter(([, value]) => value === column).length !== 1,
    )
  )
    throw letterError(
      "Map contact fields to distinct query output columns, separate from constituent IDs and other recipient details.",
    );
  let indexes;
  let retainedBytes = 0;
  const { rowCount } = visitResultCsv(content, {
    maxRows: SOCIETY_CONSTITUENT_RESULT_LIMITS.rawRows,
    onHeaders(returned) {
      indexes = headers.map((column) => {
        const index = returned.indexOf(column);
        if (index < 0)
          throw letterError(
            `The mapped output column "${column}" was not returned. Review source settings.`,
          );
        return index;
      });
    },
    onRow(values) {
      const row = indexes.map((index) => values[index].trim());
      const id = row[idIndex],
        spouse = row[spouseIndex];
      if (!validId(id) || (spouse && (!validId(spouse) || spouse === id)))
        throw letterError(
          "The query contains an invalid constituent or spouse System Record ID. No identities were inferred.",
        );
      const email = emailIndex < 0 ? "" : row[emailIndex];
      if (emailIndex >= 0) row[emailIndex] = "";
      const contactRow = Object.fromEntries(
        contactColumns.map(([key, column]) => {
          const i = headers.indexOf(column);
          const value = row[i];
          row[i] = "";
          return [key, value];
        }),
      );
      const previous = records.get(id);
      if (previous && previous.row.some((value, index) => value !== row[index]))
        throw letterError(
          `Constituent ${id} has conflicting spouse, name, greeting, or mailing details. Review the query output; no record was chosen arbitrarily.`,
        );
      if (
        !previous &&
        records.size >= SOCIETY_CONSTITUENT_RESULT_LIMITS.constituents
      )
        throw boundedError(
          "The society query exceeds 1,000 unique constituents.",
        );
      const record = previous || { row, emails: new Set() };
      if (!previous) retainedBytes += Buffer.byteLength(JSON.stringify(row));
      if (contactColumns.length) {
        const before = record.organizationContacts
          ? Buffer.byteLength(JSON.stringify(record.organizationContacts))
          : 0;
        record.organizationContacts = mergeOrganizationContacts(
          record.organizationContacts,
          organizationContactsFromRow(contactRow),
        );
        retainedBytes +=
          Buffer.byteLength(JSON.stringify(record.organizationContacts)) -
          before;
      }
      if (email && !record.emails.has(email)) {
        if (
          record.emails.size >=
          SOCIETY_CONSTITUENT_RESULT_LIMITS.emailCandidates
        )
          throw boundedError(
            `Constituent ${id} has more than 20 email values.`,
          );
        record.emails.add(email);
        retainedBytes += Buffer.byteLength(JSON.stringify(email));
      }
      if (retainedBytes > QUERY_RESULTS_LIMITS.bytes)
        throw boundedError("The deduplicated society output exceeds 512 KB.");
      records.set(id, record);
    },
  });
  const emailCandidates = {};
  const organizationContacts = {};
  const rows = [...records.entries()].map(([id, record]) => {
    const emails = [...record.emails].sort();
    if (emailIndex >= 0)
      record.row[emailIndex] = emails.length === 1 ? emails[0] : "";
    if (emails.length > 1) emailCandidates[id] = emails;
    if (record.organizationContacts)
      organizationContacts[id] = record.organizationContacts;
    return record.row;
  });
  const table = {
    headers,
    rows,
    metadata: {
      emailCandidates,
      ...(contactColumns.length ? { organizationContacts } : {}),
      deduplication: {
        rawRows: rowCount,
        uniqueConstituents: rows.length,
        repeatedRows: rowCount - rows.length,
      },
    },
  };
  if (
    !isValidDashboardTableData({ headers, rows }) ||
    Buffer.byteLength(JSON.stringify(table)) > QUERY_RESULTS_LIMITS.bytes
  )
    throw boundedError(
      "The deduplicated society output exceeds the supported table size.",
    );
  return table;
}

export async function readSocietyConstituentQueryResult(
  url,
  context,
  settings,
  expectedRows,
) {
  try {
    const file = await downloadBlackbaudQueryResultWithMetadata(url, {
      ...context,
      maxBytes: SOCIETY_CONSTITUENT_RESULT_LIMITS.bytes,
      redirect: "error",
    });
    const table = deduplicateSocietyConstituentCsv(
      decodeResult(file, { maxBytes: SOCIETY_CONSTITUENT_RESULT_LIMITS.bytes }),
      settings,
    );
    if (
      expectedRows !== undefined &&
      expectedRows !== null &&
      (!/^\d+$/.test(String(expectedRows)) ||
        !Number.isSafeInteger(Number(expectedRows)) ||
        Number(expectedRows) !== table.metadata.deduplication.rawRows)
    )
      throw letterError(
        "The downloaded society result does not match NXT's completed row count. No partial membership was saved.",
      );
    return table;
  } catch (error) {
    if (error instanceof BlackbaudQueryResultTooLargeError)
      throw boundedError(
        "The society query file exceeds 12 MB before deduplication. Reduce repeated query output.",
      );
    throw error;
  }
}
