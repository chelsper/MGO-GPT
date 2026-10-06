import { auth } from "@/auth";
import sql from "./sql";
import getOrCreateUser from "./getOrCreateUser";
import { blackbaudApiFetch, getBlackbaudFundraiserById, listBlackbaudConstituentCustomFieldCategories,
  listBlackbaudConstituentCustomFieldCategoryValues } from "./blackbaud";
import { normalizeCustomFieldCategoryOptions, normalizeCustomFieldValueOptions } from "./customFieldOptions";
import { isAdminRole, isMgoRole } from "@/utils/workspaceRoles";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { ORIGINATOR_CATEGORY, OriginatorError, originatorFields, originatorFingerprint,
  originatorKey, originatorValuePayload, matchesOriginatorChange, systemId, validateOriginDate } from "./relationshipOriginatorModel";

export const ORIGINATOR_PATH = "/constituent/v1/constituents/customfields";
export const originatorHeaders = { "Cache-Control": "private, no-store" };

export async function originatorUser() {
  const session = await auth();
  if (!session?.user?.email) throw new OriginatorError("Please sign in.", 401);
  const user = await getOrCreateUser(session);
  if (!user || user.active === false) throw new OriginatorError("This account cannot access the app.", 403);
  return user;
}

export function requireOriginatorEditor(user) {
  if (!isAdminRole(user.role) && !isMgoRole(user.role)) throw new OriginatorError("Only fundraisers and Admins can record relationship origins.", 403);
}

export function checkOriginatorRequest(request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) ||
      !request.headers.get("content-type")?.startsWith("application/json")) {
    throw new OriginatorError("Open this form in the app before saving.", 403);
  }
}

export function originatorResponseError(error) {
  return Response.json({ error: error instanceof OriginatorError ? error.message :
    "NXT could not be checked right now. Saved information is unchanged. Try checking again later." },
  { status: error instanceof OriginatorError ? error.status : 503, headers: originatorHeaders });
}

export async function readOriginatorCollection(path, options, searchParams, fetcher = blackbaudApiFetch) {
  const rows = [], seen = new Set();
  let next = path;
  for (let page = 0; next && page < 20; page++) {
    const url = new URL(next, "https://api.sky.blackbaud.com");
    if (url.origin !== "https://api.sky.blackbaud.com" || url.pathname !== path || seen.has(url.href)) {
      throw new OriginatorError("NXT returned an incomplete originator list.");
    }
    seen.add(url.href);
    const payload = await fetcher(next, { ...options, maxRetries: 0, timeoutMs: 8000,
      searchParams: page === 0 ? { limit: 500, ...searchParams } : undefined });
    if (!Array.isArray(payload?.value)) throw new OriginatorError("NXT returned an incomplete originator list.");
    rows.push(...payload.value);
    next = payload.next_link || null;
    if (!next && Number(payload.count) > rows.length) throw new OriginatorError("NXT returned an incomplete originator list.");
  }
  if (next) throw new OriginatorError("The originator list exceeded this refresh's safe limit. Saved results are unchanged.");
  return rows;
}

export async function readConstituentOriginators(constituentId, options) {
  const fields = originatorFields(await readOriginatorCollection(`/constituent/v1/constituents/${constituentId}/customfields`, options));
  const unique = new Map();
  for (const field of fields) {
    if (!field.id || (field.constituentId && field.constituentId !== constituentId) ||
        (unique.has(field.id) && originatorFingerprint([unique.get(field.id)]) !== originatorFingerprint([field]))) {
      throw new OriginatorError("NXT returned conflicting constituent custom fields. No changes were made.");
    }
    unique.set(field.id, field);
  }
  return [...unique.values()];
}

export async function originatorRoster(db = sql) {
  const users = await db`SELECT id, name, role, active, blackbaud_constituent_id
    FROM users WHERE POSITION(',mgo,' IN ',' || REPLACE(LOWER(COALESCE(role, '')), ' ', '') || ',') > 0
    ORDER BY name, id`;
  return users;
}

export async function originatorReview({ user, constituentId, options, db = sql, read = readConstituentOriginators }) {
  const fields = await read(constituentId, options);
  const [pending] = await db`SELECT * FROM relationship_originator_changes
    WHERE constituent_id = ${constituentId} AND state IN ('pending','review') LIMIT 1`;
  let unresolved = Boolean(pending);
  if (pending && matchesOriginatorChange(fields, pending)) {
    const confirmed = await db`UPDATE relationship_originator_changes SET state = 'confirmed',
      remote_field_id = ${fields[0].id}, updated_at = NOW()
      WHERE id = ${pending.id} AND state IN ('pending','review') RETURNING id`;
    unresolved = !confirmed.length;
  }
  const admin = isAdminRole(user.role);
  return { fields, fingerprint: originatorFingerprint(fields), unresolved, admin,
    today: getStandingsPeriods().asOf,
    canClaim: !unresolved && fields.length === 0,
    canCorrect: !unresolved && admin && fields.length === 1 && Boolean(fields[0].id),
    selfUserId: String(user.id),
    fundraisers: admin ? (await originatorRoster(db)).filter(person => person.active !== false)
      .map(person => ({ id: String(person.id), name: person.name })) : [{ id: String(user.id), name: user.name }],
  };
}

