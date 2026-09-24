export const LETTER_COLUMNS = {
  householdId: "Household ID",
  memberIds: "Member IDs",
  name: "Household Name",
  society: "Society",
  addressee: "Addressee",
  salutation: "Salutation",
  address: "Mailing Address",
  email: "Email",
  emailAllowed: "Email Allowed",
  mailAllowed: "Mail Allowed",
  periodStart: "Period Start",
  periodEnd: "Period End",
};
export const CONSTITUENT_LETTER_COLUMNS = {
  constituentId: "System Record ID",
  spouseId: "Spouse System Record ID",
  addressee: "Primary Addressee",
  salutation: "Primary Salutation",
  address1: "Preferred Address Line 1",
  address2: "Preferred Address Line 2",
  city: "Preferred City",
  state: "Preferred State",
  postalCode: "Preferred ZIP",
  country: "",
  email: "Preferred Email 1 Number",
};
export const CONSTITUENT_LETTER_LABELS = {
  constituentId: "Constituent system record ID",
  spouseId: "Spouse system record ID",
  addressee: "Addressee",
  salutation: "Salutation",
  address1: "Address line 1",
  address2: "Address line 2 (optional)",
  city: "City",
  state: "State / province (optional)",
  postalCode: "Postal code (optional)",
  country: "Country (optional)",
  email: "Email (optional)",
};
const REQUIRED_CONSTITUENT_COLUMNS = [
  "constituentId",
  "spouseId",
  "addressee",
  "salutation",
  "address1",
  "city",
];
export const CONSTITUENT_LETTER_PREVIEW_NOTICE =
  "Household preview only. Letter creation, sending, and NXT appeal updates are not enabled for this source yet. Communication restrictions, existing appeals, and higher-society coverage must be verified first.";
export const LETTER_TAGS = [
  "addressee",
  "salutation",
  "address",
  "household_name",
  "society_name",
  "period_start",
  "period_end",
  "letter_date",
];
export const LETTER_BATCH_LIMIT = 50;
export const letterError = (message, status = 422) =>
  Object.assign(new Error(message), { status });
const text = (value) => String(value ?? "").trim();
const id = (value) => /^[1-9]\d{0,18}$/.test(text(value));
const yes = (value) => /^(true|yes|1)$/i.test(text(value));

