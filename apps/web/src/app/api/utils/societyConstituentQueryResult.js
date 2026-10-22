import { createHash } from "node:crypto";
import {
  BlackbaudQueryResultTooLargeError,
  streamBlackbaudQueryResultWithMetadata,
} from "./blackbaud";
import {
  createResultTextDecoder,
  createResultCsvVisitor,
} from "./dashboardQueryResults";
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
  // A transfer bound, not a buffer size. Only the current CSV row and compacted
  // recipients are retained; the saved output is still limited to 512 KB.
  bytes: 64 * 1024 * 1024,
  rawRows: 100000,
  constituents: 1000,
  emailCandidates: 20,
});
const validId = (value) => /^[1-9]\d{0,18}$/.test(value);
const boundedError = (message) =>
  letterError(`${message} No partial membership was saved.`, 413);

export function deduplicateSocietyConstituentCsv(content, settings) {
  const reader = createSocietyConstituentCsvReader(settings);
  reader.write(content);
  return reader.finish();
}

function createSocietyConstituentCsvReader(settings) {
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
  let diagnosticColumns;
  const varyingOutputFields = new Set();
  const fingerprint = (value) =>
    createHash("sha256").update(value.trim()).digest("hex");
  let retainedBytes = 0;
  const visitor = createResultCsvVisitor({
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
      const identityAndLetterColumns = new Set(
        configured
          .filter(
            ([key]) =>
              key !== "email" && !(key in ORGANIZATION_CONTACT_COLUMNS),
          )
          .map(([, column]) => column),
      );
      diagnosticColumns = returned.flatMap((name, index) =>
        identityAndLetterColumns.has(name) ? [] : [{ name, index }],
      );
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
      // Bounded fingerprints identify varying outputs without retaining or
      // publishing unused gift/contact values. Stable letter fields are already
      // compared above; variations there must block the refresh, not be merged.
      if (!previous)
        record.fieldHashes = diagnosticColumns.map(({ index }) =>
          fingerprint(values[index]),
        );
      else
        diagnosticColumns.forEach(({ name, index }, i) => {
          if (
            !varyingOutputFields.has(name) &&
            record.fieldHashes[i] !== fingerprint(values[index])
          )
            varyingOutputFields.add(name);
        });
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
  return {
    write: visitor.write,
    finish() {
      const { rowCount } = visitor.finish();
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
            varyingOutputFields: [...varyingOutputFields].sort(),
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
    },
  };
}

export async function readSocietyConstituentQueryResult(
  url,
  context,
  settings,
  expectedRows,
) {
  if (
    !/^\d+$/.test(String(expectedRows)) ||
    !Number.isSafeInteger(Number(expectedRows))
  ) {
    throw letterError(
      "NXT did not return a valid completed row count. No partial membership was saved.",
    );
  }
  if (Number(expectedRows) > SOCIETY_CONSTITUENT_RESULT_LIMITS.rawRows) {
    throw boundedError(
      "The society query exceeds 100,000 raw rows. Reduce repeated query output.",
    );
  }
  try {
    const reader = createSocietyConstituentCsvReader(settings);
    const { result: table } = await streamBlackbaudQueryResultWithMetadata(
      url,
      {
        ...context,
        maxBytes: SOCIETY_CONSTITUENT_RESULT_LIMITS.bytes,
        redirect: "error",
      },
      ({ contentType }) => {
        const decoder = createResultTextDecoder(contentType);
        return {
          write(chunk) {
            reader.write(decoder.decode(chunk, { stream: true }));
          },
          finish() {
            reader.write(decoder.decode());
            return reader.finish();
          },
        };
      },
    );
    if (Number(expectedRows) !== table.metadata.deduplication.rawRows)
      throw letterError(
        "The downloaded society result does not match NXT's completed row count. No partial membership was saved.",
      );
    return table;
  } catch (error) {
    if (error instanceof BlackbaudQueryResultTooLargeError)
      throw boundedError(
        "The society query exceeds the 64 MB streamed download limit. Reduce repeated query output.",
      );
    throw error;
  }
}
