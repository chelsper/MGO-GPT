import { letterError } from "@/utils/societyLetters";

export function completeAppealCatalog(result) {
  // SKY may include a next_link even when count confirms every row is present.
  // Never follow provider URLs or accept a truncated catalog as authoritative.
  if (
    !Array.isArray(result?.value) ||
    !Number.isInteger(result.count) ||
    result.count !== result.value.length ||
    result.count > 5000 ||
    result.value.some(
      (item) => !item?.id || typeof item.description !== "string",
    ) ||
    new Set(result.value.map((item) => String(item.id))).size !== result.count
  )
    throw letterError(
      "The complete appeal catalog could not be verified. Settings were not saved; no NXT records were changed.",
    );
  return result.value;
}

export function appealByLookupCode(catalog, requested, purpose) {
  const lookupId = String(requested?.lookupId || "").trim();
  const description = String(requested?.description || "").trim();
  if (
    !lookupId ||
    lookupId.length > 100 ||
    !description ||
    description.length > 300
  )
    throw letterError(
      `Enter each ${purpose} appeal's lookup code and exact description.`,
    );
  const byCode = catalog.filter(
    (item) =>
      typeof item.lookup_id === "string" &&
      item.lookup_id.toLowerCase() === lookupId.toLowerCase(),
  );
  const byDescription = catalog.filter(
    (item) =>
      item.description.trim().toLowerCase() === description.toLowerCase(),
  );
  if (
    byCode.length !== 1 ||
    byDescription.length !== 1 ||
    String(byCode[0].id) !== String(byDescription[0].id) ||
    byCode[0].description !== description ||
    byCode[0].inactive !== false
  )
    throw letterError(
      `The ${purpose} appeal is missing, inactive, or ambiguous, or its description does not match. Verify the appeal code and exact description in NXT.`,
    );
  return byCode[0];
}
