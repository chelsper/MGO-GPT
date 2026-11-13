import { blackbaudApiFetch } from "./blackbaud";
import sql from "./sql";
import { normalizeCustomFieldCategoryOptions, normalizeCustomFieldValueOptions } from "./customFieldOptions";
import { customFieldKey, customFieldType, customFieldText, protectedImportCategory, customFieldWrite, customFieldPayload, matchingCustomFields } from "@/utils/importCustomFields";

const ROOT = "/constituent/v1/constituents";
const optionsFor = ({ user, origin }) => ({ userId: user.id, authUserId: user.id, origin, timeoutMs: 10000, maxRetries: 0 });
function complete(payload) {
  const values = Array.isArray(payload) ? payload : payload?.value;
  if (!Array.isArray(values) || payload?.next_link || payload?.next || payload?.links?.next || values.length > 10000 ||
    (payload?.count !== undefined && (!Number.isSafeInteger(payload.count) || payload.count !== values.length))) throw new Error("NXT returned an incomplete custom-field collection. Nothing was added.");
  return values;
}
export async function importCustomFieldCatalog(context, fetcher = blackbaudApiFetch) {
  const raw = complete(await fetcher(`${ROOT}/customfields/categories/details`, optionsFor(context)));
  const categories = raw.map((entry) => normalizeCustomFieldCategoryOptions([entry])[0]);
  if (categories.some((entry) => !entry?.name) || new Set(categories.map((entry) => entry.name.toLowerCase())).size !== categories.length) throw new Error("NXT returned ambiguous custom-field categories.");
  return categories.filter((entry, index) => raw[index].active !== false && raw[index].inactive !== true && raw[index].is_active !== false &&
    !protectedImportCategory(entry.name) && customFieldType(entry.dataType));
}
export async function readImportCustomFields(context, fetcher = blackbaudApiFetch) {
  if (!/^\d+$/.test(String(context.constituentId || ""))) throw new Error("A verified NXT system ID is required.");
  const fields = complete(await fetcher(`${ROOT}/${context.constituentId}/customfields`, optionsFor(context)));
  const ids = new Set();
  for (const field of fields) {
    if (!/^\d+$/.test(String(field?.id || "")) || !customFieldText(field.category) || ids.has(String(field.id)) ||
      [field.parent_id, field.constituent_id].some((id) => id != null && String(id) !== String(context.constituentId))) throw new Error("NXT returned incomplete or conflicting custom fields. Nothing was added.");
    ids.add(String(field.id));
  }
  return fields;
}
export async function validateImportCustomField(input, context, fetcher = blackbaudApiFetch) {
  const catalog = await importCustomFieldCatalog(context, fetcher);
  const category = catalog.find((item) => item.name.toLowerCase() === customFieldText(input.category).toLowerCase());
  let values = [];
  if (customFieldType(category?.dataType) === "table") {
    const raw = complete(await fetcher(`${ROOT}/customfields/categories/values`, { ...optionsFor(context), searchParams: { category_name: category.name } }));
    const active = raw.filter((entry) => entry?.active !== false && entry?.inactive !== true && entry?.is_active !== false);
    values = normalizeCustomFieldValueOptions(active, catalog, category.name).filter((item) => item.category === category.name).map((item) => item.value);
    if (values.length !== active.length) throw new Error("NXT table values could not be completely validated. Nothing was added.");
  }
  customFieldPayload(input, category, values);
  return { category, values };
}
export async function prepareImportCustomField(input, context, fetcher = blackbaudApiFetch) {
  const { category, values } = await validateImportCustomField(input, context, fetcher);
  return customFieldWrite(input, category, values, await readImportCustomFields(context, fetcher));
}
export async function releaseImportCustomFieldClaim(rowId, constituentId, category, db = sql) {
  await db`DELETE FROM constituency_import_custom_field_claims WHERE row_id = ${rowId} AND constituent_id = ${String(constituentId)} AND category_key = ${customFieldKey(category)}`;
}
export async function applyImportCustomField({ request, user, row, write }, fetcher = blackbaudApiFetch, db = sql) {
  const context = { user, origin: new URL(request.url).origin, constituentId: String(row.matched_blackbaud_constituent_id || "") };
  const source = row.preview?.input?.customField;
  const held = (message) => ({ status: "manual_required", type: "constituent_custom_field", action: "review_existing", message });
  if (!source || !["add", "skip_existing"].includes(write.action) || write.requiresReview || protectedImportCategory(source.category) ||
    customFieldText(source.category).toLowerCase() !== customFieldText(write.category).toLowerCase() ||
    ["value", "date", "comment"].some((key) => customFieldText(source[key]) !== customFieldText(write[key]))) return held("The custom-field source or approval changed. Review this row before adding anything.");
  const prepared = await prepareImportCustomField(source, context, fetcher);
  if (prepared.requiresReview) return held(prepared.validationMessage);
  if (JSON.stringify(prepared.payload) !== JSON.stringify(write.payload) || prepared.dataType !== write.dataType) return held("The NXT category or value changed after review. Reload its custom fields before sending.");
  // A durable constituent/category claim also protects against simultaneous imports.
  // It has no expiry: an uncertain POST must be verified, never replayed by a timer.
  const claims = await db`INSERT INTO constituency_import_custom_field_claims (constituent_id, category_key, row_id)
    VALUES (${context.constituentId}, ${customFieldKey(source.category)}, ${row.id}) ON CONFLICT DO NOTHING RETURNING row_id`;
  if (!claims.length) return held("Another custom-field addition for this constituent/category is being verified. Finish that original import first; nothing was sent again.");
  let submitted = false, accepted = false;
  try {
    const current = await prepareImportCustomField(source, context, fetcher);
    if (current.requiresReview || JSON.stringify(current.payload) !== JSON.stringify(write.payload)) {
      await releaseImportCustomFieldClaim(row.id, context.constituentId, source.category, db);
      return held(current.validationMessage || "The NXT custom-field configuration changed. Review it again.");
    }
    if (current.action === "skip_existing") {
      await releaseImportCustomFieldClaim(row.id, context.constituentId, source.category, db);
      return { status: "applied", type: write.type, action: "skip_existing", message: "The exact category, value, date and comment already exist. Nothing was added." };
    }
    submitted = true;
    const result = await fetcher(`${ROOT}/customfields`, { ...optionsFor(context), method: "POST", body: { constituent_id: context.constituentId, ...current.payload } });
    accepted = true;
    if (!/^\d+$/.test(String(result?.id || ""))) throw new Error("NXT did not return a custom-field ID.");
    const fields = await readImportCustomFields(context, fetcher);
    const matching = matchingCustomFields(fields, current.payload, current.dataType);
    if (matching.length !== 1 || fields.filter((field) => field.category.toLowerCase() === current.payload.category.toLowerCase()).length !== 1 || String(matching[0].id) !== String(result.id)) throw new Error("The added field is not yet fully verified in NXT.");
    await releaseImportCustomFieldClaim(row.id, context.constituentId, source.category, db);
    return { status: "applied", type: write.type, action: "add", customFieldId: String(result.id), message: "Custom field added and read back from NXT." };
  } catch (error) {
    const rejected = submitted && !accepted && [400, 401, 403, 404, 409, 422, 429].includes(Number(error?.httpStatus || error?.status));
    if (!submitted || rejected) await releaseImportCustomFieldClaim(row.id, context.constituentId, source.category, db);
    if (submitted && !rejected) { error.importWriteUnconfirmed = true; error.retrySafe = false; }
    throw error;
  }
}
