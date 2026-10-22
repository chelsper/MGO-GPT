import { describe, expect, it } from "vitest";
import { csvWorkspace } from "../../test/societyLetterCsvFixture";
import { contactChoiceKey } from "./societyLetterContacts";
import {
  csvRecipientWording,
  DEFAULT_CSV_FORMAT,
  formatCsvLetterDate,
  normalizeCsvFormat,
} from "./societyLetterCsvFormat";
import { societyLetterCsvPlan } from "./societyLetterCsvExport";

function household() {
  return {
    ...csvWorkspace().rows[0],
    members: ["1000", "2000"],
    memberNames: [
      {
        constituentId: "1000",
        firstName: "Alexandra",
        preferredName: "Alex",
        lastName: "Example",
      },
      {
        constituentId: "2000",
        firstName: "Christopher",
        preferredName: "",
        lastName: "Sample",
      },
    ],
    recipientCandidates: [
      {
        constituentId: "1000",
        addressee: "Dr. and Mr. Example",
        salutation: "Dr. Example",
      },
    ],
  };
}
function organization() {
  const row = csvWorkspace().rows[0];
  const contact = {
    role: "Main contact",
    firstName: "Jordan",
    preferredName: "Jo",
    lastName: "Sample",
  };
  return {
    ...row,
    name: "Example Foundation",
    addressee: "Example Foundation\nJordan Sample",
    salutation: "Jordan",
    includeOrganizationName: true,
    organizationContactKey: contactChoiceKey(contact),
    recipientCandidates: [
      {
        constituentId: "1000",
        addressee: "Example Foundation",
        salutation: "Friends",
        organizationContacts: {
          keyIndicator: "Organization",
          contacts: [
            contact,
            {
              role: "Society letter contact",
              firstName: "Other",
              lastName: "Person",
            },
          ],
        },
      },
    ],
  };
}
describe("CSV-only letter formatting", () => {
  it("uses preferred names with first-name fallback, preserving different last names and saved edits", () => {
    const row = household(),
      before = structuredClone(row);
    expect(
      csvRecipientWording(row, { addressee: "household_preferred" }),
    ).toEqual({
      salutation: "Alex & Christopher",
      addressee: "Alex Example & Christopher Sample",
      address: row.address,
    });
    expect(row).toEqual(before);
  });
  it("includes the shared last name once or on both names", () => {
    const row = household();
    row.memberNames[1].lastName = "Example";
    expect(
      csvRecipientWording(row, {
        addressee: "household_first",
        joiner: " and ",
      }).addressee,
    ).toBe("Alexandra and Christopher Example");
    expect(
      csvRecipientWording(row, {
        addressee: "household_preferred",
        sharedLastName: "repeat",
      }).addressee,
    ).toBe("Alex Example & Christopher Example");
  });
  it("uses the selected individual rather than the household key", () => {
    const row = household();
    row.recipientConstituentId = "2000";
    expect(
      csvRecipientWording(row, {
        addressee: "individual_preferred",
        salutation: "individual_preferred",
      }),
    ).toMatchObject({
      salutation: "Christopher",
      addressee: "Christopher Sample",
    });
  });
  it("supports a single recipient without a spouse and explicit first-name formats", () => {
    const row = csvWorkspace().rows[0];
    expect(
      csvRecipientWording(row, { addressee: "household_preferred" }),
    ).toMatchObject({ salutation: "Al", addressee: "Al Example" });
    expect(
      csvRecipientWording(row, {
        salutation: "individual_first",
        addressee: "individual_first",
      }),
    ).toMatchObject({ salutation: "Alex", addressee: "Alex Example" });
  });
  it("keeps reviewed wording distinct from the record's original wording", () => {
    const row = household();
    expect(
      csvRecipientWording(row, {
        salutation: "reviewed",
        addressee: "reviewed",
      }),
    ).toMatchObject({ salutation: row.salutation, addressee: row.addressee });
    expect(
      csvRecipientWording(row, { salutation: "record", addressee: "record" }),
    ).toMatchObject({
      salutation: "Dr. Example",
      addressee: "Dr. and Mr. Example",
    });
    row.nameOverrides = { first_names: "Alex and Chris", first_name: "Ally" };
    expect(
      csvRecipientWording(row, { addressee: "individual_preferred" }),
    ).toMatchObject({
      salutation: "Alex and Chris",
      addressee: "Ally Example",
    });
  });
  it("does not silently drop an unnamed spouse or invent missing record wording", () => {
    const row = household();
    row.memberNames[1].firstName = "";
    expect(() => csvRecipientWording(row, {})).toThrow(
      /no household member was dropped/,
    );
    row.nameOverrides = { first_names: "Alex and Chris" };
    expect(csvRecipientWording(row, {}).salutation).toBe("Alex and Chris");
    row.recipientCandidates[0].salutation = "";
    expect(() => csvRecipientWording(row, { salutation: "record" })).toThrow(
      /no salutation/,
    );
  });
  it("moves an organization to the full address without duplication or changing the physical address", () => {
    const row = organization(),
      before = structuredClone(row);
    expect(
      csvRecipientWording(row, {
        organization: "address",
        addressee: "household_preferred",
      }),
    ).toEqual({
      addressee: "Jo Sample",
      salutation: "Jo",
      address: `Example Foundation\n${row.address}`,
    });
    expect(csvRecipientWording(row, { organization: "omit" })).toMatchObject({
      addressee: "Jordan Sample",
      address: row.address,
    });
    expect(row).toEqual(before);
  });
  it("keeps reviewed organization placement for generated contact names", () => {
    expect(
      csvRecipientWording(organization(), { addressee: "individual_first" })
        .addressee,
    ).toBe("Example Foundation\nJordan Sample");
  });
  it("never picks an organization contact automatically or uses contact IDs for appeals", () => {
    const row = organization();
    delete row.organizationContactKey;
    expect(() => csvRecipientWording(row, {})).toThrow(
      /Choose this organization's contact/,
    );
    expect(row.members).toEqual(["1000"]);
    row.recipientCandidates[0].organizationContacts.contacts = [];
    expect(csvRecipientWording(row, {}).salutation).toBe("Jordan");
  });
  it.each([
    ["long_us", "October 12, 2026"],
    ["short_us", "10/12/2026"],
    ["iso", "2026-10-12"],
  ])("formats the chosen date as %s", (format, expected) => {
    expect(formatCsvLetterDate("2026-10-12", format)).toBe(expected);
  });
  it.each([
    null,
    [],
    { unknown: true },
    { addressee: "guess" },
    { greetingField: "__proto__" },
    { organization: true },
    { joiner: "<script>" },
  ])("rejects invalid format choices %j", (value) => {
    expect(() => normalizeCsvFormat(value)).toThrow(/CSV formatting/);
  });
  it("maps the updated Dolphin letter's First_Name field to the chosen greeting and keeps canonical names", () => {
    const data = csvWorkspace();
    data.rows[0] = household();
    data.templates[0].mergeSettings.wordBindings.First_Name = "first_names";
    const plan = societyLetterCsvPlan(data, "ood", "2026-10-15", {
      ...DEFAULT_CSV_FORMAT,
      salutation: "individual_first",
      addressee: "household_preferred",
      dateFormat: "short_us",
    });
    expect(plan.issue).toBe("");
    expect(plan.omitted).toEqual([]);
    const values = Object.fromEntries(
      plan.columns.map((column, i) => [column.name, plan.entries[0].cells[i]]),
    );
    expect(values).toMatchObject({
      First_Name: "Alexandra",
      salutation: "Alexandra",
      first_names: "Alex & Christopher",
      app_first_name: "Alex",
      addressee: "Alex Example & Christopher Sample",
      letter_date: "10/15/2026",
      app_member_ids: "1000|2000",
    });
  });
  it("retains legacy exports and rejects unsafe newly formatted names", () => {
    const data = csvWorkspace();
    const old = societyLetterCsvPlan(data, "ood", data.today);
    data.csvFormats = { ood: { salutation: "individual_first" } };
    expect(societyLetterCsvPlan(data, "ood", data.today)).toEqual(old);
    data.rows[0].nameOverrides = { first_names: "=SUM(1)" };
    const result = societyLetterCsvPlan(data, "ood", data.today, {});
    expect(result.entries).toEqual([]);
    expect(result.omitted[0].reason).toMatch(/spreadsheet formula/);
  });
  it("makes the updated Word copy's four fields follow CSV choices, not conflicting older aliases", () => {
    const data = csvWorkspace();
    data.rows[0] = household();
    data.templates[0].wordFields.fields = [
      { name: "letter_date", suggestedField: "letter_date" },
      { name: "Addressee", suggestedField: "addressee" },
      { name: "address", suggestedField: "address" },
      { name: "First_Name", suggestedField: "first_name" },
    ];
    data.templates[0].mergeSettings.wordBindings = {
      Addressee: "household_name",
      First_Name: "first_names",
    };
    const result = societyLetterCsvPlan(data, "ood", "2026-10-15", {
      addressee: "household_preferred",
      salutation: "individual_first",
    });
    const output = Object.fromEntries(
      result.columns.map((column, index) => [
        column.name,
        result.entries[0].cells[index],
      ]),
    );
    expect(output).toMatchObject({
      letter_date: "October 15, 2026",
      Addressee: "Alex Example & Christopher Sample",
      address: data.rows[0].address,
      First_Name: "Alexandra",
    });
  });
});
