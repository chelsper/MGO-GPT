// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deduplicateSocietyConstituentCsv } from "./societyConstituentQueryResult";
import {
  constituentQueryOutput,
  societyQuerySettings,
} from "../../../../test/societyQueryFixture";
import {
  constituentHouseholdsFromQuery,
  letterNameMergeData,
  letterPeriod,
  mergeSocietyLetterCohorts,
  validateLetterSettings,
} from "@/utils/societyLetters";
import {
  contactChoiceKey,
  organizationLetterContacts,
  validateOrganizationContactColumns,
} from "@/utils/societyLetterContacts";
import { getDefaultGivingSocietyConfigurations } from "./givingSocietyDefinitions";

const definitions = getDefaultGivingSocietyConfigurations();
const hierarchy = definitions
  .filter((d) => ["presidents_society", "order_of_the_dolphin"].includes(d.key))
  .sort((a, b) => a.displayOrder - b.displayOrder);
const settings = () => ({
  ...societyQuerySettings().societySources[0],
  sourceMode: "constituents",
  querySocietyKey: "presidents_society",
  columns: {
    ...societyQuerySettings().societySources[0].columns,
    constituencyCode: "Constituency Code",
    contactType: "Contact Type",
    contactFirstName: "Contact First Name",
    contactLastName: "Contact Last Name",
  },
});
const period = letterPeriod(societyQuerySettings(), "2026-09-25");
function read(records, config = settings()) {
  const output = constituentQueryOutput(records, config.columns);
  const csv = [output.headers, ...output.tableRows]
    .map((row) =>
      row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
  const table = deduplicateSocietyConstituentCsv(csv, config);
  return {
    table,
    rows: constituentHouseholdsFromQuery(
      {
        headers: table.headers,
        tableRows: table.rows,
        metadata: table.metadata,
      },
      config,
      hierarchy,
      period,
    ),
  };
}
const base = {
  constituentId: "10",
  constituencyCode: "Business",
  addressee: "Example Foundation",
  salutation: "Friends",
};
const main = {
  contactType: "Main Contact",
  contactFirstName: "Alex",
  contactLastName: "Sample",
};
const society = {
  contactType: "Society Letter Contact",
  contactFirstName: "Jamie",
  contactLastName: "Jones",
};

describe("organization contact query output", () => {
  it("deduplicates by qualifying constituent ID while preserving paired contact names and all constituency codes", () => {
    const { table, rows } = read([
      { ...base, ...main },
      { ...base, ...society },
      { ...base, ...main },
      { ...base, ...main, constituencyCode: "Other" },
      {
        ...base,
        contactType: "Former contact",
        contactFirstName: "Not",
        contactLastName: "Offered",
      },
    ]);
    expect(table.rows).toHaveLength(1);
    expect(table.metadata.deduplication).toMatchObject({
      rawRows: 5,
      uniqueConstituents: 1,
    });
    expect(rows[0].members).toEqual(["10"]);
    const candidate = rows[0].recipientCandidates[0];
    expect(candidate.address).toBe("123 Example Street\nJacksonville FL 32211");
    expect(organizationLetterContacts(candidate)).toEqual([
      { role: "Main contact", firstName: "Alex", lastName: "Sample" },
      { role: "Society letter contact", firstName: "Jamie", lastName: "Jones" },
    ]);
    expect(rows[0]).not.toHaveProperty("organizationContactKey");
    expect(rows[0].memberNames).toEqual([]);
  });
  it.each(["Business", "Foundation", " foundation "])(
    "offers contact names for %s",
    (constituencyCode) => {
      const { rows } = read([{ ...base, ...main, constituencyCode }]);
      expect(
        organizationLetterContacts(rows[0].recipientCandidates[0]),
      ).toHaveLength(1);
    },
  );
  it.each(["", "Alumnus", "Business owner", "Family Foundation"])(
    "does not guess organization eligibility from %s",
    (constituencyCode) => {
      const { rows } = read([{ ...base, ...main, constituencyCode }]);
      expect(
        organizationLetterContacts(rows[0].recipientCandidates[0]),
      ).toEqual([]);
    },
  );
  it("supports separately mapped Main and Society letter contact columns and preserves distinct options", () => {
    const config = settings();
    Object.assign(config.columns, {
      contactType: "",
      contactFirstName: "",
      contactLastName: "",
      mainContactFirstName: "Main given",
      mainContactLastName: "Main surname",
      societyContactFirstName: "Letter given",
      societyContactLastName: "Letter surname",
    });
    const { rows } = read(
      [
        {
          ...base,
          mainContactFirstName: "Alex",
          mainContactLastName: "Sample",
          societyContactFirstName: "Jamie",
          societyContactLastName: "Jones",
        },
        {
          ...base,
          mainContactFirstName: "Taylor",
          mainContactLastName: "Other",
          societyContactFirstName: "Jamie",
          societyContactLastName: "Jones",
        },
      ],
      config,
    );
    expect(
      organizationLetterContacts(rows[0].recipientCandidates[0]),
    ).toHaveLength(3);
  });
  it("preserves same-name options on different organizations without joining their identity", () => {
    const { rows } = read([
      { ...base, ...main },
      { ...base, ...main, constituentId: "20" },
    ]);
    expect(rows.map((row) => row.members)).toEqual([["10"], ["20"]]);
  });
  it("still rejects conflicting postal and household information", () => {
    expect(() =>
      read([
        { ...base, ...main },
        { ...base, ...society, address1: "Other address" },
      ]),
    ).toThrow(/conflicting/);
    expect(() =>
      read([
        { ...base, ...main },
        { ...base, ...society, spouseId: "20" },
      ]),
    ).toThrow(/conflicting/);
  });
  it("bounds contact choices and refuses malformed contact name values", () => {
    expect(() =>
      read(
        Array.from({ length: 21 }, (_, i) => ({
          ...base,
          ...main,
          contactFirstName: `Person ${i}`,
        })),
      ),
    ).toThrow(/too many contact/);
    expect(() =>
      read([{ ...base, ...main, contactFirstName: "A".repeat(151) }]),
    ).toThrow(/contact name is invalid/);
    expect(() =>
      read([{ ...base, ...main, contactFirstName: "Alex\nJamie" }]),
    ).toThrow(/contact name is invalid/);
  });
  it("unions options across society queries and keeps the highest letter and member IDs", () => {
    const upper = read([{ ...base, ...main }]).rows;
    const lower = read([{ ...base, ...society }], {
      ...settings(),
      querySocietyKey: "order_of_the_dolphin",
    }).rows;
    const cohorts = [
      { queryId: "31049", societyKey: "presidents_society", rows: upper },
      { queryId: "31043", societyKey: "order_of_the_dolphin", rows: lower },
    ];
    const combined = mergeSocietyLetterCohorts(cohorts, hierarchy, period);
    expect(combined).toHaveLength(1);
    expect(combined[0]).toMatchObject({
      societyKey: "presidents_society",
      members: ["10"],
    });
    expect(
      organizationLetterContacts(combined[0].recipientCandidates[0]),
    ).toHaveLength(2);
    expect(
      organizationLetterContacts(upper[0].recipientCandidates[0]),
    ).toHaveLength(1);
  });
  it("uses only the selected contact for name merging and never makes that contact a spouse", () => {
    const {
      rows: [row],
    } = read([
      { ...base, ...main },
      { ...base, ...society },
    ]);
    const contact = organizationLetterContacts(row.recipientCandidates[0])[1];
    expect(
      letterNameMergeData({
        ...row,
        recipientConstituentId: "10",
        organizationContactKey: contactChoiceKey(contact),
      }),
    ).toEqual({
      first_name: "Jamie",
      last_name: "Jones",
      first_names: "Jamie",
      spouse_first_name: "",
      spouse_last_name: "",
    });
    expect(
      letterNameMergeData({ ...row, recipientConstituentId: "10" }).first_name,
    ).toBe("");
    expect(
      letterNameMergeData({
        ...row,
        recipientConstituentId: "99",
        organizationContactKey: contactChoiceKey(contact),
      }).first_name,
    ).toBe("");
  });
  it("rejects incomplete source mappings and accepts saved contact mappings", () => {
    expect(() =>
      validateOrganizationContactColumns({ contactFirstName: "Contact" }),
    ).toThrow(/Constituency/);
    expect(() =>
      validateOrganizationContactColumns({
        constituencyCode: "Code",
        contactFirstName: "Contact",
      }),
    ).toThrow(/Contact type/);
    expect(() =>
      validateOrganizationContactColumns({
        constituencyCode: "Code",
        contactType: "Type",
      }),
    ).toThrow(/Contact type/);
    const raw = societyQuerySettings();
    raw.societySources[0].columns = settings().columns;
    expect(
      validateLetterSettings(raw, definitions, "2026-09-25").societySources[0]
        .columns,
    ).toEqual(settings().columns);
  });
});
