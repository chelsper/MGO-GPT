import { describe, expect, it } from "vitest";
import {
  LETTER_COLUMNS,
  GROUPED_LETTER_COLUMNS,
  CONSTITUENT_LETTER_COLUMNS,
  verifyConstituentLetterIdColumns,
  dateOnly,
  letterPeriod,
  householdsFromQuery,
  letterDisposition,
  letterIssue,
  validateLetterSettings,
  mergeLetterText,
  letterMergeData,
  letterNameMergeData,
  letterHierarchy,
  formatLetterAddress,
  normalizeLetterAddress,
} from "./societyLetters";

const definitions = [
  {
    key: "presidents_society",
    name: "President's Society",
    active: true,
    basis: "annual",
    displayOrder: 1,
  },
  {
    key: "order_of_the_dolphin",
    name: "Order of the Dolphin",
    active: true,
    basis: "annual",
    displayOrder: 2,
  },
];
const settings = {
  queryId: "123",
  periodBasis: "calendar_year",
  societyKeys: definitions.map((d) => d.key),
  columns: LETTER_COLUMNS,
};
const period = letterPeriod(settings, "2026-09-22");
const rawRow = {
  householdId: "10",
  memberIds: "10|11",
  name: "Sample Household",
  society: "presidents_society",
  addressee: "Alex and Pat Sample",
  salutation: "Alex and Pat",
  address: "10 Test Street\nJacksonville, FL 32211",
  email: "sample@example.org",
  emailAllowed: "Yes",
  mailAllowed: "Yes",
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
};
const table = (...rows) => ({
  headers: Object.values(LETTER_COLUMNS),
  tableRows: rows.map((row) =>
    Object.keys(LETTER_COLUMNS).map((key) => row[key]),
  ),
});

describe("letter address punctuation", () => {
  const parts = {
    address_line_1: "10 Test Street",
    address_line_2: "",
    city: "Jacksonville",
    state: "FL",
    zip: "32211",
    country: "",
  };
  it("separates city and state, omits blank lines, and leaves ZIP space-separated", () => {
    expect(formatLetterAddress(parts)).toBe(
      "10 Test Street\nJacksonville, FL 32211",
    );
    expect(formatLetterAddress({ ...parts, state: "" })).toBe(
      "10 Test Street\nJacksonville 32211",
    );
    expect(formatLetterAddress({ ...parts, city: "" })).toBe(
      "10 Test Street\nFL 32211",
    );
    expect(formatLetterAddress({ ...parts, city: "", state: "" })).toBe(
      "10 Test Street\n32211",
    );
  });
  it("upgrades only a matching structured address without changing manual wording", () => {
    const old = {
      addressParts: parts,
      address: formatLetterAddress(parts, false),
    };
    expect(normalizeLetterAddress(old).address).toBe(
      formatLetterAddress(parts),
    );
    expect(normalizeLetterAddress(normalizeLetterAddress(old), false)).toEqual(
      old,
    );
    const edited = { ...old, address: "Use the PO Box instead" };
    expect(normalizeLetterAddress(edited)).toBe(edited);
    expect(normalizeLetterAddress({ address: old.address }).address).toBe(
      old.address,
    );
  });
});

