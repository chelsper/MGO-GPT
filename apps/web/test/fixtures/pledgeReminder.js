// Fictional data only. Never replace these with a real donor, email, or payment details.
export const reminderToday = "2026-11-20";
export const reminderPledge = {
  id: "1", constituentId: "10", lookupId: "SAMPLE-P100", name: "Avery Example", stale: false,
  totalCents: 1000000, paidToDateCents: 200000, balanceCents: 700000, amountDueCents: 200000,
  dueDate: "2026-11-01", refreshedAt: "2026-11-20T13:00:00Z", fundDescriptions: ["Fictional Scholarship Fund"],
};
export const reminderFields = { Addressee: "Avery Example", Address_Line_1: "10 Fictional Street", Address_Line_2: "Suite 2",
  City: "Jacksonville", State: "FL", Zip: "01234" };
export const reminderDraft = { pledge: reminderPledge, fields: reminderFields, blocked: "", warnings: [], checkedAt: "2026-11-20T14:00:00Z" };
export const reminderSource = { jobId: "fictional-job", today: reminderToday, view: "pastDue", rows: [reminderPledge] };
