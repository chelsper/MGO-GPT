import { createHash } from "node:crypto";
import { blackbaudApiFetch } from "./blackbaud";
import { normalizeImportMatchCandidate } from "@/utils/importMatchReview";
import { ImportReviewRequired } from "@/utils/newConstituentImport";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function duplicateEvidenceFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function localDuplicateFingerprint(input, row, kind) {
  return duplicateEvidenceFingerprint({ version: 1, input, rowId: String(row.id),
    previousInput: row.input || {}, kind, createdId: String(row.created_blackbaud_constituent_id || "") });
}

export async function readLocalDuplicateIdentity(duplicate, credentials) {
  const id = String(duplicate.createdConstituentId || "");
  if (!id) throw new ImportReviewRequired("An earlier creation has no verified NXT record ID. Verify that attempt before continuing.");
  const raw = await blackbaudApiFetch(`/constituent/v1/constituents/${encodeURIComponent(id)}`, credentials);
  const candidate = normalizeImportMatchCandidate(raw);
  if (String(raw?.id || "") !== id || !candidate?.lookupId || !candidate.name || candidate.name === "Unnamed constituent") {
    throw new ImportReviewRequired("NXT did not return a complete current identity for the earlier record. Retry the comparison; do not create another record.");
  }
  return candidate;
}

export async function isReviewedLocalDuplicate(duplicate, decisions, credentials) {
  // A possibly sent create without a known result is never a dismissible match.
  if (duplicate.kind === "unconfirmed_creation") return false;
  const decision = [...decisions].reverse().find((entry) => entry.decision === "different_person" &&
    entry.fingerprint === duplicate.fingerprint && entry.reviewedByUserId && entry.reviewedAt && entry.note?.trim().length >= 10);
  if (!decision) return false;
  if (duplicate.kind === "pending_row") return true;
  const current = await readLocalDuplicateIdentity(duplicate, credentials);
  return decision.liveIdentityFingerprint === duplicateEvidenceFingerprint(current);
}
