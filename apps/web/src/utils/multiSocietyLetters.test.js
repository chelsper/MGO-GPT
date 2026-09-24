import { describe, expect, it } from "vitest";
import { getDefaultGivingSocietyConfigurations } from "../app/api/utils/givingSocietyDefinitions";
import {
  constituentQueryOutput,
  societyQuerySettings,
} from "../../test/societyQueryFixture";
import {
  constituentHouseholdsFromQuery,
  CONSTITUENT_LETTER_COLUMNS,
  letterPeriod,
  letterDisposition,
  mergeSocietyLetterCohorts,
  validateLetterSettings,
} from "./societyLetters";

const definitions = getDefaultGivingSocietyConfigurations();
const today = "2026-09-24";
const settings = societyQuerySettings();
const period = letterPeriod(settings, today);
const cohort = (index, records, columns = CONSTITUENT_LETTER_COLUMNS) => {
  const source = settings.societySources[index];
  return {
    societyKey: source.societyKey,
    queryId: source.queryId,
    rows: constituentHouseholdsFromQuery(
      constituentQueryOutput(records, columns),
      { ...source, columns, querySocietyKey: source.societyKey },
      definitions,
      period,
    ),
  };
};

describe("multiple annual society source settings", () => {
  it("saves distinct per-society queries, periods and independent mappings", () => {
    const raw = societyQuerySettings();
    raw.societySources[1].columns.constituentId = "OOD System Record ID";
    raw.societySources[1].columns.firstName = "OOD First Name";
    const saved = validateLetterSettings(raw, definitions, today);
    expect(saved.societySources).toHaveLength(2);
    expect(saved.societySources[0].columns.constituentId).toBe(
      "System Record ID",
    );
    expect(saved.societySources[1].columns.constituentId).toBe(
      "OOD System Record ID",
    );
    expect(saved.societySources[1].columns.firstName).toBe("OOD First Name");
    expect(saved.societySources[0].columns.firstName).toBe("");
    expect(saved).not.toHaveProperty("queryId");
    expect(saved).not.toHaveProperty("confirmSource");
  });
  it.each([
    (s) => {
      s.societySources.pop();
    },
    (s) => {
      s.societySources[1].societyKey = s.societySources[0].societyKey;
    },
    (s) => {
      s.societySources[1].queryId = s.societySources[0].queryId;
    },
    (s) => {
      s.societySources[1].queryId = "";
    },
    (s) => {
      s.societySources[1].queryPeriodEnd = "2025-12-31";
    },
    (s) => {
      s.societySources[1].columns.spouseId =
        s.societySources[1].columns.constituentId;
    },
    (s) => {
      s.confirmSource = false;
    },
    (s) => {
      s.societyKeys.push("unconfigured");
    },
  ])(
    "rejects incomplete, overlapping or unconfirmed configuration (%#)",
    (change) => {
      const raw = societyQuerySettings();
      change(raw);
      expect(() => validateLetterSettings(raw, definitions, today)).toThrow();
    },
  );
  it("requires each source to reconfirm its dates in a new calendar year", () => {
    expect(() =>
      validateLetterSettings(settings, definitions, "2027-01-01"),
    ).toThrow(/qualification dates/);
  });
});

