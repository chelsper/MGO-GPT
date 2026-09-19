import {
  blackbaudApiFetch,
  getBlackbaudConstituentById,
  listBlackbaudConstituentCustomFieldCategories,
  listBlackbaudConstituentCustomFieldCategoryValues,
} from "@/app/api/utils/blackbaud";
import {
  normalizeCustomFieldCategoryOptions,
  normalizeCustomFieldValueOptions,
} from "@/app/api/utils/customFieldOptions";
import { listError } from "@/app/api/utils/listConfigurations";

const PATH = "/constituent/v1/constituents/customfields";
export const LIST_PAGE_SIZE = 100;
export const LIST_MAX_FIELDS = 10000;
export const sameFieldText = (a, b) =>
  String(a ?? "")
    .trim()
    .toLocaleLowerCase("en-US") ===
  String(b ?? "")
    .trim()
    .toLocaleLowerCase("en-US");
export const fieldValue = (field) => field?.value ?? field?.description ?? "";
export const matchesListField = (field, source) =>
  sameFieldText(field?.category, source.fieldCategory) &&
  (!source.fieldDescription ||
    (typeof fieldValue(field) !== "object" &&
      sameFieldText(fieldValue(field), source.fieldDescription)));

export function parseListPage(
  payload,
  { path = PATH, offset = 0, category = "", description = "" } = {},
) {
  if (
    !payload ||
    !Array.isArray(payload.value) ||
    payload.value.length > LIST_PAGE_SIZE
  )
    throw listError(
      "NXT returned an incomplete custom-field response. The saved list has not changed.",
      502,
    );
  const count = payload.count;
  if (
    count !== undefined &&
    (!Number.isSafeInteger(count) || count < 0 || count > LIST_MAX_FIELDS)
  )
    throw listError(
      "The list is too large or NXT did not provide a valid count. Narrow its category/description and try again.",
      422,
    );
  if (count !== undefined && offset + payload.value.length > count)
    throw listError(
      "NXT returned inconsistent list totals. The previous snapshot is retained.",
      502,
    );
  if (
    payload.value.some(
      (field) =>
        !field?.id ||
        !/^\d+$/.test(String(field.parent_id || "")) ||
        !field.category,
    )
  )
    throw listError(
      "NXT returned custom fields without verified constituent IDs.",
      502,
    );
  let nextOffset = null;
  if (payload.next_link) {
    const next = new URL(payload.next_link, "https://api.sky.blackbaud.com");
    if (
      next.origin !== "https://api.sky.blackbaud.com" ||
      next.pathname !== path ||
      next.username ||
      next.password ||
      (next.searchParams.has("category") &&
        !sameFieldText(next.searchParams.get("category"), category)) ||
      (next.searchParams.has("value") &&
        !sameFieldText(next.searchParams.get("value"), description))
    )
      throw listError("NXT returned an unexpected list continuation.", 502);
    nextOffset = Number(next.searchParams.get("offset"));
    if (
      !next.searchParams.has("offset") ||
      !Number.isSafeInteger(nextOffset) ||
      nextOffset !== offset + payload.value.length ||
      !payload.value.length
    )
      throw listError("NXT returned an invalid list continuation.", 502);
  } else if (count !== undefined && offset + payload.value.length < count) {
    throw listError(
      "NXT returned an incomplete list without a continuation. The previous snapshot is retained.",
      502,
    );
  } else if (count === undefined && payload.value.length === LIST_PAGE_SIZE) {
    throw listError("NXT did not confirm that this list is complete.", 502);
  }
  if (
    offset + payload.value.length > LIST_MAX_FIELDS ||
    nextOffset >= LIST_MAX_FIELDS
  )
    throw listError(
      "This list exceeds the safe 10,000 custom-field limit. Narrow its definition.",
      422,
    );
  return { fields: payload.value, nextOffset, count };
}