describe("constituent query household previews", () => {
  const previewSettings = {
    ...settings,
    sourceMode: "constituents",
    columns: CONSTITUENT_LETTER_COLUMNS,
    querySocietyKey: "order_of_the_dolphin",
    queryPeriodStart: period.start,
    queryPeriodEnd: period.end,
  };
  const row = {
    constituentId: "10",
    spouseId: "11",
    addressee: "Alex Sample",
    salutation: "Alex",
    address1: "10 Test Street",
    address2: "",
    city: "Jacksonville",
    state: "FL",
    postalCode: "32211",
    email: "alex@example.org",
  };
  const output = (...rows) => {
    const entries = Object.entries(CONSTITUENT_LETTER_COLUMNS).filter(
      ([, name]) => name,
    );
    return {
      headers: [...entries.map(([, name]) => name), "Constituency Code"],
      tableRows: rows.map((r, i) => [
        ...entries.map(([key]) => r[key] || ""),
        `Code ${i}`,
      ]),
    };
  };
  const group = (...rows) =>
    householdsFromQuery(output(...rows), previewSettings, definitions, period);
  const nameColumns = {
    ...CONSTITUENT_LETTER_COLUMNS,
    firstName: "First Name",
    lastName: "Last Name",
    spouseFirstName: "Spouse First Name",
    spouseLastName: "Spouse Last Name",
  };
  const namedGroup = (...rows) => {
    const entries = Object.entries(nameColumns).filter(([, name]) => name);
    return householdsFromQuery(
      {
        headers: entries.map(([, name]) => name),
        tableRows: rows.map((row) => entries.map(([key]) => row[key] || "")),
      },
      { ...previewSettings, columns: nameColumns },
      definitions,
      period,
    );
  };
  it("uses both mapped full names for display without changing IDs, greetings or eligibility", () => {
    const [household] = namedGroup({
      ...row,
      firstName: " Alex ",
      lastName: "Smith",
      spouseFirstName: "Jordan",
      spouseLastName: "Jones",
    });
    expect(household.name).toBe("Alex Smith & Jordan Jones");
    expect(household.members).toEqual(["10", "11"]);
    expect(household.membersOutsideQuery).toEqual(["11"]);
    expect(household.addressee).toBe("");
    expect(household.recipientCandidates[0]).toMatchObject({
      addressee: "Alex Sample",
      salutation: "Alex",
    });
    expect(household.mailAllowed).toBe(false);
    expect(
      letterDisposition(household, [
        { ...household, name: "Old label", status: "mailed" },
      ]).status,
    ).toBe("covered");
  });
  it("ignores spouse names without a spouse ID and never merges identical names", () => {
    const named = {
      ...row,
      spouseId: "",
      firstName: "Alex",
      lastName: "Smith",
      spouseFirstName: "Jordan",
      spouseLastName: "Jones",
    };
    const result = namedGroup(named, { ...named, constituentId: "20" });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toEqual(["Alex Smith", "Alex Smith"]);
    expect(result[0].members).toEqual(["10"]);
    expect(result[0].memberNames).toHaveLength(1);
  });
  it("deduplicates reciprocal spouses by ID and prefers each person's own name", () => {
    const main = {
      ...row,
      firstName: "Alex",
      lastName: "Smith",
      spouseFirstName: "J.",
      spouseLastName: "Jones",
    };
    const spouse = {
      ...row,
      constituentId: "11",
      spouseId: "10",
      firstName: "Jordan",
      lastName: "Jones",
      spouseFirstName: "A.",
      spouseLastName: "Smith",
    };
    expect(namedGroup(main, spouse)).toEqual(namedGroup(spouse, main));
    expect(namedGroup(main, spouse)[0].name).toBe("Alex Smith & Jordan Jones");
    const sameName = { ...spouse, firstName: "Alex", lastName: "Smith" };
    expect(namedGroup(main, sameName)[0].name).toBe("Alex Smith & Alex Smith");
  });
  it("falls back to existing addressees when member names are incomplete and saves optional name mappings", () => {
    expect(
      namedGroup({ ...row, firstName: "Alex", lastName: "Smith" })[0].name,
    ).toBe("Alex Sample");
    const saved = validateLetterSettings(
      { ...previewSettings, columns: nameColumns, confirmSource: true },
      definitions,
      "2026-09-24",
    );
    expect(saved.columns).toEqual(nameColumns);
    expect(group(row)[0].memberNames).toEqual([]);
  });
  it("groups reciprocal spouses once and ignores duplicate constituency rows", () => {
    const [household] = group(row, row, {
      ...row,
      constituentId: "11",
      spouseId: "10",
      addressee: "Pat Sample",
      salutation: "Pat",
    });
    expect(household.members).toEqual(["10", "11"]);
    expect(household.recipientCandidates).toHaveLength(2);
    expect(household.membersOutsideQuery).toEqual([]);
    expect(household).toMatchObject({
      householdId: "10",
      emailAllowed: false,
      mailAllowed: false,
      addressee: "",
      sourceMode: "constituents",
    });
    expect(group(row, row)).toHaveLength(1);
  });
  it("retains a spouse outside the query without claiming to verify that spouse", () => {
    expect(group(row)[0].membersOutsideQuery).toEqual(["11"]);
    expect(group({ ...row, spouseId: "" })[0].members).toEqual(["10"]);
  });
  it("assembles separate preferred address fields and computes household labels without extra NXT columns", () => {
    const [household] = group({ ...row, address2: "Suite 200" });
    expect(household.name).toBe("Alex Sample");
    expect(household.members).toEqual(["10", "11"]);
    expect(household.recipientCandidates[0].address).toBe(
      "10 Test Street\nSuite 200\nJacksonville, FL 32211",
    );
    const [individual] = group({ ...row, spouseId: "", address2: "  " });
    expect(individual.members).toEqual(["10"]);
    expect(individual.recipientCandidates[0].address).toBe(
      "10 Test Street\nJacksonville, FL 32211",
    );
    expect(individual.mailAllowed).toBe(false);
    expect(individual.addressee).toBe("");
  });
  it("never merges unrelated people by matching names, addresses, or email", () => {
    expect(
      group(
        { ...row, spouseId: "" },
        { ...row, constituentId: "20", spouseId: "" },
      ),
    ).toHaveLength(2);
  });
  it("has stable grouping keys regardless of query order and different member ID lengths", () => {
    const a = { ...row, constituentId: "9", spouseId: "100" };
    const b = { ...row, constituentId: "100", spouseId: "9", addressee: "Pat" };
    expect(group(a, b)).toEqual(group(b, a));
    expect(group(a, b)[0].householdId).toBe("9");
  });
  it.each([
    [{ ...row, spouseId: "10" }],
    [{ ...row, spouseId: "bad-id" }],
    [row, { ...row, spouseId: "12" }],
    [row, { ...row, email: "different@example.org" }],
    [row, { ...row, constituentId: "11", spouseId: "12" }],
    [
      { ...row, constituentId: "11", spouseId: "10" },
      { ...row, constituentId: "12", spouseId: "10" },
    ],
    [row, { ...row, constituentId: "11", spouseId: "" }],
  ])(
    "rejects conflicting or invalid identity/recipient rows (%#)",
    (...rows) => {
      expect(() => group(...rows)).toThrow();
    },
  );
  it("retains identifiers for the existing same-period duplicate-letter ledger", () => {
    const household = group(row)[0];
    expect(
      letterDisposition(household, [
        { ...household, householdId: "11", status: "mailed" },
      ]).status,
    ).toBe("covered");
  });
  it("does not silently reuse a fixed 2026 query in 2027", () => {
    expect(() =>
      householdsFromQuery(
        output(row),
        previewSettings,
        definitions,
        letterPeriod(settings, "2027-01-01"),
      ),
    ).toThrow(/period/);
  });
  it("requires distinct mapped columns but permits blank optional mappings", () => {
    expect(
      validateLetterSettings(
        { ...previewSettings, confirmSource: true },
        definitions,
        "2026-09-24",
      ).sourceMode,
    ).toBe("constituents");
    expect(() =>
      validateLetterSettings(
        {
          ...previewSettings,
          columns: {
            ...previewSettings.columns,
            spouseId: previewSettings.columns.constituentId,
          },
          confirmSource: true,
        },
        definitions,
        "2026-09-24",
      ),
    ).toThrow(/distinct/);
    const data = output(row);
    data.headers[0] = "Constituent ID";
    expect(() =>
      householdsFromQuery(data, previewSettings, definitions, period),
    ).toThrow(/system record ID/);
  });
  it("checks field metadata rather than trusting renamed lookup ID columns", () => {
    const definition = {
      select_fields: [
        {
          query_field: {
            available_field_name: "System Record ID",
            selected_field_name: "System Record ID",
            node_path: [{ id: "296" }],
          },
        },
        {
          query_field: {
            available_field_name: "System Record ID",
            selected_field_name: "Spouse System Record ID",
            node_path: [{ id: "10516" }, { id: "10517" }],
          },
        },
      ],
    };
    expect(() =>
      verifyConstituentLetterIdColumns(definition, previewSettings),
    ).not.toThrow();
    definition.select_fields[1].query_field.available_field_name =
      "Constituent ID";
    expect(() =>
      verifyConstituentLetterIdColumns(definition, previewSettings),
    ).toThrow(/lookup IDs/);
  });
});
const parse = (...rows) =>
  householdsFromQuery(table(...rows), settings, definitions, period);