describe("cross-query household preview", () => {
  it("keeps the President's Society letter above OOD for the two JU queries, including individuals", () => {
    const high = {
      ...cohort(0, [{ constituentId: "10", spouseId: "" }]),
      queryId: "31049",
    };
    const low = {
      ...cohort(1, [{ constituentId: "10", spouseId: "" }]),
      queryId: "31043",
    };
    const [row] = mergeSocietyLetterCohorts([low, high], definitions, period);
    expect(row.members).toEqual(["10"]);
    expect(row.societyKey).toBe("presidents_society");
    expect(row.coveredKeys).toEqual([
      "presidents_society",
      "order_of_the_dolphin",
    ]);
    expect(row.sourceQueries.map((source) => source.queryId).sort()).toEqual([
      "31043",
      "31049",
    ]);
    const [ood] = mergeSocietyLetterCohorts([low], definitions, period);
    expect(letterDisposition(ood, [{ ...row, status: "mailed" }]).status).toBe(
      "covered",
    );
    expect(
      letterDisposition(row, [{ ...ood, status: "mailed" }]),
    ).toMatchObject({
      status: "ready",
      reason: "New higher society qualification",
    });
  });
  it("covers either spouse at lower tiers after the higher household letter, but allows a new year", () => {
    const [high] = mergeSocietyLetterCohorts(
      [cohort(0, [{ constituentId: "11", spouseId: "10" }])],
      definitions,
      period,
    );
    for (const id of ["10", "11"]) {
      const [low] = mergeSocietyLetterCohorts(
        [cohort(1, [{ constituentId: id, spouseId: "" }])],
        definitions,
        period,
      );
      expect(
        letterDisposition(low, [{ ...high, status: "emailed" }]).status,
      ).toBe("covered");
      expect(
        letterDisposition(
          {
            ...low,
            period: {
              start: "2027-01-01",
              end: "2027-12-31",
              key: "2027-01-01/2027-12-31",
            },
          },
          [{ ...high, status: "emailed" }],
        ).status,
      ).toBe("ready");
    }
  });
  const nameColumns = {
    ...CONSTITUENT_LETTER_COLUMNS,
    firstName: "First Name",
    lastName: "Last Name",
    spouseFirstName: "Spouse First Name",
    spouseLastName: "Spouse Last Name",
  };
  it("retains names from opposite spouses across society queries without duplicating people or changing greetings", () => {
    const low = cohort(
      1,
      [
        {
          constituentId: "10",
          spouseId: "11",
          firstName: "Alex",
          lastName: "Smith",
          spouseFirstName: "J.",
          spouseLastName: "Jones",
        },
      ],
      nameColumns,
    );
    const high = cohort(
      0,
      [
        {
          constituentId: "11",
          spouseId: "10",
          firstName: "Jordan",
          lastName: "Jones",
          spouseFirstName: "A.",
          spouseLastName: "Smith",
        },
      ],
      nameColumns,
    );
    for (const cohorts of [
      [low, high],
      [high, low],
    ]) {
      const [row] = mergeSocietyLetterCohorts(cohorts, definitions, period);
      expect(row.name).toBe("Alex Smith & Jordan Jones");
      expect(row.memberNames).toHaveLength(2);
      expect(row.members).toEqual(["10", "11"]);
      expect(row.societyKey).toBe("presidents_society");
      expect(row.addressee).toBe("");
      expect(row.recipientCandidates.map((r) => r.addressee)).toEqual([
        "Example 10",
        "Example 11",
      ]);
    }
  });
  it("combines name-enabled and older queries without requiring new columns everywhere", () => {
    const named = cohort(
      1,
      [
        {
          constituentId: "10",
          spouseId: "11",
          firstName: "Alex",
          lastName: "Smith",
          spouseFirstName: "Jordan",
          spouseLastName: "Jones",
        },
      ],
      nameColumns,
    );
    const older = cohort(0);
    delete older.rows[0].memberNames;
    const [row] = mergeSocietyLetterCohorts(
      [named, older],
      definitions,
      period,
    );
    expect(row.name).toBe("Alex Smith & Jordan Jones");
  });
  it("rejects conflicting own-record names instead of choosing an arbitrary query", () => {
    const a = cohort(
      0,
      [
        {
          constituentId: "10",
          spouseId: "11",
          firstName: "Alex",
          lastName: "Smith",
        },
      ],
      nameColumns,
    );
    const b = cohort(
      1,
      [
        {
          constituentId: "10",
          spouseId: "11",
          firstName: "Other",
          lastName: "Name",
        },
      ],
      nameColumns,
    );
    expect(() =>
      mergeSocietyLetterCohorts([a, b], definitions, period),
    ).toThrow(/conflicting name output/);
  });
  it("combines opposite spouses once and recommends only the highest qualifying letter", () => {
    const high = cohort(0, [{ constituentId: "11", spouseId: "10" }]);
    const low = cohort(1, [{ constituentId: "10", spouseId: "11" }]);
    const result = mergeSocietyLetterCohorts([low, high], definitions, period);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      householdId: "10",
      societyKey: "presidents_society",
      sourceMode: "society_queries",
      mailAllowed: false,
      emailAllowed: false,
      addressee: "",
      membersOutsideQuery: [],
      qualifiedKeys: ["presidents_society", "order_of_the_dolphin"],
    });
    expect(result[0].recipientCandidates).toHaveLength(2);
    expect(result[0].sourceQueries).toHaveLength(2);
  });
  it("deduplicates identical candidates but retains unreturned spouses for review", () => {
    const [row] = mergeSocietyLetterCohorts(
      [cohort(0), cohort(1)],
      definitions,
      period,
    );
    expect(row.recipientCandidates).toHaveLength(1);
    expect(row.membersOutsideQuery).toEqual(["11"]);
  });
  it("accepts an empty higher-society cohort without fabricating its qualification", () => {
    const result = mergeSocietyLetterCohorts(
      [cohort(0, []), cohort(1)],
      definitions,
      period,
    );
    expect(result[0].societyKey).toBe("order_of_the_dolphin");
    expect(result[0].qualifiedKeys).toEqual(["order_of_the_dolphin"]);
    expect(
      mergeSocietyLetterCohorts(
        [cohort(0, []), cohort(1, [])],
        definitions,
        period,
      ),
    ).toEqual([]);
  });
  it.each([
    { constituentId: "11", spouseId: "12" },
    { constituentId: "11", spouseId: "" },
    { constituentId: "10", spouseId: "12" },
  ])(
    "rejects conflicting household membership across queries (%#)",
    (record) => {
      expect(() =>
        mergeSocietyLetterCohorts(
          [cohort(0), cohort(1, [record])],
          definitions,
          period,
        ),
      ).toThrow(/conflicting spouse/);
    },
  );
  it("rejects conflicting recipient data for the same person instead of picking one query", () => {
    expect(() =>
      mergeSocietyLetterCohorts(
        [
          cohort(0),
          cohort(1, [
            {
              constituentId: "10",
              spouseId: "11",
              address1: "A different address",
            },
          ]),
        ],
        definitions,
        period,
      ),
    ).toThrow(/conflicting recipient/);
  });
  it("does not combine unrelated constituents with identical names and addresses", () => {
    const result = mergeSocietyLetterCohorts(
      [
        cohort(0, [
          { constituentId: "10", spouseId: "", addressee: "Same Name" },
        ]),
        cohort(1, [
          { constituentId: "20", spouseId: "", addressee: "Same Name" },
        ]),
      ],
      definitions,
      period,
    );
    expect(result).toHaveLength(2);
  });
  it("rejects mismatched periods and an oversized combined preview", () => {
    const sample = cohort(0);
    sample.rows[0].period = { key: "wrong-period" };
    expect(() =>
      mergeSocietyLetterCohorts([sample], definitions, period),
    ).toThrow(/period/);
    const valid = cohort(0);
    valid.rows = Array.from({ length: 5001 }, (_, i) => ({
      ...valid.rows[0],
      householdId: String(i + 1),
      members: [String(i + 1)],
      recipientCandidates: [],
    }));
    expect(() =>
      mergeSocietyLetterCohorts([valid], definitions, period),
    ).toThrow(/exceeds 5,000/);
  });
});
