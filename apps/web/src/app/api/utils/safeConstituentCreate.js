import { randomUUID } from "node:crypto";
import sql from "./sql";
import { blackbaudApiFetch } from "./blackbaud";
import { cleanImportText as text, duplicateReason, addressSearchTerms, ImportReviewRequired } from "@/utils/newConstituentImport";

const SEARCH = "/nxt-data-integration/v1/re/constituents/customsearch";
const LIMIT = 1000;

export async function claimConstituentCreateLease() {
  const token = randomUUID();
  const rows = await sql`
    INSERT INTO constituency_import_create_lock (id, token, expires_at)
    VALUES (1, ${token}, NOW() + INTERVAL '3 minutes')
    ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
    WHERE constituency_import_create_lock.expires_at < NOW()
    RETURNING token
  `;
  return rows.length ? token : null;
}

export async function renewConstituentCreateLease(token) {
  const rows = await sql`
    UPDATE constituency_import_create_lock SET expires_at = NOW() + INTERVAL '1 minute'
    WHERE id = 1 AND token = ${token} AND expires_at > NOW() RETURNING token
  `;
  if (!rows.length) throw new Error("The creation lock expired. No create request was sent; review this row before retrying.");
}

export async function releaseConstituentCreateLease(token) {
  await sql`DELETE FROM constituency_import_create_lock WHERE id = 1 AND token = ${token}`;
}

export async function markConstituentCreateStarted(rowId, preview) {
  // This independent, immutable input ledger survives preview replacement and
  // row corrections. A unique row key also makes a second attempt fail closed.
  const rows = await sql`
    WITH claimed AS (
      UPDATE constituency_import_rows SET create_request_started_at = NOW()
      WHERE id = ${rowId} AND status = 'Creating' AND create_request_started_at IS NULL
        AND created_blackbaud_constituent_id IS NULL AND preview = ${JSON.stringify(preview)}::jsonb
      RETURNING id, preview
    )
    INSERT INTO constituency_import_create_attempts (row_id, input)
    SELECT id, preview->'input' FROM claimed WHERE true
    ON CONFLICT (row_id) DO UPDATE SET input = EXCLUDED.input, started_at = NOW(), outcome = 'unconfirmed'
    WHERE constituency_import_create_attempts.outcome = 'rejected'
    RETURNING row_id
  `;
  if (!rows.length) throw new Error("The row changed before creation. No create request was sent.");
}

export async function recordCreatedConstituent(rowId, constituentId) {
  await sql`UPDATE constituency_import_create_attempts SET constituent_id = ${constituentId}, outcome = 'created' WHERE row_id = ${rowId}`;
}

export async function recordRejectedConstituentCreate(rowId) {
  await sql`
    WITH rejected AS (
      UPDATE constituency_import_create_attempts SET outcome = 'rejected'
      WHERE row_id = ${rowId} AND constituent_id IS NULL RETURNING row_id
    )
    UPDATE constituency_import_rows SET create_request_started_at = NULL
    WHERE id IN (SELECT row_id FROM rejected) AND created_blackbaud_constituent_id IS NULL
  `;
}

function candidateInput(candidate) {
  if (!candidate || !text(candidate.record_id)) throw new ImportReviewRequired("NXT returned an incomplete duplicate-search result.");
  return {
    blackbaudConstituentId: text(candidate.record_id), lookupId: candidate.constituent_id,
    firstName: candidate.first_name, lastName: candidate.last_name,
    email: candidate.primary_email, email2: candidate.matched_email,
    addressLine1: text(candidate.address_block).split(/\r?\n/)[0], postalCode: candidate.address_post_code,
  };
}

async function search(credentials, params) {
  const result = await blackbaudApiFetch(SEARCH, { ...credentials, searchParams: { ...params, limit: LIMIT } });
  if (!Array.isArray(result?.results) || result.results.length >= LIMIT || result.next_link || result.nextLink || Number(result.count) > result.results.length) {
    throw new ImportReviewRequired("NXT duplicate search was incomplete or too broad. This row needs review.");
  }
  return result.results.map(candidateInput);
}

