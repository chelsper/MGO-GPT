import { blackbaudApiFetch, getBlackbaudFundraiserById } from "./blackbaud";

function datePart(value) {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw new Error("Assignment date could not be verified.");
  return value.slice(0, 10);
}

export function currentLeadAssignments(rows, types, asOf) {
  const wanted = new Set(types.map((type) => type.trim().toLowerCase()));
  return rows.filter((row) => {
    if (
      !wanted.has(
        String(row.type || "")
          .trim()
          .toLowerCase(),
      )
    )
      return false;
    if (row.inactive === true || row.is_active === false) return false;
    const start = datePart(row.start);
    const end = datePart(row.end);
    return (!start || start <= asOf) && (!end || end >= asOf);
  });
}

export async function readCurrentLead({
  user,
  origin,
  constituentId,
  types,
  asOf,
  names,
}) {
  if (!/^[1-9]\d*$/.test(constituentId))
    throw new Error("A constituent system record ID is required.");
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/fundraiserassignments`,
    {
      userId: user.id,
      authUserId: user.id,
      origin,
      searchParams: { include_inactive: false },
      maxRetries: 0,
      timeoutMs: 10000,
    },
  );
  if (
    !Array.isArray(payload?.value) ||
    payload.next_link ||
    payload.value.length > 500 ||
    (payload.count != null && payload.count !== payload.value.length)
  )
    throw new Error(
      "Current fundraiser assignments could not be completely verified.",
    );
  if (
    payload.value.some(
      (row) => !row || String(row.constituent_id || "") !== constituentId,
    )
  )
    throw new Error("Assignment constituent identity could not be verified.");
  const leads = currentLeadAssignments(payload.value, types, asOf);
  const ids = [...new Set(leads.map((row) => String(row.fundraiser_id || "")))];
  if (ids.length > 10)
    throw new Error("More than ten current lead assignments require review.");
  const result = [];
  for (const fundraiserId of ids) {
    if (!/^[1-9]\d*$/.test(fundraiserId))
      throw new Error("Invalid fundraiser system ID.");
    if (!Object.hasOwn(names, fundraiserId)) {
      const person = await getBlackbaudFundraiserById({
        userId: user.id,
        authUserId: user.id,
        origin,
        fundraiserId,
      });
      if (!person?.name || person.fundraiserId !== fundraiserId)
        throw new Error("Fundraiser name could not be verified.");
      names[fundraiserId] = person.name;
    }
    result.push(names[fundraiserId]);
  }
  return result.sort().join("; ");
}
