import {
  ORGANIZATION_CONTACT_COLUMNS,
  ORGANIZATION_CONTACT_LABELS,
  validateOrganizationContactColumns,
  organizationContactsFromRow,
  mergeOrganizationContacts,
  organizationLetterContacts,
  isOrganizationLetterCandidate,
  contactChoiceKey,
} from "./societyLetterContacts";

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
export const LETTER_NAME_COLUMNS = {
  firstName: "",
  preferredName: "",
  lastName: "",
  spouseFirstName: "",
  spousePreferredName: "",
  spouseLastName: "",
};
export const GROUPED_LETTER_COLUMNS = {
  ...LETTER_COLUMNS,
  ...LETTER_NAME_COLUMNS,
};
export const GROUPED_LETTER_LABELS = {
  ...LETTER_COLUMNS,
  firstName: "Recipient first name (optional)",
  preferredName: "Recipient preferred name (optional)",
  lastName: "Recipient last name (optional)",
  spouseFirstName: "Spouse first name (optional)",
  spousePreferredName: "Spouse preferred name (optional)",
  spouseLastName: "Spouse last name (optional)",
};
export const CONSTITUENT_LETTER_COLUMNS = {
  constituentId: "System Record ID",
  spouseId: "Spouse System Record ID",
  ...LETTER_NAME_COLUMNS,
  addressee: "Primary Addressee",
  salutation: "Primary Salutation",
  address1: "Preferred Address Line 1",
  address2: "Preferred Address Line 2",
  city: "Preferred City",
  state: "Preferred State",
  postalCode: "Preferred ZIP",
  country: "",
  email: "Preferred Email 1 Number",
  ...ORGANIZATION_CONTACT_COLUMNS,
};
export const CONSTITUENT_LETTER_LABELS = {
  constituentId: "Constituent system record ID",
  spouseId: "Spouse system record ID",
  firstName: "Constituent first name (optional)",
  preferredName: "Constituent preferred name (optional)",
  lastName: "Constituent last name (optional)",
  spouseFirstName: "Spouse first name (optional)",
  spousePreferredName: "Spouse preferred name (optional)",
  spouseLastName: "Spouse last name (optional)",
  addressee: "Addressee",
  salutation: "Salutation",
  address1: "Preferred street line 1",
  address2: "Preferred street line 2 (optional)",
  city: "City",
  state: "State / province (optional)",
  postalCode: "ZIP / postal code (optional)",
  country: "Country (optional)",
  email: "Email (optional)",
  ...ORGANIZATION_CONTACT_LABELS,
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
  "Household preview only. Letter creation, sending, and letter-sent appeal updates are not enabled for this source yet. Communication restrictions, existing appeals, and higher-society coverage must be verified first. Separately configured exclusion appeals can be recorded when you confirm an exclusion.";
export const isLetterPreviewSource = (settings) =>
  ["constituents", "society_queries"].includes(settings?.sourceMode);
export const MAX_COMBINED_LETTER_HOUSEHOLDS = 5000;
export const LETTER_NAME_TAGS = [
  "first_name",
  "last_name",
  "spouse_first_name",
  "spouse_last_name",
  "first_names",
];
export const LETTER_ADDRESS_TAGS = [
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "zip",
  "country",
];
export const LETTER_TAGS = [
  "addressee",
  "salutation",
  ...LETTER_NAME_TAGS,
  "address",
  ...LETTER_ADDRESS_TAGS,
  "household_name",
  "society_name",
  "period_start",
  "period_end",
  "letter_date",
];
export const LETTER_FIELD_LABELS = {
  addressee: "Addressee",
  salutation: "Salutation",
  first_name: "Recipient first name",
  last_name: "Recipient last name",
  spouse_first_name: "Spouse first name",
  spouse_last_name: "Spouse last name",
  first_names: "Individual or household first names",
  address: "Mailing address",
  address_line_1: "Street line 1",
  address_line_2: "Street line 2 (optional)",
  city: "City",
  state: "State",
  zip: "ZIP / postal code",
  country: "Country (optional)",
  household_name: "Individual or household name",
  society_name: "Society name",
  period_start: "Qualification period start",
  period_end: "Qualification period end",
  letter_date: "Letter date",
};
export function normalizeLetterMergeSettings(raw) {
  const fields = raw === undefined ? LETTER_TAGS : raw?.fields;
  const dateFormat = raw === undefined ? "iso" : raw?.dateFormat || "iso";
  if (
    !Array.isArray(fields) ||
    fields.length > LETTER_TAGS.length ||
    new Set(fields).size !== fields.length ||
    fields.some((field) => !LETTER_TAGS.includes(field)) ||
    !["iso", "long_us"].includes(dateFormat)
  )
    throw letterError("Choose supported merge fields and a date format.");
  const bindings = raw?.wordBindings;
  if (
    bindings !== undefined &&
    (!bindings ||
      typeof bindings !== "object" ||
      Array.isArray(bindings) ||
      Object.keys(bindings).length > 100 ||
      Object.entries(bindings).some(
        ([key, value]) =>
          !/^[A-Za-z][A-Za-z0-9_ .-]{0,79}$/.test(key) ||
          ["__proto__", "constructor", "prototype"].includes(key) ||
          !LETTER_TAGS.includes(value),
      ) ||
      !["block", "components"].includes(raw.wordAddressMode || "block"))
  )
    throw letterError("Choose a supported value for every Word merge field.");
  return {
    fields: LETTER_TAGS.filter((field) => fields.includes(field)),
    dateFormat,
    ...(bindings === undefined
      ? {}
      : {
          wordBindings: Object.fromEntries(
            Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b)),
          ),
          wordAddressMode: raw.wordAddressMode || "block",
          mergeDateLabel: raw.mergeDateLabel === true,
        }),
  };
}
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
  if (
    raw?.sourceMode !== "society_queries" &&
    !/^[1-9]\d*$/.test(text(raw?.queryId))
  )
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
  if (!["households", "constituents", "society_queries"].includes(sourceMode))
    throw letterError("Choose a supported household query format.");
  if (sourceMode === "society_queries") {
    const sources = raw.societySources;
    if (
      !Array.isArray(sources) ||
      sources.length !== keys.length ||
      new Set(sources.map((s) => s?.societyKey)).size !== keys.length ||
      sources.some((s) => !keys.includes(s?.societyKey))
    )
      throw letterError(
        "Configure one qualification query for each selected annual society.",
      );
    const societySources = keys.map((societyKey) => {
      const source = sources.find((s) => s.societyKey === societyKey);
      const validated = validateLetterSettings(
        {
          ...raw,
          sourceMode: "constituents",
          querySocietyKey: societyKey,
          queryId: source.queryId,
          columns: source.columns,
          queryPeriodStart: source.queryPeriodStart,
          queryPeriodEnd: source.queryPeriodEnd,
        },
        definitions,
        today,
      );
      return {
        societyKey,
        queryId: validated.queryId,
        columns: validated.columns,
        queryPeriodStart: validated.queryPeriodStart,
        queryPeriodEnd: validated.queryPeriodEnd,
      };
    });
    if (
      new Set(societySources.map((s) => s.queryId)).size !==
      societySources.length
    )
      throw letterError(
        "Use a different qualification query for each society; do not assign the same cohort to multiple giving levels.",
      );
    return {
      sourceMode,
      periodBasis: raw.periodBasis,
      fiscalYearStartMonth: Number(raw.fiscalYearStartMonth || 7),
      startDate: raw.startDate || "",
      endDate: raw.endDate || "",
      societyKeys: keys,
      societySources,
    };
  }
  const constituentSource = sourceMode === "constituents";
  const fieldNames = constituentSource
    ? CONSTITUENT_LETTER_COLUMNS
    : GROUPED_LETTER_COLUMNS;
  const columns = Object.fromEntries(
    Object.keys(fieldNames).map((key) => [key, text(raw.columns?.[key])]),
  );
  const mapped = Object.values(columns).filter(Boolean);
  const required = constituentSource
    ? REQUIRED_CONSTITUENT_COLUMNS
    : Object.keys(LETTER_COLUMNS);
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
    validateOrganizationContactColumns(columns);
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

