import { randomUUID } from "node:crypto";
import sql from "./sql";
import { blackbaudApiFetch } from "./blackbaud";
import { cleanImportText as text, duplicateReason, addressSearchTerms, ImportReviewRequired } from "@/utils/newConstituentImport";
import { normalizeImportMatchCandidate } from "@/utils/importMatchReview";
import { importMatchEvidence, qualifyImportMatchCandidates } from "@/utils/importMatchEvidence";
import { localDuplicateFingerprint, isReviewedLocalDuplicate } from "./importLocalDuplicateEvidence";

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
    name: [candidate.first_name, candidate.middle_name, candidate.last_name].filter(Boolean).join(" ") || candidate.display_name || candidate.org_name,
    firstName: candidate.first_name, lastName: candidate.last_name,
    preferredName: candidate.preferred_name, phone: candidate.primary_phone || candidate.matched_phone,
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

export async function checkClearNonmatch({ input, rowId, runId, credentials, onCandidates, onLocalDuplicate, reviewedCandidateIds = [], reviewedLocalDuplicates = [] }) {
  const reviewed = new Set(reviewedCandidateIds.map(String));
  function hold(message, candidates) {
    const normalized = candidates.map((candidate) => normalizeImportMatchCandidate({ ...candidate, reason: message }));
    if (normalized.some((candidate) => !candidate)) throw new ImportReviewRequired("NXT returned a match without a system ID. Retry the duplicate checks; do not create from incomplete results.");
    const remaining = normalized.filter((candidate) => !reviewed.has(candidate.blackbaudConstituentId));
    if (!remaining.length) return null;
    onCandidates?.(remaining);
    return message;
  }
  let detailCalls = 0;
  const details = new Map();
  async function readDetails(id, suffix = "") {
    const path = `/constituent/v1/constituents/${encodeURIComponent(id)}${suffix}`;
    if (details.has(path)) return details.get(path);
    if (++detailCalls > 20) throw new ImportReviewRequired("NXT returned too many incomplete comparison records. Narrow or correct the source details, then retry duplicate checks. Nothing was created.");
    const result = await blackbaudApiFetch(path, credentials);
    if (suffix) {
      if (!Array.isArray(result?.value) || result.next_link || result.nextLink || Number(result.count) > result.value.length || result.value.some((entry) => !entry || typeof entry !== "object")) {
        throw new ImportReviewRequired("NXT contact comparison was incomplete. Retry duplicate checks before creating a record.");
      }
    } else if (text(result?.id) !== id) throw new ImportReviewRequired("NXT returned an incomplete identity comparison.");
    details.set(path, result);
    return result;
  }
  async function compare(candidates, channel) {
    const qualified = [];
    for (const value of candidates) {
      let candidate = normalizeImportMatchCandidate(value);
      if (!candidate) throw new ImportReviewRequired("NXT returned an incomplete comparison record.");
      const id = candidate.blackbaudConstituentId;
      if (reviewed.has(id)) continue;
      if (importMatchEvidence(input, candidate).rank) { qualified.push(candidate); continue; }
      if (channel === "name" && (!candidate.firstName || !candidate.lastName)) {
        candidate = normalizeImportMatchCandidate(await readDetails(id));
        if (!candidate.firstName || !candidate.lastName) throw new ImportReviewRequired("NXT did not return enough identity information. Retry checks or select the verified record manually.");
      }
      if (channel === "lookup" && !candidate.lookupId) {
        candidate = normalizeImportMatchCandidate(await readDetails(id));
        if (!candidate.lookupId) throw new ImportReviewRequired("NXT did not return the Lookup ID needed for comparison.");
      }
      if (channel === "email") {
        const contacts = (await readDetails(id, "/emailaddresses")).value;
        if (contacts.some((entry) => !text(entry.address))) throw new ImportReviewRequired("NXT returned an incomplete email comparison.");
        for (const contact of contacts) {
          const compared = { ...candidate, email2: text(contact.address).toLowerCase() };
          if (importMatchEvidence(input, compared).rank) { candidate = compared; break; }
        }
      }
      if (channel === "address") {
        // Search may match an old mailing address, not the preferred address
        // shown in the search result. Verify those contacts before dismissing it.
        const contacts = (await readDetails(id, "/addresses")).value;
        if (contacts.some((entry) => !text(entry.address_lines) || !text(entry.postal_code))) throw new ImportReviewRequired("NXT returned an incomplete mailing-address comparison.");
        for (const contact of contacts) {
          const compared = { ...candidate, address: contact.address_lines, postalCode: contact.postal_code };
          if (importMatchEvidence(input, compared).rank) { candidate = compared; break; }
        }
      }
      if (importMatchEvidence(input, candidate).rank) qualified.push(candidate);
    }
    return qualifyImportMatchCandidates(input, qualified);
  }
  if (input.duplicateCheckVersion !== 1) throw new ImportReviewRequired("Prepare a new preview so all mapped duplicate-check fields are included.");
  if (!text(input.firstName) || !text(input.lastName)) throw new ImportReviewRequired("First and last name are required.");
  const addresses = [input, ...(input.addressUpdates || [])].filter((value) => text(value.addressLine1));
  if (addresses.some((value) => !/^\d{5}(?:-?\d{4})?$/.test(text(value.postalCode)))) throw new ImportReviewRequired("Address matching requires a valid US ZIP code; review this address individually.");
  if (text(input.postalCode) && !text(input.addressLine1)) throw new ImportReviewRequired("An address line is required to check this ZIP code.");

  // Include other uploaded rows and prior attempts, even before NXT search indexes
  // a new record. Never automatically repeat an uncertain create operation.
  const localMatch = await findLocalImportDuplicate({ input, rowId, runId, onLocalDuplicate, reviewedLocalDuplicates, credentials });
  if (localMatch) return localMatch;

  for (const id of [text(input.blackbaudConstituentId)].filter(Boolean)) {
    try {
      const result = await blackbaudApiFetch(`/constituent/v1/constituents/${encodeURIComponent(id)}`, credentials);
      if (text(result?.id) !== id) throw new ImportReviewRequired("NXT returned an incomplete ID lookup.");
      const reason = hold("An NXT system ID already exists. Held for review.", qualifyImportMatchCandidates(input, [result]));
      if (reason) return reason;
    } catch (error) {
      if (Number(error.httpStatus) !== 404) throw error;
    }
  }
  if (text(input.lookupId)) {
    const candidates = await search(credentials, { lookup_id: text(input.lookupId) });
    const reason = hold("NXT found a possible lookup ID match. Held for review.", await compare(candidates, "lookup"));
    if (reason) return reason;
  }
  for (const address of [...new Set([input.email, input.email2, ...(input.emailUpdates || []).map((value) => value.address)].map((value) => text(value).toLowerCase()).filter(Boolean))]) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new ImportReviewRequired("An email address needs review before duplicate checking.");
    const candidates = await search(credentials, { email: address });
    const reason = hold("NXT found a possible email match. Held for review.", await compare(candidates, "email"));
    if (reason) return reason;
  }
  const names = await search(credentials, { first_name: text(input.firstName), last_name: text(input.lastName), include_alias: true, include_maiden_name: true });
  const nameReason = hold("NXT found a possible first and last name match. Held for review.", await compare(names, "name"));
  if (nameReason) return nameReason;
  const searchedStreets = new Set();
  for (const address of addresses) {
    const houseNumber = text(address.addressLine1).match(/^\d+[a-z]?\b/i)?.[0];
    if (!houseNumber) throw new ImportReviewRequired("This address needs an individual duplicate review.");
    // Full street searches replace the house-number-only query. Strict search
    // removes phonetic expansion; returned fields still require comparison.
    for (const searchText of addressSearchTerms(address.addressLine1)) {
      if (searchedStreets.has(searchText)) continue;
      searchedStreets.add(searchText);
      const result = await blackbaudApiFetch("/constituent/v1/constituents/search", {
        ...credentials, searchParams: { search_text: searchText, include_inactive: true, strict_search: true, limit: 500 },
      });
      if (!Array.isArray(result?.value) || !Number.isInteger(result.count) || result.count !== result.value.length || result.value.length >= 500 || result.next_link) {
        throw new ImportReviewRequired("The additional NXT address search was incomplete. This row needs review.");
      }
      const reason = hold("NXT found a similar address and matching ZIP first five. Held for review.", await compare(result.value, "address"));
      if (reason) return reason;
    }
  }
  return null;
}

