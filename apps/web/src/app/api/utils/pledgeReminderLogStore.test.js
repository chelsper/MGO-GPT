import { describe, expect, it, vi } from "vitest";
import { createReminderLogStore, publicReminderLog, reminderEventKey } from "./pledgeReminderLogStore";
import { reminderDraft } from "../../../../test/fixtures/pledgeReminder";
describe("immutable reminder snapshot identity", () => {
  it("shares event identity across staff and refreshed amounts but separates pledge/date/view", () => {
    const key = reminderEventKey("https://ju.test", reminderDraft.pledge, "2026-11-20", "pastDue");
    expect(reminderEventKey("https://ju.test", { ...reminderDraft.pledge, amountDueCents: 1, refreshedAt: "later" }, "2026-11-20", "pastDue")).toBe(key);
    expect(reminderEventKey("https://other.test", reminderDraft.pledge, "2026-11-20", "pastDue")).not.toBe(key);
    expect(reminderEventKey("https://ju.test", reminderDraft.pledge, "2026-11-21", "pastDue")).not.toBe(key);
    expect(reminderEventKey("https://ju.test", reminderDraft.pledge, "2026-11-20", "upcoming")).not.toBe(key);
  });
  it("stores only the necessary historical reminder details, not PDF bytes or email body", async () => {
    const db = vi.fn(async (parts, ...values) => [{ id: "saved", snapshot: JSON.parse(values[5]) }]);
    const saved = await createReminderLogStore(db).prepare({ ownerId: 7, origin: "https://ju.test", draft: reminderDraft, email: "avery@example.test",
      letterDate: "2026-11-20", today: "2026-11-20", view: "pastDue", filename: "reminder.pdf" });
    expect(saved).toMatchObject({ snapshotId: "saved", amountDueCents: reminderDraft.pledge.amountDueCents, email: "avery@example.test" });
    expect(saved).not.toHaveProperty("pdf"); expect(saved).not.toHaveProperty("message"); expect(saved).not.toHaveProperty("fields");
  });
  it("redacts other-staff receipt identifiers but reports the duplicate hold", () => {
    expect(publicReminderLog({ id: "secret", owner_id: 8, state: "review", action_id: "90", sent_date: "2026-11-20" }, 7)).toMatchObject({ id: null, actionId: null, otherStaff: true });
  });
});