function combineMemberNames(entries) {
  const names = new Map();
  // Display labels never establish identity. Prefer a person's own query row
  // over the name on a spouse row, and retain conflicts for explicit review.
  const ordered = [...entries].sort(
    (a, b) => Number(b.fromOwnRecord) - Number(a.fromOwnRecord),
  );
  for (const entry of ordered) {
    const previous = names.get(entry.constituentId);
    if (previous && previous.fromOwnRecord && !entry.fromOwnRecord) continue;
    if (
      previous &&
      previous.fromOwnRecord === entry.fromOwnRecord &&
      (previous.name !== entry.name ||
        previous.firstName !== entry.firstName ||
        text(previous.preferredName) !== text(entry.preferredName) ||
        previous.lastName !== entry.lastName)
    )
      throw letterError(
        `Member ${entry.constituentId} has conflicting name output. Review the name mappings before refreshing.`,
      );
    names.set(entry.constituentId, entry);
  }
  return [...names.values()].sort(
    (a, b) =>
      a.constituentId.length - b.constituentId.length ||
      a.constituentId.localeCompare(b.constituentId),
  );
}

function householdDisplayName(members, memberNames, candidates, fallback) {
  const names = members.map(
    (id) => memberNames.find((member) => member.constituentId === id)?.name,
  );
  return names.length && names.every(Boolean)
    ? names.join(" & ")
    : [...new Set(candidates.map((r) => r.addressee).filter(Boolean))].join(
        " / ",
      ) || fallback;
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
        ...(Object.keys(ORGANIZATION_CONTACT_COLUMNS).some(
          (key) => settings.columns[key],
        )
          ? {
              organizationContacts:
                table.metadata?.organizationContacts?.[row.constituentId] ||
                organizationContactsFromRow(row),
            }
          : {}),
        addressee: row.addressee,
        salutation: row.salutation,
        addressParts: {
          address_line_1: row.address1,
          address_line_2: row.address2,
          city: row.city,
          state: row.state,
          zip: row.postalCode,
          country: row.country,
        },
        email: row.email,
        ...(table.metadata?.emailCandidates?.[row.constituentId]
          ? {
              emailCandidates: [
                ...table.metadata.emailCandidates[row.constituentId],
              ],
            }
          : {}),
        address: formatLetterAddress({
          address_line_1: row.address1,
          address_line_2: row.address2,
          city: row.city,
          state: row.state,
          zip: row.postalCode,
          country: row.country,
        }),
      }));
      const memberNames = combineMemberNames(
        recipients.flatMap((row) =>
          [
            {
              constituentId: row.constituentId,
              firstName: row.firstName,
              ...(row.preferredName
                ? { preferredName: row.preferredName }
                : {}),
              lastName: row.lastName,
              name: [row.firstName, row.lastName].filter(Boolean).join(" "),
              fromOwnRecord: true,
            },
            {
              constituentId: row.spouseId,
              firstName: row.spouseFirstName,
              ...(row.spousePreferredName
                ? { preferredName: row.spousePreferredName }
                : {}),
              lastName: row.spouseLastName,
              name: [row.spouseFirstName, row.spouseLastName]
                .filter(Boolean)
                .join(" "),
              fromOwnRecord: false,
            },
          ].filter(
            (entry) =>
              entry.constituentId && (entry.name || entry.preferredName),
          ),
        ),
      );
      return {
        householdId,
        members: group.members,
        memberNames,
        name: householdDisplayName(
          group.members,
          memberNames,
          candidates,
          `Household ${householdId}`,
        ),
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

// Separate queries can return opposite spouses. Join only identical ID groups,
// retaining recipient candidates rather than choosing a joint addressee.
export function mergeSocietyLetterCohorts(cohorts, hierarchy, period) {
  const groups = new Map(),
    owners = new Map();
  for (const cohort of cohorts) {
    for (const row of cohort.rows) {
      if (
        row.period.key !== period.key ||
        !hierarchy.some((d) => d.key === row.societyKey)
      )
        throw letterError(
          "Society query results do not share the configured qualification period and hierarchy.",
        );
      const members = [...row.members].sort(
        (a, b) => a.length - b.length || a.localeCompare(b),
      );
      const membership = members.join("|");
      for (const member of members) {
        if (owners.has(member) && owners.get(member) !== membership)
          throw letterError(
            `Member ${member} has conflicting spouse links across society queries. Prior results were retained.`,
          );
        owners.set(member, membership);
      }
      const group = groups.get(membership) || {
        row,
        recipients: new Map(),
        memberNames: [],
        qualifications: new Set(),
        sources: [],
      };
      for (const candidate of row.recipientCandidates) {
        const previous = group.recipients.get(candidate.constituentId);
        if (!previous) {
          group.recipients.set(candidate.constituentId, candidate);
          continue;
        }
        const {
          email: previousEmail,
          emailCandidates: previousEmails,
          organizationContacts: previousContacts,
          ...previousDetails
        } = previous;
        const { email, emailCandidates, organizationContacts, ...details } =
          candidate;
        if (JSON.stringify(previousDetails) !== JSON.stringify(details))
          throw letterError(
            `Constituent ${candidate.constituentId} has conflicting recipient details across society queries. Review the output mappings before refreshing.`,
          );
        const emails = [
          ...new Set(
            [
              previousEmail,
              email,
              ...(previousEmails || []),
              ...(emailCandidates || []),
            ].filter(Boolean),
          ),
        ].sort();
        if (emails.length > 20)
          throw letterError(
            `Constituent ${candidate.constituentId} has more than 20 email values across society queries.`,
            413,
          );
        group.recipients.set(candidate.constituentId, {
          ...details,
          ...(previousContacts || organizationContacts
            ? {
                organizationContacts: mergeOrganizationContacts(
                  previousContacts,
                  organizationContacts,
                ),
              }
            : {}),
          email: emails.length === 1 ? emails[0] : "",
          ...(emails.length > 1 ? { emailCandidates: emails } : {}),
        });
      }
      group.qualifications.add(row.societyKey);
      group.memberNames.push(...(row.memberNames || []));
      group.sources.push({
        societyKey: cohort.societyKey,
        queryId: cohort.queryId,
      });
      groups.set(membership, group);
      if (groups.size > MAX_COMBINED_LETTER_HOUSEHOLDS)
        throw letterError(
          `The combined preview exceeds ${MAX_COMBINED_LETTER_HOUSEHOLDS.toLocaleString()} households. Reduce the query cohorts; no partial preview was saved.`,
          413,
        );
    }
  }
  return [...groups.values()]
    .map(
      ({
        row,
        recipients,
        memberNames: nameEntries,
        qualifications,
        sources,
      }) => {
        const qualifiedKeys = hierarchy
          .filter((d) => qualifications.has(d.key))
          .map((d) => d.key);
        const rank = hierarchy.findIndex((d) => d.key === qualifiedKeys[0]);
        const candidates = [...recipients.values()].sort(
          (a, b) =>
            a.constituentId.length - b.constituentId.length ||
            a.constituentId.localeCompare(b.constituentId),
        );
        const memberNames = combineMemberNames(nameEntries);
        return {
          ...row,
          memberNames,
          name: householdDisplayName(
            row.members,
            memberNames,
            candidates,
            row.name,
          ),
          recipientCandidates: candidates,
          membersOutsideQuery: row.members.filter((id) => !recipients.has(id)),
          societyKey: hierarchy[rank].key,
          societyName: hierarchy[rank].name,
          rank,
          qualifiedKeys,
          coveredKeys: hierarchy.slice(rank).map((d) => d.key),
          sourceQueries: sources,
          sourceMode: "society_queries",
        };
      },
    )
    .sort((a, b) => a.name.localeCompare(b.name));
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
      if (!column && Object.hasOwn(LETTER_NAME_COLUMNS, key)) return [key, -1];
      if (headers.filter((h) => h === column).length !== 1)
        throw letterError(
          `Choose a unique returned column for ${GROUPED_LETTER_LABELS[key]}.`,
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
      firstName: row.firstName || "",
      ...(row.preferredName ? { preferredName: row.preferredName } : {}),
      lastName: row.lastName || "",
      spouseFirstName: members.length === 2 ? row.spouseFirstName || "" : "",
      ...(members.length === 2 && row.spousePreferredName
        ? { spousePreferredName: row.spousePreferredName }
        : {}),
      spouseLastName: members.length === 2 ? row.spouseLastName || "" : "",
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

export function letterExclusionsForRow(row, exclusions = []) {
  return exclusions.filter(
    (item) =>
      !item.restoredAt &&
      item.period.start <= row.period.end &&
      item.period.end >= row.period.start &&
      (item.householdId === row.householdId ||
        item.members.some((member) => row.members.includes(member))),
  );
}

export function letterDisposition(row, history, exclusions = []) {
  if (letterExclusionsForRow(row, exclusions).length)
    return {
      status: "excluded",
      reason:
        "Excluded from all society letters for this period. Not marked sent.",
    };
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
  return letterNameIssue(row, template.usedFields || []);
}

const greetingName = (person) =>
  text(person?.preferredName) || text(person?.firstName);

function sourceLetterNameData(row) {
  if (row.organizationContactKey) {
    const candidate = row.recipientCandidates?.find(
      (item) => item.constituentId === row.recipientConstituentId,
    );
    const contact = organizationLetterContacts(candidate).find(
      (item) => contactChoiceKey(item) === row.organizationContactKey,
    );
    return {
      first_name: greetingName(contact),
      last_name: contact?.lastName || "",
      first_names: greetingName(contact),
      spouse_first_name: "",
      spouse_last_name: "",
    };
  }
  const members = row.members || [];
  let recipient = row;
  let spouse =
    members.length === 2
      ? {
          firstName: row.spouseFirstName,
          preferredName: row.spousePreferredName,
          lastName: row.spouseLastName,
        }
      : {};
  let firstNames =
    members.length === 1
      ? greetingName(row)
      : members.length === 2 && greetingName(row) && greetingName(spouse)
        ? `${greetingName(row)} & ${greetingName(spouse)}`
        : "";
  if (isLetterPreviewSource(row) || Array.isArray(row.memberNames)) {
    // A stable household key does not select the letter's recipient.
    const recipientId = text(
      row.recipientConstituentId || (members.length === 1 ? members[0] : ""),
    );
    recipient = members.includes(recipientId)
      ? row.memberNames?.find(
          (member) => member.constituentId === recipientId,
        ) || {}
      : {};
    spouse =
      members.length === 2 && members.includes(recipientId)
        ? row.memberNames?.find(
            (member) =>
              member.constituentId === members.find((id) => id !== recipientId),
          ) || {}
        : {};
    const names = members.map((id) =>
      greetingName(
        row.memberNames?.find((member) => member.constituentId === id),
      ),
    );
    firstNames = names.length && names.every(Boolean) ? names.join(" & ") : "";
  }
  return {
    first_name: greetingName(recipient),
    last_name: text(recipient.lastName),
    spouse_first_name: greetingName(spouse),
    spouse_last_name: text(spouse.lastName),
    first_names: firstNames,
  };
}

export function letterNameMergeData(row) {
  const source = sourceLetterNameData(row);
  return Object.fromEntries(
    LETTER_NAME_TAGS.map((key) => [
      key,
      Object.hasOwn(row.nameOverrides || {}, key)
        ? text(row.nameOverrides[key])
        : source[key],
    ]),
  );
}

export function suggestedLetterSalutation(row, candidate) {
  const fallback = text(candidate?.salutation);
  if (!candidate || isOrganizationLetterCandidate(candidate)) return fallback;
  const members = row.members || [];
  const names = members.map((id) =>
    row.memberNames?.find((member) => member.constituentId === id),
  );
  // Never drop a spouse from the greeting when only one name is available.
  if (
    names.some((member) => text(member?.preferredName)) &&
    names.every((member) => greetingName(member))
  )
    return names.map(greetingName).join(" & ");
  return fallback || (members.length === 1 ? greetingName(names[0]) : "");
}

export function letterNameIssue(row, usedFields) {
  const values = letterNameMergeData(row);
  const missing = usedFields.filter(
    (field) => LETTER_NAME_TAGS.includes(field) && !values[field],
  );
  return missing.length
    ? `Missing name value for ${missing.map((field) => `{${field}}`).join(", ")}. Review the name mappings and recipient, or use a different greeting before creating this letter.`
    : null;
}

export function letterMergeData(row, today, mergeSettings) {
  const settings = normalizeLetterMergeSettings(mergeSettings);
  const data = {
    addressee: row.addressee,
    salutation: row.salutation,
    ...letterNameMergeData(row),
    address: row.address,
    ...letterAddressMergeData(row),
    household_name: row.name,
    society_name: row.societyName,
    period_start: row.period.start,
    period_end: row.period.end,
    letter_date: today,
  };
  if (settings.dateFormat === "long_us") {
    for (const key of ["period_start", "period_end", "letter_date"]) {
      const date = dateOnly(data[key]);
      if (!date)
        throw letterError(
          "A letter date is invalid. Review the letter period.",
        );
      data[key] = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`));
    }
  }
  return Object.fromEntries(
    settings.fields.map((field) => [field, data[field]]),
  );
}

export function letterAddressMergeData(row) {
  const candidate = row.recipientCandidates?.find(
    (item) => item.constituentId === row.addressConstituentId,
  );
  // Never derive structured fields from a free-form address or reuse parts after edits.
  const parts =
    row.addressParts ??
    (candidate?.address === row.address ? candidate?.addressParts : null);
  return Object.fromEntries(
    LETTER_ADDRESS_TAGS.map((key) => [key, text(parts?.[key])]),
  );
}

export function formatLetterAddress(parts, comma = true) {
  return [
    parts.address_line_1,
    parts.address_line_2,
    [
      [parts.city, parts.state].filter(Boolean).join(comma ? ", " : " "),
      parts.zip,
    ]
      .filter(Boolean)
      .join(" "),
    parts.country,
  ]
    .filter(Boolean)
    .join("\n");
}

// Correct only an address assembled from known parts; never rewrite manual text.
export function normalizeLetterAddress(row, comma = true) {
  const candidate = row.recipientCandidates?.find(
    (item) => item.constituentId === row.addressConstituentId,
  );
  const parts =
    row.addressParts ||
    (candidate?.address === row.address ? candidate.addressParts : null);
  if (
    !parts ||
    ![formatLetterAddress(parts), formatLetterAddress(parts, false)].includes(
      row.address,
    )
  )
    return row;
  return {
    ...row,
    address: formatLetterAddress(parts, comma),
    addressParts: parts,
  };
}

export function mergeLetterText(template, data) {
  return String(template).replace(/\{([^{}]+)\}/g, (_, key) => {
    if (!LETTER_TAGS.includes(key.trim()))
      throw letterError(`Unknown template field: ${key}`);
    if (LETTER_NAME_TAGS.includes(key.trim()) && !text(data[key.trim()]))
      throw letterError(
        `Missing name value for {${key.trim()}}. Review the name mappings and recipient before creating this letter.`,
      );
    return data[key.trim()] || "";
  });
}