export async function saveOriginator({ user, constituentId, input, options, db = sql,
  read = readConstituentOriginators, fetcher = blackbaudApiFetch,
  fundraiserLookup = getBlackbaudFundraiserById, categories = listBlackbaudConstituentCustomFieldCategories,
  categoryValues = listBlackbaudConstituentCustomFieldCategoryValues }) {
  requireOriginatorEditor(user);
  const today = getStandingsPeriods().asOf;
  const date = validateOriginDate(input.originDate, today);
  const admin = isAdminRole(user.role);
  const ownerId = String(input.ownerUserId || user.id);
  if (!admin && ownerId !== String(user.id)) throw new OriginatorError("You can only name yourself as originator.", 403);
  const owner = (await originatorRoster(db)).find(person => String(person.id) === ownerId && person.active !== false);
  if (!owner || !systemId(owner.blackbaud_constituent_id)) throw new OriginatorError("Connect this fundraiser's NXT system record in their profile first.");
  const before = await read(constituentId, options);
  if (input.fingerprint !== originatorFingerprint(before)) throw new OriginatorError("The originator changed. Check NXT again before saving.");
  if (before.length > 1) throw new OriginatorError("There are multiple originators in NXT. An Admin must resolve the duplicate fields there first.");
  if (before.length && !admin) throw new OriginatorError("An originator is already recorded. Ask an Admin to make corrections.", 403);
  const reason = String(input.reason || "").trim();
  if ((before.length && !reason) || reason.length > 500) throw new OriginatorError("Add a brief reason for the correction (up to 500 characters).", 400);
  if (before.length && !before[0].id) throw new OriginatorError("NXT did not return a custom field system ID.");
  const fundraiser = await fundraiserLookup({ ...options, fundraiserId: owner.blackbaud_constituent_id });
  if (!fundraiser?.name || fundraiser.fundraiserStatus !== "Active") throw new OriginatorError("This account's linked NXT record must be an active fundraiser.");
  // Name-valued NXT fields cannot distinguish two fundraisers with the same
  // name. Require Admin resolution rather than silently attributing either.
  const roster = await originatorRoster(db);
  if (roster.some(person => String(person.id) !== ownerId &&
      (originatorKey(person.name) === originatorKey(fundraiser.name) || person.blackbaud_constituent_id === owner.blackbaud_constituent_id))) {
    throw new OriginatorError("This fundraiser identity is shared or ambiguous. Ask an Admin to resolve it first.");
  }
  const catalog = normalizeCustomFieldCategoryOptions(await categories(options));
  const category = catalog.find(item => originatorKey(item.name) === originatorKey(ORIGINATOR_CATEGORY));
  const isTable = ["table", "codetable", "codetableentry"].includes(originatorKey(category?.dataType).replace(/[^a-z]/g, ""));
  const values = isTable ? normalizeCustomFieldValueOptions(await categoryValues({ ...options, categoryName: category.name }),
    catalog, category.name).map(item => item.value) : [];
  const valuePayload = originatorValuePayload(category, fundraiser.name, values);
  const storedName = valuePayload.text_value ?? valuePayload.codetableentry_value;
  const [claim] = await db`INSERT INTO relationship_originator_changes
    (constituent_id,owner_user_id,entered_by_user_id,originator_name,origin_date,reason,previous_fields,remote_field_id,state)
    VALUES (${constituentId},${ownerId},${user.id},${storedName},${date},${reason},${JSON.stringify(before)}::jsonb,
      ${before[0]?.id || null},'pending') ON CONFLICT DO NOTHING RETURNING *`;
  if (!claim) throw new OriginatorError("An originator update is already being checked. Use Check NXT; it will not submit again.");
  let submitted = false;
  try {
    const latest = await read(constituentId, options);
    if (originatorFingerprint(latest) !== originatorFingerprint(before)) throw new OriginatorError("The originator changed. Check NXT again before saving.");
    // Persist the claim before the only write. After this boundary even a
    // timeout or provider rejection is held for read-only reconciliation.
    submitted = true;
    await fetcher(before.length ? `${ORIGINATOR_PATH}/${before[0].id}` : ORIGINATOR_PATH, {
      ...options, maxRetries: 0, timeoutMs: 12000, method: before.length ? "PATCH" : "POST",
      body: { ...valuePayload, date,
        ...(before.length ? {} : { parent_id: constituentId, category: category.name }),
      },
    });
    const after = await read(constituentId, options);
    const receipt = { ...claim, originator_name: storedName, origin_date: date, remote_field_id: before[0]?.id || null };
    if (!matchesOriginatorChange(after, receipt)) throw new OriginatorError("The NXT update needs verification.");
    const saved = await db`UPDATE relationship_originator_changes SET state = 'confirmed',
      remote_field_id = ${after[0].id}, updated_at = NOW()
      WHERE id = ${claim.id} AND state = 'pending' RETURNING id`;
    if (!saved.length) throw new OriginatorError("The NXT update needs verification.");
    return { fields: after, message: "Relationship originator saved in NXT. Refresh originator metrics in Team Standings to include this change." };
  } catch (error) {
    await db`UPDATE relationship_originator_changes SET state = ${submitted ? "review" : "not_sent"}, updated_at = NOW()
      WHERE id = ${claim.id} AND state = 'pending'`.catch(() => {});
    if (submitted) throw new OriginatorError("This update may already be in NXT. Use Check NXT to verify it; the app will not send it again.");
    throw error;
  }
}