export async function readListPage({ user, origin, source, offset = 0 }) {
  const payload = await blackbaudApiFetch(PATH, {
    userId: user.id,
    authUserId: user.id,
    origin,
    timeoutMs: 10000,
    maxRetries: 0,
    searchParams: {
      category: source.fieldCategory,
      value: source.fieldDescription || undefined,
      include_count: true,
      limit: LIST_PAGE_SIZE,
      offset,
    },
  });
  const page = parseListPage(payload, {
    offset,
    category: source.fieldCategory,
    description: source.fieldDescription,
  });
  if (page.fields.some((field) => !matchesListField(field, source)))
    throw listError(
      "NXT returned fields outside this list's configured criteria. The saved list has not changed.",
      502,
    );
  return page;
}

export async function readMemberFields({ user, origin, constituentId }) {
  const path = `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/customfields`;
  const fields = [];
  const seen = new Set();
  let offset = 0;
  do {
    const payload = await blackbaudApiFetch(path, {
      userId: user.id,
      authUserId: user.id,
      origin,
      timeoutMs: 10000,
      maxRetries: 0,
      searchParams: { limit: LIST_PAGE_SIZE, offset },
    });
    // Single-constituent responses may omit parent_id; the requested ID supplies that context.
    const page = parseListPage(
      {
        ...payload,
        value: Array.isArray(payload?.value)
          ? payload.value.map((field) => ({
              ...field,
              parent_id: field.parent_id || constituentId,
            }))
          : null,
      },
      { path, offset },
    );
    for (const field of page.fields) {
      if (
        String(field.parent_id) !== constituentId ||
        seen.has(String(field.id))
      )
        throw listError(
          "NXT returned an inconsistent custom-field list. No addition was attempted.",
          502,
        );
      seen.add(String(field.id));
      fields.push(field);
    }
    offset = page.nextOffset;
    if (fields.length > 1000 || offset >= 1000)
      throw listError(
        "This record has too many custom fields for a safe in-app addition. Check it in NXT.",
        422,
      );
  } while (offset !== null);
  return fields;
}

export async function readListIdentity({ user, origin, constituentId }) {
  const person = await getBlackbaudConstituentById({
    userId: user.id,
    authUserId: user.id,
    origin,
    constituentId,
    requestOptions: { timeoutMs: 10000, maxRetries: 0 },
  });
  if (
    String(person?.raw?.id ?? person?.raw?.constituent_id) !== constituentId ||
    !String(person?.name || "").trim()
  )
    throw listError(
      "NXT could not verify a constituent name. Resume later; the saved list is unchanged.",
      502,
    );
  return {
    constituentId,
    name: String(person.name).trim(),
    lookupId: String(person.lookupId || ""),
  };
}

export async function validateMembershipValue({ user, origin, source, value }) {
  const context = { userId: user.id, authUserId: user.id, origin };
  const categories = normalizeCustomFieldCategoryOptions(
    await listBlackbaudConstituentCustomFieldCategories(context),
  );
  const category = categories.find((item) =>
    sameFieldText(item.name, source.fieldCategory),
  );
  if (!category)
    throw listError(
      "The configured category could not be verified in NXT. No field was added.",
      422,
    );
  const type = category.dataType.replace(/[^a-z]/gi, "").toLowerCase();
  if (!["text", "codetableentry", "codetable"].includes(type))
    throw listError(
      "Adding from Lists currently supports Text and Code Table categories only. Use NXT for this category.",
      422,
    );
  if (type !== "text") {
    const values = normalizeCustomFieldValueOptions(
      await listBlackbaudConstituentCustomFieldCategoryValues({
        ...context,
        categoryName: category.name,
      }),
      categories,
      category.name,
    );
    const match = values.find((item) => sameFieldText(item.value, value));
    if (!match)
      throw listError(
        "Choose an existing NXT description for this category. No code-table values will be created.",
        422,
      );
    return { category: category.name, value: match.value };
  }
  return { category: category.name, value };
}

export async function writeListMembership({
  user,
  origin,
  constituentId,
  category,
  value,
}) {
  return blackbaudApiFetch(PATH, {
    userId: user.id,
    authUserId: user.id,
    origin,
    method: "POST",
    timeoutMs: 10000,
    maxRetries: 0,
    body: {
      parent_id: constituentId,
      category,
      value,
      date: new Date().toISOString().slice(0, 10),
      comment: `Added from JUMGOGPT by ${user.name || user.id}`.slice(0, 50),
    },
  });
}
