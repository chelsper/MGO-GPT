import { describe, expect, it } from "vitest";
import {
  constituentHouseholdsFromQuery,
  letterNameMergeData,
  letterPeriod,
  mergeSocietyLetterCohorts,
  suggestedLetterSalutation,
} from "./societyLetters";
import {
  constituentQueryOutput,
  societyQuerySettings,
} from "../../test/societyQueryFixture";

const settings = societyQuerySettings();
const period = letterPeriod(settings, "2026-09-28");
const hierarchy = [
  { key: "presidents_society", name: "President's Society" },
  { key: "order_of_the_dolphin", name: "Order of the Dolphin" },
];
const source = {
  ...settings.societySources[0],
  querySocietyKey: "presidents_society",
  columns: {
    ...settings.societySources[0].columns,
    firstName: "First",
    lastName: "Last",
    preferredName: "Preferred",
    spouseFirstName: "Spouse First",
    spouseLastName: "Spouse Last",
    spousePreferredName: "Spouse Preferred",
  },
};
const own = {
  constituentId: "10",
  firstName: "Alexandra",
  lastName: "Example",
  preferredName: "Alex",
  salutation: "Dr. Example",
};
function rows(records) {
  return constituentHouseholdsFromQuery(
    constituentQueryOutput(records, source.columns),
    source,
    hierarchy,
    period,
  );
}

describe("society letter preferred greetings", () => {
  it("retains formal names for identity/display but prefers a nickname in letter fields", () => {
    const [row] = rows([own]);
    expect(row.memberNames[0]).toMatchObject({
      firstName: "Alexandra",
      preferredName: "Alex",
      name: "Alexandra Example",
    });
    expect(suggestedLetterSalutation(row, row.recipientCandidates[0])).toBe(
      "Alex",
    );
    expect(letterNameMergeData(row).first_name).toBe("Alex");
    expect(row.recipientCandidates[0].salutation).toBe("Dr. Example");
  });
  it("uses both spouses' preferred names and falls back independently to first names", () => {
    const [row] = rows([
      {
        ...own,
        spouseId: "11",
        spouseFirstName: "Patricia",
        spousePreferredName: "Pat",
        spouseLastName: "Sample",
      },
    ]);
    expect(suggestedLetterSalutation(row, row.recipientCandidates[0])).toBe(
      "Alex & Pat",
    );
    expect(
      letterNameMergeData({ ...row, recipientConstituentId: "10" }),
    ).toMatchObject({
      first_name: "Alex",
      spouse_first_name: "Pat",
      first_names: "Alex & Pat",
    });
    row.memberNames[1].preferredName = "";
    expect(suggestedLetterSalutation(row, row.recipientCandidates[0])).toBe(
      "Alex & Patricia",
    );
    row.memberNames[0].preferredName = "";
    expect(suggestedLetterSalutation(row, row.recipientCandidates[0])).toBe(
      "Dr. Example",
    );
  });
  it("never silently omits a spouse with missing name data or treats an organization as a person", () => {
    const [row] = rows([{ ...own, spouseId: "11" }]);
    expect(suggestedLetterSalutation(row, row.recipientCandidates[0])).toBe(
      "Dr. Example",
    );
    row.recipientCandidates[0].organizationContacts = {
      keyIndicator: "organization",
      contacts: [],
    };
    row.members = ["10"];
    expect(suggestedLetterSalutation(row, row.recipientCandidates[0])).toBe(
      "Dr. Example",
    );
  });
  it("uses the member's own preferred name over the spouse row across society cohorts", () => {
    const upper = rows([
      {
        ...own,
        spouseId: "11",
        spouseFirstName: "Patricia",
        spousePreferredName: "Pat",
        spouseLastName: "Sample",
      },
    ]);
    const lower = rows([
      {
        constituentId: "11",
        spouseId: "10",
        firstName: "Patricia",
        preferredName: "Patti",
        lastName: "Sample",
        spouseFirstName: "Alexandra",
        spouseLastName: "Example",
      },
    ]);
    lower[0].societyKey = "order_of_the_dolphin";
    const [merged] = mergeSocietyLetterCohorts(
      [
        { queryId: "1", societyKey: "presidents_society", rows: upper },
        { queryId: "2", societyKey: "order_of_the_dolphin", rows: lower },
      ],
      hierarchy,
      period,
    );
    expect(
      suggestedLetterSalutation(merged, merged.recipientCandidates[0]),
    ).toBe("Alex & Patti");
    expect(merged.societyKey).toBe("presidents_society");
    expect(merged.members).toEqual(["10", "11"]);
  });
  it("applies only explicitly overridden name values without altering source names", () => {
    const [row] = rows([own]);
    const edited = {
      ...row,
      nameOverrides: { first_name: "Lex", first_names: "Our friend Lex" },
    };
    expect(letterNameMergeData(edited)).toMatchObject({
      first_name: "Lex",
      first_names: "Our friend Lex",
      last_name: "Example",
    });
    expect(letterNameMergeData(row).first_name).toBe("Alex");
  });
});
