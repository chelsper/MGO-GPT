import { expect, it } from "vitest";
import {
  isLetterReadyToMail,
  isLetterInProgress,
  letterBatchStatus,
  letterBatchStatusLabel,
  letterHistoryFilter,
  matchesLetterHistory,
  searchLetterHistory,
} from "./societyLetterHistory";

const prepared = { status: "prepared", channel: "post" };
const verified = {
  ...prepared,
  letterAppeals: { status: "complete", members: [{ status: "verified" }] },
};
const pending = { ...prepared, letterAppeals: { status: "pending" } };
const cancelled = { ...pending, status: "cancelled" };
const mailed = { ...verified, status: "mailed" };
it.each([
  [[cancelled], "cancelled", "Cancelled"],
  [[{ ...verified, status: "cancelled" }], "cancelled", "Cancelled"],
  [
    [{ ...cancelled, returnToReview: { reason: "Recipient corrected" } }],
    "cancelled",
    "Cancelled",
  ],
  [[verified, cancelled], "ready_to_mail", "Ready to mail"],
  [[prepared], "ready_to_mail", "Ready to mail"],
  [[mailed, cancelled], "completed", "Mailed / emailed"],
  [[{ ...pending, status: "mailed" }], "completed", "Mailed / emailed"],
  [
    [{ status: "emailed" }, { status: "delivered" }],
    "completed",
    "Mailed / emailed",
  ],
  [[verified, mailed], "ready_to_mail", "Ready to mail"],
  [[verified, pending, mailed, cancelled], "in_progress", "In progress"],
  [
    [
      {
        ...prepared,
        letterAppeals: {
          status: "complete",
          members: [{ status: "uncertain" }],
        },
      },
    ],
    "in_progress",
    "In progress",
  ],
  [
    [{ ...prepared, letterAppeals: { status: "complete", members: [] } }],
    "in_progress",
    "In progress",
  ],
  [
    [{ status: "needs_review", channel: "email" }],
    "in_progress",
    "In progress",
  ],
  [[], "unknown", "Saved history"],
  [[{ status: "unrecognized" }], "unknown", "Saved history"],
])(
  "labels saved batch %# using the same status rules as history",
  (items, status, label) => {
    const batch = { items };
    const original = structuredClone(batch);
    expect(letterBatchStatus(batch)).toBe(status);
    expect(letterBatchStatusLabel(batch)).toBe(label);
    expect(matchesLetterHistory(batch, "in_progress")).toBe(
      status === "in_progress",
    );
    if (["ready_to_mail", "completed"].includes(status))
      expect(matchesLetterHistory(batch, status)).toBe(true);
    expect(batch).toEqual(original);
  },
);
it("requires every appeal member to be verified before showing ready mail", () => {
  expect(isLetterReadyToMail(prepared)).toBe(true);
  for (const receipts of [
    { status: "pending", members: [{ status: "verified" }] },
    { status: "complete", members: [] },
    {
      status: "complete",
      members: [{ status: "verified" }, { status: "uncertain" }],
    },
    { status: "complete" },
  ]) {
    const item = { ...prepared, letterAppeals: receipts };
    expect(isLetterReadyToMail(item)).toBe(false);
    expect(isLetterInProgress(item)).toBe(true);
  }
  expect(
    isLetterReadyToMail({
      ...prepared,
      letterAppeals: {
        status: "complete",
        members: [{ status: "verified" }, { status: "verified" }],
      },
    }),
  ).toBe(true);
});
it.each(["mailed", "emailed", "delivered", "cancelled"])(
  "does not count %s as unfinished work",
  (status) => {
    expect(isLetterReadyToMail({ ...prepared, status })).toBe(false);
    expect(isLetterInProgress({ ...prepared, status })).toBe(false);
  },
);
it.each(["pending_email", "sending", "needs_review"])(
  "keeps %s in progress, not ready to mail",
  (status) => {
    const item = { status, channel: "email" };
    expect(isLetterReadyToMail(item)).toBe(false);
    expect(isLetterInProgress(item)).toBe(true);
  },
);
it("matches whole mixed batches without removing protected pending members", () => {
  const batch = {
    items: [
      prepared,
      { ...prepared, letterAppeals: { status: "uncertain" } },
      { status: "mailed" },
    ],
  };
  const original = structuredClone(batch);
  for (const filter of ["all", "ready_to_mail", "in_progress", "completed"])
    expect(matchesLetterHistory(batch, filter)).toBe(true);
  expect(batch).toEqual(original);
  expect(
    matchesLetterHistory({ items: [{ status: "cancelled" }] }, "completed"),
  ).toBe(false);
});
it("finds saved recipients, societies, and either household member without changing the batch", () => {
  const batch = {
    items: [
      {
        name: "Example Household",
        societyName: "Order of the Dolphin",
        members: ["17", "29"],
        addressee: "Dr. Example",
      },
      { name: "Second Person" },
    ],
  };
  for (const query of [" EXAMPLE ", "DOLPHIN", "29", "Dr.", "second", ""])
    expect(searchLetterHistory(batch, query)).toBe(true);
  expect(searchLetterHistory(batch, "not a recipient")).toBe(false);
  expect(batch.items).toHaveLength(2);
});
it("accepts only known non-sensitive history keys", () => {
  expect(letterHistoryFilter("ready_to_mail")).toBe("ready_to_mail");
  for (const input of [
    null,
    "https://other.example",
    "toString",
    "private-name",
  ])
    expect(letterHistoryFilter(input)).toBe("all");
});
