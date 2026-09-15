import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NextStepFields, { nextStepDateChoices } from "./NextStepFields";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([
  ["2026-09-16T01:00:00Z", "2026-09-15", "2026-09-16", "2026-09-22"],
  ["2026-03-08T06:30:00Z", "2026-03-08", "2026-03-09", "2026-03-15"],
  ["2026-11-01T05:30:00Z", "2026-11-01", "2026-11-02", "2026-11-08"],
  ["2028-02-28T20:00:00Z", "2028-02-28", "2028-02-29", "2028-03-06"],
  ["2026-12-31T20:00:00Z", "2026-12-31", "2027-01-01", "2027-01-07"],
])("uses Eastern calendar days for %s", (now, today, tomorrow, week) => {
  expect(nextStepDateChoices(new Date(now)).map(choice => choice.value)).toEqual([today, tomorrow, week, ""]);
});

function Fields({ disabled = false }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState("");
  return <NextStepFields title={title} details={details} dueDate={dueDate} onTitleChange={setTitle}
    onDetailsChange={setDetails} onDueDateChange={setDueDate} disabled={disabled} ownerName="Selected MGO" />;
}

it("keeps notes optional, preserves collapsed notes, and allows a custom or cleared date", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-15T20:00:00Z"));
  render(<Fields />);
  expect(screen.getByText("Selected MGO")).toBeVisible();
  expect(screen.getByLabelText("Notes (optional)")).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
  expect(screen.getByLabelText("Due date (optional)")).toHaveValue("2026-09-16");
  fireEvent.click(screen.getByRole("button", { name: "In 1 week" }));
  expect(screen.getByLabelText("Due date (optional)")).toHaveValue("2026-09-22");
  fireEvent.change(screen.getByLabelText("Due date (optional)"), { target: { value: "2026-10-01" } });
  fireEvent.click(screen.getByRole("button", { name: "No date" }));
  expect(screen.getByLabelText("Due date (optional)")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Add notes (optional)" }));
  fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Bring proposal" } });
  fireEvent.click(screen.getByRole("button", { name: "Hide notes" }));
  fireEvent.click(screen.getByRole("button", { name: "Show notes" }));
  expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Bring proposal");
});

it("disables fields and shortcuts while saving", () => {
  render(<Fields disabled />);
  expect(screen.getByLabelText("What should happen next?")).toBeDisabled();
  expect(screen.getByLabelText("Due date (optional)")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
});
