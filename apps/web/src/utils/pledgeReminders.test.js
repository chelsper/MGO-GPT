import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { pledgeWorklist } from "./pledgePayments";
import { pledgeReminderIssue, pledgeReminderRecipient, pledgeReminderDraftIssue, pledgeReminderCsv, REMINDER_HEADERS } from "./pledgeReminders";
const today = "2026-11-18";
const base = { id: "1", constituentId: "10", lookupId: "P100", name: "Fictional Avery", stale: false,
  totalCents: 100000, balanceCents: 70000, fundDescriptions: ["Scholarships"], refreshedAt: "2026-11-18T12:00:00Z",
  payments: [{ date: "2026-11-01", amountCents: 20000 }],
  installments: [{ id: "1", date: "2026-10-01", amountCents: 50000, balanceCents: 20000 },
    { id: "2", date: "2026-12-01", amountCents: 50000, balanceCents: 50000 }] };
const person = { id: "10", name: "Avery Example", type: "Individual", deceased: false, inactive: false, no_valid_address: false,
  address: { constituent_id: "10", address_lines: "10 Sample St\nApt 2", city: "Jacksonville", state: "FL", postal_code: "01234", country: "United States", inactive: false, do_not_mail: false } };
const draft = () => ({ pledge: pledgeWorklist([base], today).pastDue[0], ...pledgeReminderRecipient(person, "10", today), checkedAt: "2026-11-18T13:00:00Z" });
describe("pledge reminder CSV", () => {
  it("matches the supplied merge field names, keeps ZIP text and uses verified payments rather than balance reductions", () => {
    const csv = Papa.parse(pledgeReminderCsv([draft()], today, today), { header: true }).data[0];
    expect(Object.keys(csv)).toEqual(REMINDER_HEADERS);
    expect(csv).toMatchObject({ Letter_Date: "November 18, 2026", Addressee: "Avery Example", Zip: "01234", Address_Line_2: "Apt 2",
      Pledge_Amount: "$1,000.00", Amount_Paid_to_Date: "$200.00", Installment_Amount: "$200.00", Pledge_Balance: "$700.00" });
  });
  it("uses only the next unpaid installment date in upcoming reminders and does not change money when changing letter date", () => {
    const d = { ...draft(), pledge: pledgeWorklist([base], today).upcoming[0] };
    const csv = Papa.parse(pledgeReminderCsv([d], "2026-12-05", today), { header: true }).data[0];
    expect(csv.Installment_Amount).toBe("$500.00"); expect(csv.Amounts_As_Of).toBe("November 18, 2026");
    expect(csv.Due_Date).toBe("December 1, 2026"); expect(csv.Letter_Date).toBe("December 5, 2026");
  });
  it("rejects repeated pledge IDs but keeps multiple pledges for one donor separate", () => {
    expect(() => pledgeReminderCsv([draft(), draft()], today, today)).toThrow(/unique/);
    const second = { ...draft(), pledge: { ...draft().pledge, id: "2" } };
    expect(Papa.parse(pledgeReminderCsv([draft(), second], today, today), { header: true }).data).toHaveLength(2);
  });
  it.each([{ stale: true }, { amountDueCents: 0 }, { amountDueCents: 80000 }, { paidToDateCents: 40000 },
    { totalCents: NaN }, { balanceCents: -1 }, { fundDescriptions: [] }, { fundDescriptionsUnavailable: true }, { dueDate: "2026-02-30" }])("holds unsafe financial or source values %j", change => {
    const d = draft(); Object.assign(d.pledge, change);
    expect(pledgeReminderIssue(d.pledge)).toBeTruthy(); expect(() => pledgeReminderCsv([d], today, today)).toThrow();
  });
  it("requires completed addresses, permits local edits, preserves extra street lines and neutralizes formulas", () => {
    const d = draft(); d.fields.Address_Line_1 = "";
    expect(pledgeReminderDraftIssue(d)).toContain("Address Line 1");
    d.fields.Address_Line_1 = "=unsafe"; d.fields.Addressee = 'Example, "Avery"'; d.fields.Address_Line_2 = "Suite 2\nBuilding B";
    const csv = Papa.parse(pledgeReminderCsv([d], today, today), { header: true }).data[0];
    expect(csv.Address_Line_1).toBe("'=unsafe"); expect(csv.Addressee).toBe('Example, "Avery"'); expect(csv.Address_Line_2).toContain("\n");
    expect(pledgeReminderRecipient({ ...person, address: { ...person.address, address_lines: "Street\nSuite\nBuilding" } }, "10", today).fields.Address_Line_2).toBe("Suite\nBuilding");
  });
  it("holds restrictive, foreign and mismatched addresses without guessing, and makes missing addresses reviewable", () => {
    for (const p of [{ ...person, deceased: true }, { ...person, inactive: true },
      { ...person, address: { ...person.address, do_not_mail: true } }, { ...person, address: { ...person.address, country: "Canada" } },
      { ...person, address: { ...person.address, constituent_id: "20" } }]) expect(pledgeReminderRecipient(p, "10", today).blocked).toBeTruthy();
    expect(() => pledgeReminderRecipient(person, "20", today)).toThrow(/identity/);
    for (const address of [null, { ...person.address, end: "2026-11-18" }, { ...person.address, start: "2027-01-01" }]) {
      const recipient = pledgeReminderRecipient({ ...person, address }, "10", today);
      expect(recipient.fields.Address_Line_1).toBe(""); expect(recipient.warnings.length).toBeGreaterThan(0);
    }
    expect(pledgeReminderRecipient({ ...person, type: "Organization" }, "10", today).warnings.join(" ")).toContain("organization addressee");
  });
  it("rejects bad dates and empty exports", () => {
    expect(() => pledgeReminderCsv([], today, today)).toThrow();
    expect(() => pledgeReminderCsv([draft()], "2026-02-30", today)).toThrow(/valid letter date/);
  });
});