export async function checkClearNonmatch({ input, rowId, runId, credentials }) {
  if (input.duplicateCheckVersion !== 1) throw new ImportReviewRequired("Prepare a new preview so all mapped duplicate-check fields are included.");
  if (!text(input.firstName) || !text(input.lastName)) throw new ImportReviewRequired("First and last name are required.");
  if (text(input.addressLine1) && !/^\d{5}(?:-?\d{4})?$/.test(text(input.postalCode))) throw new ImportReviewRequired("Address matching requires a valid US ZIP code; review this address individually.");
  if (text(input.postalCode) && !text(input.addressLine1)) throw new ImportReviewRequired("An address line is required to check this ZIP code.");

  // Include other uploaded rows and prior attempts, even before NXT search indexes
  // a new record. Never automatically repeat an uncertain create operation.
  const localMatch = await findLocalImportDuplicate({ input, rowId, runId });
  if (localMatch) return localMatch;

  for (const id of [...new Set([input.blackbaudConstituentId, /^\d+$/.test(text(input.lookupId)) ? input.lookupId : ""].map(text).filter(Boolean))]) {
    try {
      const result = await blackbaudApiFetch(`/constituent/v1/constituents/${encodeURIComponent(id)}`, credentials);
      if (!text(result?.id)) throw new ImportReviewRequired("NXT returned an incomplete ID lookup.");
      return "An NXT system ID already exists. Held for review.";
    } catch (error) {
      if (Number(error.httpStatus) !== 404) throw error;
    }
  }
  if (text(input.lookupId) && (await search(credentials, { lookup_id: text(input.lookupId) })).length) return "NXT found a possible lookup ID match. Held for review.";
  for (const address of [...new Set([input.email, input.email2].map((value) => text(value).toLowerCase()).filter(Boolean))]) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new ImportReviewRequired("An email address needs review before duplicate checking.");
    if ((await search(credentials, { email: address })).length) return "NXT found a possible email match. Held for review.";
  }
  if ((await search(credentials, { first_name: text(input.firstName), last_name: text(input.lastName), include_alias: true, include_maiden_name: true })).length) return "NXT found a possible first and last name match. Held for review.";
  if (text(input.addressLine1)) {
    // Search on the house number, not the full address or exact ZIP: spelling,
    // street abbreviations and ZIP+4 must not hide a potential match.
    const houseNumber = text(input.addressLine1).match(/^\d+[a-z]?\b/i)?.[0];
    if (!houseNumber) throw new ImportReviewRequired("This address needs an individual duplicate review.");
    const candidates = await search(credentials, { address_lines: houseNumber });
    for (const candidate of candidates) {
      if (!text(candidate.addressLine1) || !text(candidate.postalCode)) throw new ImportReviewRequired("NXT did not return enough address information to rule out a duplicate.");
      if (duplicateReason(input, candidate)) return "NXT found a similar address and matching ZIP first five. Held for review.";
    }
    // Enhanced search may display the preferred address rather than the
    // address that matched. Do not clear a candidate using that display alone.
    if (candidates.length) return "NXT found possible address matches. Review their ZIP codes and other addresses before creating this record.";
    // NXT's general search requires digits followed by street text to trigger
    // address searching. Cover that path too, including common abbreviations.
    // https://community.blackbaud.com/discussion/50765/constituent-search-not-updating-addresses
    for (const searchText of addressSearchTerms(input.addressLine1)) {
      const result = await blackbaudApiFetch("/constituent/v1/constituents/search", {
        ...credentials, searchParams: { search_text: searchText, include_inactive: true, strict_search: false, limit: 500 },
      });
      if (!Array.isArray(result?.value) || !Number.isInteger(result.count) || result.count !== result.value.length || result.value.length >= 500 || result.next_link) {
        throw new ImportReviewRequired("The additional NXT address search was incomplete. This row needs review.");
      }
      if (result.value.length) return "NXT found a possible mailing-address match. Held for ZIP and duplicate review.";
    }
  }
  return null;
}

export async function findLocalImportDuplicate({ input, rowId, runId, includePendingUpload = true }) {
  const localRows = await sql`
    SELECT id, preview->'input' AS input, created_blackbaud_constituent_id FROM constituency_import_rows
    WHERE id <> ${rowId} AND ((run_id = ${runId} AND ${includePendingUpload}) OR create_request_started_at IS NOT NULL
      OR created_blackbaud_constituent_id IS NOT NULL OR status = 'Creating')
    UNION ALL
    SELECT row_id AS id, input, constituent_id AS created_blackbaud_constituent_id
    FROM constituency_import_create_attempts WHERE outcome <> 'rejected'
  `;
  for (const row of localRows) {
    const previous = row.input || {};
    const reason = duplicateReason(input, previous) || duplicateReason(input, { ...previous, blackbaudConstituentId: row.created_blackbaud_constituent_id });
    if (reason) return `Another import row has a ${reason}. Held for review; no NXT record was created.`;
  }

  return null;
}

export async function getNameFormatConfigurations(credentials) {
  const result = await blackbaudApiFetch("/constituent/v1/nameformatconfigurations", credentials);
  if (!Array.isArray(result?.value) || Number(result.count) > result.value.length || result.value.some((entry) => !text(entry?.id) || !text(entry?.format))) {
    throw new ImportReviewRequired("NXT name format configurations could not be loaded completely.");
  }
  return result.value.map((entry) => ({ id: text(entry.id), format: text(entry.format) }));
}

export async function configuredNameFormatPayload(input, credentials) {
  const selected = input.newRecordNameFormats || {};
  if (!text(selected.addressee) && !text(selected.salutation)) return {};
  const formats = await getNameFormatConfigurations(credentials);
  const payload = {};
  for (const kind of ["addressee", "salutation"]) {
    const id = text(selected[kind]);
    if (!id) continue;
    if (!formats.some((format) => format.id === id)) throw new ImportReviewRequired("The selected NXT name format no longer exists. Choose a current table format.");
    if (text(input.nameFormatUpdate?.[kind])) throw new ImportReviewRequired("Choose either an NXT table format or a custom name format, not both.");
    payload[`primary_${kind}`] = { custom_format: false, configuration_id: id };
  }
  return payload;
}