export function dateOnly(value) {
  const raw = text(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  const iso = us
    ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
    : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

export function letterPeriod(settings, today) {
  if (!dateOnly(today))
    throw letterError("The current date could not be determined.");
  const year = Number(today.slice(0, 4));
  let start, end;
  if (settings.periodBasis === "custom") {
    start = dateOnly(settings.startDate);
    end = dateOnly(settings.endDate);
  } else {
    const month =
      settings.periodBasis === "fiscal_year"
        ? Number(settings.fiscalYearStartMonth)
        : 1;
    if (!Number.isInteger(month) || month < 1 || month > 12)
      throw letterError("Choose a valid fiscal start month.");
    const startYear = Number(today.slice(5, 7)) < month ? year - 1 : year;
    start = `${startYear}-${String(month).padStart(2, "0")}-01`;
    end = new Date(Date.UTC(startYear + 1, month - 1, 0))
      .toISOString()
      .slice(0, 10);
  }
  if (!start || !end || start > end)
    throw letterError("Choose a valid letter period.");
  return { start, end, key: `${start}/${end}` };
}

export function validateLetterSettings(raw, definitions, today) {
  if (!/^[1-9]\d*$/.test(text(raw?.queryId)))
    throw letterError("Enter the saved NXT household query ID.");
  if (!["calendar_year", "fiscal_year", "custom"].includes(raw.periodBasis))
    throw letterError("Choose a letter period.");
  const eligible = definitions.filter((d) => d.active && d.basis === "annual");
  const keys = Array.isArray(raw.societyKeys) ? raw.societyKeys : [];
  if (
    !keys.length ||
    keys.length > 20 ||
    new Set(keys).size !== keys.length ||
    keys.some((k) => !eligible.some((d) => d.key === k))
  )
    throw letterError("Select the annual societies in this letter hierarchy.");
  const sourceMode = raw.sourceMode || "households";
  if (!["households", "constituents"].includes(sourceMode))
    throw letterError("Choose a supported household query format.");
  const constituentSource = sourceMode === "constituents";
  const fieldNames = constituentSource
    ? CONSTITUENT_LETTER_COLUMNS
    : LETTER_COLUMNS;
  const columns = Object.fromEntries(
    Object.keys(fieldNames).map((key) => [key, text(raw.columns?.[key])]),
  );
  const mapped = Object.values(columns).filter(Boolean);
  const required = constituentSource
    ? REQUIRED_CONSTITUENT_COLUMNS
    : Object.keys(columns);
  if (
    required.some((key) => !columns[key]) ||
    mapped.some((v) => v.length > 150) ||
    new Set(mapped).size !== mapped.length
  )
    throw letterError("Map each field to a distinct query output column.");
  const settings = {
    queryId: text(raw.queryId),
    periodBasis: raw.periodBasis,
    fiscalYearStartMonth: Number(raw.fiscalYearStartMonth || 7),
    startDate: raw.startDate || "",
    endDate: raw.endDate || "",
    societyKeys: keys,
    columns,
    sourceMode,
  };
  const period = letterPeriod(settings, today);
  if (constituentSource) {
    if (!keys.includes(raw.querySocietyKey))
      throw letterError(
        "Choose the society qualified by this constituent query.",
      );
    if (
      dateOnly(raw.queryPeriodStart) !== period.start ||
      dateOnly(raw.queryPeriodEnd) !== period.end
    )
      throw letterError(
        "Confirm the saved query's exact qualification dates for this letter period.",
      );
    Object.assign(settings, {
      querySocietyKey: raw.querySocietyKey,
      queryPeriodStart: period.start,
      queryPeriodEnd: period.end,
    });
  }
  if (raw.confirmSource !== true)
    throw letterError(
      "Confirm that the query returns verified household membership and communication permissions for the selected period.",
    );
  return settings;
}

// Field metadata, not a numeric-looking value or a column label, determines
// whether an identity is an NXT system record ID rather than a lookup ID.
export function verifyConstituentLetterIdColumns(query, settings) {
  const fields = query?.select_fields || [];
  for (const [key, root] of [
    ["constituentId", "296"],
    ["spouseId", "10516"],
  ]) {
    const matches = fields.filter(
      ({ query_field: field }) =>
        field?.selected_field_name === settings.columns[key],
    );
    const field = matches[0]?.query_field;
    if (
      matches.length !== 1 ||
      field?.available_field_name !== "System Record ID" ||
      String(field?.node_path?.[0]?.id) !== root
    ) {
      throw letterError(
        `Map ${CONSTITUENT_LETTER_LABELS[key]} to its NXT System Record ID output, not Constituent ID or Spouse ID (lookup IDs).`,
      );
    }
  }
}

export function constituentHouseholdsFromQuery(
  table,
  settings,
  hierarchy,
  period,
) {
  if (
    settings.queryPeriodStart !== period.start ||
    settings.queryPeriodEnd !== period.end
  )
    throw letterError(
      "The query qualification period must be confirmed again before refreshing a new period.",
    );
  const tier = hierarchy.find((d) => d.key === settings.querySocietyKey);
  if (!tier) throw letterError("Choose the society qualified by this query.");
  if (
    !Array.isArray(table.headers) ||
    !Array.isArray(table.tableRows) ||
    table.tableRows.length > 1000
  )
    throw letterError(
      "The constituent query output is invalid or exceeds 1,000 rows.",
    );
  const indexes = Object.fromEntries(
    Object.keys(CONSTITUENT_LETTER_COLUMNS).map((key) => {
      const column = settings.columns[key];
      if (!column && !REQUIRED_CONSTITUENT_COLUMNS.includes(key))
        return [key, -1];
      if (!column || table.headers.filter((h) => h === column).length !== 1)
        throw letterError(
          `Choose a unique returned column for ${CONSTITUENT_LETTER_LABELS[key]}.`,
        );
      return [key, table.headers.indexOf(column)];
    }),
  );
  const records = new Map();
  for (const [index, values] of table.tableRows.entries()) {
    if (!Array.isArray(values) || values.length !== table.headers.length)
      throw letterError(`Query row ${index + 1} has an invalid column count.`);
    const row = Object.fromEntries(
      Object.entries(indexes).map(([key, i]) => [
        key,
        i < 0 ? "" : text(values[i]),
      ]),
    );
    if (
      !id(row.constituentId) ||
      (row.spouseId &&
        (!id(row.spouseId) || row.spouseId === row.constituentId))
    )
      throw letterError(
        `Query row ${index + 1} has invalid constituent or spouse system record IDs. No identities were inferred.`,
      );
    const previous = records.get(row.constituentId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row))
      throw letterError(
        `Constituent ${row.constituentId} has conflicting spouse or recipient output. Correct the query before using this household.`,
      );
    records.set(row.constituentId, row);
  }
  const owners = new Map(),
    groups = new Map();
  for (const row of records.values()) {
    const members = [row.constituentId, row.spouseId]
      .filter(Boolean)
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
    const householdId = members[0];
    const partner = records.get(row.spouseId);
    if (partner && partner.spouseId !== row.constituentId)
      throw letterError(
        `Constituent ${row.constituentId} has a conflicting spouse link in the query. Review household membership.`,
      );
    for (const member of members) {
      if (owners.has(member) && owners.get(member) !== householdId)
        throw letterError(
          `Constituent ${member} appears in different households. Review spouse links before using this query.`,
        );
      owners.set(member, householdId);
    }
    const group = groups.get(householdId) || { members, recipients: [] };
    if (JSON.stringify(group.members) !== JSON.stringify(members))
      throw letterError(
        `Constituent ${householdId} appears in different households. Review spouse links before using this query.`,
      );
    group.recipients.push(row);
    groups.set(householdId, group);
  }
  const rank = hierarchy.findIndex((d) => d.key === tier.key);
  return [...groups.entries()]
    .map(([householdId, group]) => {
      // This is a stable grouping key, not an inferred NXT head of household.
      const recipients = group.recipients.sort(
        (a, b) =>
          a.constituentId.length - b.constituentId.length ||
          a.constituentId.localeCompare(b.constituentId),
      );
      const candidates = recipients.map((row) => ({
        constituentId: row.constituentId,
        addressee: row.addressee,
        salutation: row.salutation,
        email: row.email,
        address: [
          row.address1,
          row.address2,
          [row.city, row.state, row.postalCode].filter(Boolean).join(" "),
          row.country,
        ]
          .filter(Boolean)
          .join("\n"),
      }));
      return {
        householdId,
        members: group.members,
        name:
          [...new Set(candidates.map((r) => r.addressee).filter(Boolean))].join(
            " / ",
          ) || `Household ${householdId}`,
        addressee: "",
        salutation: "",
        address: "",
        email: "",
        emailAllowed: false,
        mailAllowed: false,
        recipientCandidates: candidates,
        membersOutsideQuery: group.members.filter(
          (member) => !records.has(member),
        ),
        societyKey: tier.key,
        societyName: tier.name,
        rank,
        qualifiedKeys: [tier.key],
        coveredKeys: hierarchy.slice(rank).map((d) => d.key),
        period,
        sourceMode: "constituents",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function letterHierarchy(definitions, settings) {
  return (settings?.societyKeys || [])
    .map((key) =>
      definitions.find(
        (d) => d.key === key && d.active && d.basis === "annual",
      ),
    )
    .filter(Boolean)
    .sort(
      (a, b) => a.displayOrder - b.displayOrder || a.key.localeCompare(b.key),
    );
}

// The query defines qualification. Never infer a household from an address, or
// combine individual gift totals (which could double-count recognition credit).
export function householdsFromQuery(table, settings, hierarchy, period) {
  if (settings.sourceMode === "constituents")
    return constituentHouseholdsFromQuery(table, settings, hierarchy, period);
  const { headers, tableRows } = table;
  if (
    !Array.isArray(headers) ||
    !Array.isArray(tableRows) ||
    tableRows.length > 1000
  )
    throw letterError(
      "The household query output is invalid or exceeds 1,000 rows.",
    );
  const indexes = Object.fromEntries(
    Object.entries(settings.columns).map(([key, column]) => {
      if (headers.filter((h) => h === column).length !== 1)
        throw letterError(
          `Choose a unique returned column for ${LETTER_COLUMNS[key]}.`,
        );
      return [key, headers.indexOf(column)];
    }),
  );
  const groups = new Map(),
    owners = new Map();
  for (const [offset, values] of tableRows.entries()) {
    const row = Object.fromEntries(
      Object.entries(indexes).map(([key, index]) => [key, text(values[index])]),
    );
    const members = [
      ...new Set(row.memberIds.split(/[|;,]/).map(text).filter(Boolean)),
    ].sort();
    const tier = hierarchy.find(
      (d) => d.key === row.society || d.name === row.society,
    );
    if (
      !id(row.householdId) ||
      !members.length ||
      members.some((v) => !id(v)) ||
      !members.includes(row.householdId)
    )
      throw letterError(
        `Query row ${offset + 1}: household/head record ID and all member system IDs are required. No identities were inferred.`,
      );
    if (!tier || !row.name || !row.addressee || !row.salutation)
      throw letterError(
        `Query row ${offset + 1}: check the society, household name, addressee, and salutation.`,
      );
    if (
      dateOnly(row.periodStart) !== period.start ||
      dateOnly(row.periodEnd) !== period.end
    )
      throw letterError(
        `Query row ${offset + 1}: its qualification period does not match ${period.start} through ${period.end}. Saved results were retained.`,
      );
    for (const member of members) {
      if (owners.has(member) && owners.get(member) !== row.householdId)
        throw letterError(
          `Member ${member} appears in different households. Correct the query before preparing letters.`,
        );
      owners.set(member, row.householdId);
    }
    const recipient = {
      householdId: row.householdId,
      members,
      name: row.name,
      addressee: row.addressee,
      salutation: row.salutation,
      address: row.address,
      email: row.email,
      emailAllowed: yes(row.emailAllowed),
      mailAllowed: yes(row.mailAllowed),
    };
    const existing = groups.get(row.householdId);
    if (
      existing &&
      JSON.stringify(existing.recipient) !== JSON.stringify(recipient)
    )
      throw letterError(
        `Household ${row.householdId} has conflicting recipient or permission values. Correct the query first.`,
      );
    const group = existing || { recipient, qualified: [] };
    if (!group.qualified.includes(tier.key)) group.qualified.push(tier.key);
    groups.set(row.householdId, group);
  }
  return [...groups.values()]
    .map(({ recipient, qualified }) => {
      const rank = hierarchy.findIndex((d) => qualified.includes(d.key));
      return {
        ...recipient,
        societyKey: hierarchy[rank].key,
        societyName: hierarchy[rank].name,
        rank,
        coveredKeys: hierarchy.slice(rank).map((d) => d.key),
        qualifiedKeys: qualified,
        period,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function letterDisposition(row, history) {
  const prior = history.filter(
    (item) =>
      item.status !== "cancelled" &&
      item.period.key === row.period.key &&
      (item.householdId === row.householdId ||
        item.members.some((id) => row.members.includes(id))),
  );
  if (
    prior.some((item) =>
      ["prepared", "sending", "needs_review", "pending_email"].includes(
        item.status,
      ),
    )
  )
    return {
      status: "held",
      reason: "A letter is already prepared or awaiting delivery verification.",
    };
  if (
    prior.some(
      (item) =>
        item.coveredKeys.includes(row.societyKey) ||
        item.societyKey === row.societyKey ||
        item.rank <= row.rank,
    )
  )
    return {
      status: "covered",
      reason: "Already acknowledged for this period at this level or higher.",
    };
  return {
    status: "ready",
    reason: prior.length
      ? "New higher society qualification"
      : "First letter for this period",
  };
}

export function letterIssue(row, channel, template) {
  if (!template) return "Upload a letter template for this society.";
  if (channel === "email") {
    if (!row.emailAllowed)
      return "Email eligibility is not confirmed by the source query.";
    if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(row.email))
      return "A single valid household email address is required.";
  } else if (channel === "post") {
    if (!row.mailAllowed)
      return "Postal eligibility is not confirmed by the source query.";
    if (!row.address) return "A mailing address is required.";
  } else return "Choose email or postal mail.";
  return null;
}

export function letterMergeData(row, today) {
  return {
    addressee: row.addressee,
    salutation: row.salutation,
    address: row.address,
    household_name: row.name,
    society_name: row.societyName,
    period_start: row.period.start,
    period_end: row.period.end,
    letter_date: today,
  };
}

export function mergeLetterText(template, data) {
  return String(template).replace(/\{([^{}]+)\}/g, (_, key) => {
    if (!LETTER_TAGS.includes(key.trim()))
      throw letterError(`Unknown template field: ${key}`);
    return data[key.trim()] || "";
  });
}
