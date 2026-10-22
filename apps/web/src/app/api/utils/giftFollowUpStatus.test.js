import { expect, it, vi } from "vitest";
import { readGiftFollowUpStatuses } from "./giftFollowUp";
import { giftFollowUpStatus } from "@/utils/giftFollowUpStatus";

const gift = { giftId: "900", constituentId: "100" };
const task = { id: 50, owner_user_id: 7, owner_name: "Example Officer", title: "Arrange a call",
  status: "Open", due_date: "2026-09-30", source_gift_id: "900" };

it("skips the database entirely when no gift reminders are available", async () => {
  const db = vi.fn();
  expect(await readGiftFollowUpStatuses(7, [], db)).toEqual(new Map());
  expect(db).not.toHaveBeenCalled();
});
it("uses one bounded workspace/gift/constituent lookup, including completed and undated tasks", async () => {
  const db = vi.fn().mockResolvedValue([task, { ...task, id: 51, source_gift_id: "901", status: "Done", due_date: null }]);
  const result = await readGiftFollowUpStatuses(7, [gift, gift, { ...gift, giftId: "901" }], db);
  expect(db).toHaveBeenCalledTimes(1);
  const [parts, ...values] = db.mock.calls[0];
  expect(parts.join("")).toMatch(/WHERE pa.owner_user_id =/);
  expect(parts.join("")).toContain("gift.gift_id = pa.source_gift_id");
  expect(parts.join("")).toContain("gift.constituent_id = pa.source_gift_snapshot->>'constituentId'");
  expect(parts.join("")).not.toMatch(/pa.status =|pa.due_date [<>=]/);
  expect(values).toEqual([JSON.stringify([{ gift_id: "900", constituent_id: "100" }, { gift_id: "901", constituent_id: "100" }]), 7, 2]);
  expect(result.get("900")).toEqual({ id: "50", ownerId: "7", ownerName: "Example Officer", title: "Arrange a call", status: "Open", dueDate: "2026-09-30" });
  expect(result.get("901")).toMatchObject({ status: "Done", dueDate: null });
});
it("projects only progress fields and normalizes database calendar dates without a timezone shift", () => {
  expect(giftFollowUpStatus({ ...task, due_date: new Date("2026-09-30T00:00:00Z"), details: "Private notes", source_gift_snapshot: { amount: 2500 } }, "Example Officer"))
    .toEqual({ id: "50", ownerId: "7", ownerName: "Example Officer", title: "Arrange a call", status: "Open", dueDate: "2026-09-30" });
  expect(giftFollowUpStatus({ ...task, due_date: "2026-02-30" }, "").dueDate).toBeNull();
  expect(giftFollowUpStatus(null, "Officer")).toBeNull();
});
