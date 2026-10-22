import { describe, expect, it } from "vitest";
import { csvWorkspace } from "../../test/societyLetterCsvFixture";
import {
  societyLetterCsvPlan,
  societyLetterCsvFilename,
} from "./societyLetterCsvExport";
import { LETTER_TAGS, letterMergeData } from "./societyLetters";
import { contactChoiceKey } from "./societyLetterContacts";

const plan = (workspace) =>
  societyLetterCsvPlan(workspace, "ood", workspace.today);
const values = (result, index = 0) =>
  Object.fromEntries(
    result.columns.map((column, i) => [
      column.name,
      result.entries[index].cells[i],
    ]),
  );

describe("society mail merge CSV plan", () => {
  it("exports 5,000 reviewed households without the document/review batch limits or changing state", () => {
    const workspace = csvWorkspace(5000);
    const before = structuredClone(workspace);
    const result = plan(workspace);
    expect(result.issue).toBe("");
    expect(result.entries).toHaveLength(5000);
    expect(result.omitted).toEqual([]);
    expect(workspace).toEqual(before);
  });
  it("retains mapped greetings, preferred names, address punctuation, and one row for spouses", () => {
    const workspace = csvWorkspace();
    Object.assign(workspace.rows[0], {
      members: ["1000", "2000"],
      salutation: "Al and Pat",
      spouseFirstName: "Pat",
      spouseLastName: "Example",
    });
    const result = plan(workspace);
    expect(result.entries).toHaveLength(1);
    expect(values(result)).toMatchObject({
      First_Name: "Al and Pat",
      app_first_name: "Al",
      Address: "10 Test Street\nExample City, FL 00123",
      city: "Example City",
      zip: "00123",
      app_member_ids: "1000|2000",
      letter_date: "October 12, 2026",
      period_start: "January 1, 2026",
      period_end: "December 31, 2026",
    });
    const renderer = letterMergeData(workspace.rows[0], workspace.today, {
      fields: LETTER_TAGS,
      dateFormat: "long_us",
    });
    for (const column of result.columns.filter(
      (item) => !item.source.startsWith("metadata:"),
    ))
      expect(values(result)[column.name]).toBe(
        String(renderer[column.source] ?? ""),
      );
  });
  it("preserves organization/contact wording and manual address blocks exactly", () => {
    const workspace = csvWorkspace();
    const contact = {
      role: "Main contact",
      firstName: "Taylor",
      preferredName: "Tay",
      lastName: "Contact",
    };
    Object.assign(workspace.rows[0], {
      name: "Example Foundation",
      addressee: "Taylor Contact\nExample Foundation",
      salutation: "Tay",
      organizationContactKey: contactChoiceKey(contact),
      recipientCandidates: [
        {
          constituentId: "1000",
          organizationContacts: {
            keyIndicator: "Organization",
            contacts: [contact],
          },
        },
      ],
      addressParts: undefined,
      address: "Attn: Taylor\n99 Fictional Court\nExample City, FL 00123",
    });
    const result = plan(workspace);
    expect(result.entries).toHaveLength(1);
    expect(values(result)).toMatchObject({
      household_name: "Example Foundation",
      addressee: "Taylor Contact\nExample Foundation",
      First_Name: "Tay",
      app_first_name: "Tay",
      last_name: "Contact",
      spouse_first_name: "",
      Address: workspace.rows[0].address,
      city: "",
      zip: "",
    });
    workspace.rows[0].nameOverrides = { first_name: "Taylor (Tay)" };
    expect(values(plan(workspace))).toMatchObject({
      First_Name: "Tay",
      app_first_name: "Taylor (Tay)",
    });
  });
  it("does not guess separate address fields from a manual block when the original Word letter requires them", () => {
    const workspace = csvWorkspace();
    workspace.templates[0].wordFields.fields.push({
      name: "City",
      suggestedField: "city",
    });
    workspace.rows[0].addressParts = null;
    const result = plan(workspace);
    expect(result.entries).toEqual([]);
    expect(result.omitted[0].reason).toContain("city");
  });
  it("retains optional blank street line 2 and country", () => {
    const workspace = csvWorkspace();
    workspace.templates[0].wordFields.fields.push(
      { name: "Address_Line_2", suggestedField: "address_line_2" },
      { name: "Country", suggestedField: "country" },
    );
    expect(values(plan(workspace))).toMatchObject({
      Address_Line_2: "",
      Country: "",
    });
  });
  it("reports exclusions, prior letters, review expiry, and drafts without exporting another society", () => {
    const workspace = csvWorkspace(9);
    workspace.rows[1].status = "excluded";
    workspace.rows[2].status = "covered";
    workspace.rows[3].status = "held";
    workspace.rows[4].recipientReview = {
      status: "needs_review",
      reason: "expired",
    };
    workspace.rows[5].recipientReview = { status: "unreviewed" };
    workspace.rows[6].societyKey = "presidents";
    workspace.rows[7].documentReadiness = {
      status: "blocked",
      blockers: [{ message: "Missing name." }],
    };
    workspace.postalDraft = {
      entries: [{ householdId: workspace.rows[8].householdId }],
    };
    const result = plan(workspace);
    expect(result.entries.map((row) => row.householdId)).toEqual(["1000"]);
    expect(result.omitted).toHaveLength(7);
    expect(result.omitted.map((item) => item.reason).join(" ")).toMatch(
      /Excluded.*covered.*progress.*15 days.*save recipient.*Missing name.*document approval/,
    );
  });
  it.each([
    '=HYPERLINK("https://example.org")',
    "+123",
    "-1+2",
    " @SUM(1,2)",
    "\t=1+2",
    "Al\u0000ex",
  ])("omits unsafe CSV values without silently rewriting them: %s", (value) => {
    const workspace = csvWorkspace();
    workspace.rows[0].salutation = value;
    const result = plan(workspace);
    expect(result.entries).toEqual([]);
    expect(result.omitted[0].reason).toContain("no wording was changed");
    expect(workspace.rows[0].salutation).toBe(value);
  });
  it.each(["household", "member"])(
    "rejects every ambiguous %s rather than picking a row",
    (kind) => {
      const workspace = csvWorkspace(2);
      if (kind === "household") workspace.rows[1].householdId = "1000";
      else workspace.rows[1].members = ["1000", "1001"];
      expect(plan(workspace).entries).toEqual([]);
      expect(plan(workspace).omitted).toHaveLength(2);
    },
  );
  it("ignores delivery checks but requires matching source, period, review, and template", () => {
    const workspace = csvWorkspace();
    workspace.readiness = { issue: "No appeal settings" };
    workspace.rows[0].readiness = { post: { status: "blocked" } };
    expect(plan(workspace).entries).toHaveLength(1);
    workspace.rows[0].period = { ...workspace.period, key: "old-period" };
    expect(plan(workspace).entries).toHaveLength(0);
    workspace.setup.membershipCurrent = false;
    expect(plan(workspace).issue).toContain("membership refresh");
  });
  it("rejects invalid dates, unconfigured societies, missing templates, and oversized snapshots", () => {
    const workspace = csvWorkspace();
    expect(
      societyLetterCsvPlan(workspace, "ood", "2026-02-30").issue,
    ).toContain("valid letter date");
    expect(
      societyLetterCsvPlan(workspace, "not-configured", workspace.today).issue,
    ).toContain("configured annual");
    workspace.templates = [];
    expect(plan(workspace).issue).toContain("Save this society");
    expect(plan(csvWorkspace(5001)).issue).toContain("5,000");
  });
  it("rejects unmapped aliases and conflicting case-insensitive fields, retaining collision-safe app columns", () => {
    const workspace = csvWorkspace();
    workspace.templates[0].wordFields.fields.push({
      name: "Custom Greeting",
      suggestedField: "",
    });
    expect(plan(workspace).issue).toContain("Map every field");
    workspace.templates[0].wordFields.fields.pop();
    workspace.templates[0].wordFields.fields.push({
      name: "first_name",
      suggestedField: "first_name",
    });
    expect(plan(workspace).issue).toContain("different mappings");
    workspace.templates[0].wordFields.fields.pop();
    workspace.templates[0].wordFields.fields.push({
      name: "app_member_ids",
      suggestedField: "salutation",
    });
    expect(values(plan(workspace))).toMatchObject({
      app_member_ids: "Al",
      app_app_member_ids: "1000",
    });
  });
  it("makes a safe society-specific filename", () => {
    expect(societyLetterCsvFilename("President's Society", "2026-10-12")).toBe(
      "president-s-society-2026-10-12-mail-merge.csv",
    );
  });
});