describe("household society letters", () => {
  it("accepts optional recipient-name columns in reviewed grouped queries without requiring them in old queries", () => {
    const columns = {
      ...GROUPED_LETTER_COLUMNS,
      firstName: "Given",
      lastName: "Surname",
      spouseFirstName: "Partner Given",
      spouseLastName: "Partner Surname",
    };
    const saved = validateLetterSettings(
      { ...settings, columns, confirmSource: true },
      definitions,
      "2026-09-24",
    );
    const values = {
      ...rawRow,
      firstName: "Alex",
      lastName: "Smith",
      spouseFirstName: "Pat",
      spouseLastName: "Jones",
    };
    const entries = Object.entries(columns).filter(([, name]) => name);
    const [recipient] = householdsFromQuery(
      {
        headers: entries.map(([, name]) => name),
        tableRows: [entries.map(([key]) => values[key])],
      },
      saved,
      definitions,
      period,
    );
    expect(letterNameMergeData(recipient)).toEqual({
      first_name: "Alex",
      last_name: "Smith",
      spouse_first_name: "Pat",
      spouse_last_name: "Jones",
      first_names: "Alex & Pat",
    });
    expect(parse(rawRow)[0].firstName).toBe("");
  });
  it("does not derive name merge values by splitting addressees or household labels", () => {
    expect(
      letterNameMergeData({
        members: ["10"],
        salutation: "Dr. Alex Sample",
        name: "Alex & Pat",
      }).first_name,
    ).toBe("");
    expect(() =>
      mergeLetterText("Dear {first_name},", { salutation: "Alex" }),
    ).toThrow(/Missing name value/);
  });
  it("uses both first names without choosing a recipient from the smallest household ID", () => {
    const row = {
      sourceMode: "constituents",
      householdId: "10",
      members: ["10", "11"],
      memberNames: [
        { constituentId: "10", firstName: "Alex", lastName: "Smith" },
        { constituentId: "11", firstName: "Pat", lastName: "Jones" },
      ],
    };
    expect(letterNameMergeData(row)).toMatchObject({
      first_names: "Alex & Pat",
      first_name: "",
      spouse_first_name: "",
    });
    expect(
      letterNameMergeData({ ...row, recipientConstituentId: "11" }),
    ).toEqual({
      first_name: "Pat",
      last_name: "Jones",
      spouse_first_name: "Alex",
      spouse_last_name: "Smith",
      first_names: "Alex & Pat",
    });
    expect(
      letterNameMergeData({ ...row, recipientConstituentId: "999" }).first_name,
    ).toBe("");
    expect(letterNameMergeData({ ...row, members: ["10"] })).toMatchObject({
      first_name: "Alex",
      first_names: "Alex",
      spouse_first_name: "",
    });
    expect(
      letterNameMergeData({ ...row, memberNames: row.memberNames.slice(0, 1) })
        .first_names,
    ).toBe("");
  });
  it("reports missing name fields only if used by that template", () => {
    const row = { ...parse(rawRow)[0], mailAllowed: true };
    expect(letterIssue(row, "post", { usedFields: ["first_name"] })).toMatch(
      /Missing name value for \{first_name\}/,
    );
    expect(letterIssue(row, "post", { usedFields: ["salutation"] })).toBeNull();
    expect(
      letterMergeData({ ...row, firstName: "Alex" }, "2026-09-24", {
        fields: ["first_name"],
      }),
    ).toEqual({ first_name: "Alex" });
  });
  it("validates real dates and handles leap years", () => {
    expect(dateOnly("2/29/2024")).toBe("2024-02-29");
    expect(dateOnly("2026-02-29")).toBeNull();
    expect(dateOnly("2026-13-01")).toBeNull();
  });
  it("uses complete period boundaries, including fiscal and custom periods", () => {
    expect(period).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
      key: "2026-01-01/2026-12-31",
    });
    expect(
      letterPeriod(
        { periodBasis: "fiscal_year", fiscalYearStartMonth: 7 },
        "2026-06-30",
      ).key,
    ).toBe("2025-07-01/2026-06-30");
    expect(
      letterPeriod(
        { periodBasis: "fiscal_year", fiscalYearStartMonth: 7 },
        "2026-07-01",
      ).key,
    ).toBe("2026-07-01/2027-06-30");
    expect(
      letterPeriod(
        {
          periodBasis: "custom",
          startDate: "2026-03-01",
          endDate: "2026-11-30",
        },
        "2026-09-22",
      ).key,
    ).toBe("2026-03-01/2026-11-30");
    expect(() =>
      letterPeriod(
        {
          periodBasis: "custom",
          startDate: "2026-12-01",
          endDate: "2026-01-01",
        },
        "2026-09-22",
      ),
    ).toThrow();
  });
  it("requires an explicitly confirmed source and separate mapped fields", () => {
    expect(() =>
      validateLetterSettings(settings, definitions, "2026-09-22"),
    ).toThrow(/Confirm/);
    expect(
      validateLetterSettings(
        { ...settings, confirmSource: true },
        definitions,
        "2026-09-22",
      ).queryId,
    ).toBe("123");
    expect(() =>
      validateLetterSettings(
        {
          ...settings,
          confirmSource: true,
          columns: { ...LETTER_COLUMNS, memberIds: LETTER_COLUMNS.householdId },
        },
        definitions,
        "2026-09-22",
      ),
    ).toThrow(/distinct/);
    expect(
      letterHierarchy(definitions, {
        societyKeys: [...settings.societyKeys].reverse(),
      }).map((d) => d.key),
    ).toEqual(settings.societyKeys);
  });
  it("produces one highest letter and explicitly covers the lower society", () => {
    const rows = parse(
      rawRow,
      { ...rawRow, society: "order_of_the_dolphin" },
      rawRow,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      societyKey: "presidents_society",
      coveredKeys: ["presidents_society", "order_of_the_dolphin"],
    });
    expect(letterDisposition(rows[0], [])).toMatchObject({ status: "ready" });
  });
  it("covers the lower letter even if the higher amount excludes it from query results", () => {
    expect(parse(rawRow)[0].coveredKeys).toEqual([
      "presidents_society",
      "order_of_the_dolphin",
    ]);
  });
  it("accepts configured society names without fuzzy name matching", () => {
    expect(
      parse({ ...rawRow, society: "President's Society" })[0].societyKey,
    ).toBe("presidents_society");
    expect(() => parse({ ...rawRow, society: "President" })).toThrow(/society/);
  });
  it("blocks wrong periods, missing identities, conflicting recipients and overlapping households", () => {
    expect(() => parse({ ...rawRow, periodStart: "2025-01-01" })).toThrow(
      /period/,
    );
    expect(() => parse({ ...rawRow, householdId: "Alex" })).toThrow(
      /identities/,
    );
    expect(() => parse({ ...rawRow, memberIds: "11" })).toThrow(/identities/);
    expect(() =>
      parse(rawRow, { ...rawRow, email: "different@example.org" }),
    ).toThrow(/conflicting/);
    expect(() => parse(rawRow, { ...rawRow, householdId: "11" })).toThrow(
      /different households/,
    );
  });
  it("blocks duplicate/missing mapped headers without discarding the source error", () => {
    const output = table(rawRow);
    output.headers[0] = "Unexpected";
    expect(() =>
      householdsFromQuery(output, settings, definitions, period),
    ).toThrow(/Household ID/);
  });
  it.each(["sending", "pending_email", "needs_review", "prepared"])(
    "holds %s across channels and even a higher qualification",
    (status) => {
      const high = parse(rawRow)[0],
        low = parse({ ...rawRow, society: "order_of_the_dolphin" })[0];
      expect(
        letterDisposition(high, [{ ...low, status, channel: "email" }]).status,
      ).toBe("held");
    },
  );
  it.each(["mailed", "emailed", "delivered"])(
    "never resuggests an acknowledged household (%s)",
    (status) => {
      const row = parse(rawRow)[0];
      expect(letterDisposition(row, [{ ...row, status }]).status).toBe(
        "covered",
      );
      const low = parse({ ...rawRow, society: "order_of_the_dolphin" })[0];
      expect(letterDisposition(low, [{ ...row, status }]).status).toBe(
        "covered",
      );
    },
  );
  it("permits a higher-tier upgrade, but not a lower letter after it", () => {
    const high = parse(rawRow)[0],
      low = parse({ ...rawRow, society: "order_of_the_dolphin" })[0];
    expect(letterDisposition(high, [{ ...low, status: "mailed" }])).toEqual({
      status: "ready",
      reason: "New higher society qualification",
    });
  });
  it("remembers member IDs when the designated household head changes", () => {
    const original = parse(rawRow)[0];
    const changed = parse({ ...rawRow, householdId: "11" })[0];
    expect(
      letterDisposition(changed, [{ ...original, status: "delivered" }]).status,
    ).toBe("covered");
  });
  it("requalifies in a new period and releases only explicitly cancelled preparations", () => {
    const row = parse(rawRow)[0];
    expect(
      letterDisposition(row, [
        { ...row, period: { key: "2025-01-01/2025-12-31" }, status: "mailed" },
      ]).status,
    ).toBe("ready");
    expect(
      letterDisposition(row, [{ ...row, status: "cancelled" }]).status,
    ).toBe("ready");
  });
  it("requires channel-specific permission instead of guessing contact eligibility", () => {
    const row = parse({ ...rawRow, emailAllowed: "", mailAllowed: "No" })[0];
    expect(letterIssue(row, "email", {})).toMatch(/eligibility/);
    expect(letterIssue(row, "post", {})).toMatch(/eligibility/);
    expect(
      letterIssue(
        { ...row, emailAllowed: true, email: "a@example.org,b@example.org" },
        "email",
        {},
      ),
    ).toMatch(/single/);
    expect(letterIssue(row, "post", null)).toMatch(/template/);
  });
  it("merges only the approved flat fields", () => {
    expect(mergeLetterText("Dear {salutation}", { salutation: "Alex" })).toBe(
      "Dear Alex",
    );
    expect(() => mergeLetterText("{constructor}", {})).toThrow(/Unknown/);
  });
});