export async function findLocalImportDuplicate({ input, rowId, runId, includePendingUpload = true, onLocalDuplicate, reviewedLocalDuplicates = [], credentials }) {
  const localRows = await sql`
    SELECT id, run_id, row_number, status, create_request_started_at,
      preview->'input' AS input, created_blackbaud_constituent_id,
      'import_row' AS source
    FROM constituency_import_rows
    WHERE id <> ${rowId} AND ((run_id = ${runId} AND ${includePendingUpload} AND status <> 'Skipped') OR create_request_started_at IS NOT NULL
      OR created_blackbaud_constituent_id IS NOT NULL OR status = 'Creating')
    UNION ALL
    SELECT attempt.row_id AS id, saved.run_id, saved.row_number, saved.status,
      attempt.started_at AS create_request_started_at, attempt.input,
      attempt.constituent_id AS created_blackbaud_constituent_id, 'creation_history' AS source
    FROM constituency_import_create_attempts attempt
    LEFT JOIN constituency_import_rows saved ON saved.id = attempt.row_id
    WHERE outcome <> 'rejected'
    ORDER BY id, source
  `;
  const checked = new Set();
  for (const row of localRows) {
    const previous = row.input || {};
    const reason = duplicateReason(input, previous) || duplicateReason(input, { ...previous, blackbaudConstituentId: row.created_blackbaud_constituent_id });
    if (reason) {
      const createdId = text(row.created_blackbaud_constituent_id);
      const started = Boolean(row.create_request_started_at || row.source === "creation_history" || row.status === "Creating");
      const duplicate = {
        rowId: text(row.id), runId: text(row.run_id) || null, rowNumber: Number(row.row_number) || null,
        name: text(previous.constituentName) || [previous.firstName, previous.lastName].map(text).filter(Boolean).join(" ") || "Unnamed saved import row",
        lookupId: text(previous.lookupId) || null,
        systemId: text(previous.blackbaudConstituentId) || null,
        createdConstituentId: createdId || null,
        kind: createdId ? "created" : started ? "unconfirmed_creation" : "pending_row",
        sameRun: text(row.run_id) === text(runId), reason,
        email: [previous.email, previous.email2].map(text).filter(Boolean).join(" / "),
        address: [previous.addressLine1, previous.postalCode].map(text).filter(Boolean).join(", "),
      };
      duplicate.fingerprint = localDuplicateFingerprint(input, row, duplicate.kind);
      if (checked.has(duplicate.fingerprint)) continue;
      checked.add(duplicate.fingerprint);
      if (await isReviewedLocalDuplicate(duplicate, reviewedLocalDuplicates, credentials)) continue;
      onLocalDuplicate?.(duplicate);
      const location = duplicate.runId ? `import #${duplicate.runId}, ${duplicate.rowNumber ? `CSV row ${duplicate.rowNumber}` : `saved row ${duplicate.rowId}`}` : `creation history, saved row ${duplicate.rowId}`;
      const nextStep = duplicate.kind === "pending_row"
        ? "Compare the two CSV rows. If they are the same person, keep one and skip the extra unsent row. For different people, select Review this hold and record your comparison."
        : duplicate.kind === "created"
          ? "An earlier import created a record. Open that NXT record and select Review this hold to compare its current identity before proceeding."
          : "An earlier creation may have been sent. Verify its outcome in NXT before any retry; do not skip it to bypass this safeguard.";
      return `Another import row has a ${reason} (${location}). ${nextStep} No new NXT record was created by this attempt.`;
    }
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
