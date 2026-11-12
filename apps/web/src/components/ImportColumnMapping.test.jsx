import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImportColumnMapping from "./ImportColumnMapping";
import { IMPORT_FIELDS } from "@/utils/importFieldDefinitions";

afterEach(cleanup);
const props = () => ({ fields: IMPORT_FIELDS.filter((field) => field.key === "firstName"), availableFields: IMPORT_FIELDS,
  headers: ["Given", "Email"], mappings: { firstName: "Given" }, rows: [{ Given: "Avery", Email: "avery@example.test" }], onChange: vi.fn(), onToggle: vi.fn() });

it("shows sample values and unused columns without requiring template headers", () => {
  render(<ImportColumnMapping {...props()} />);
  expect(screen.getByLabelText("First Name column")).toHaveValue("Given");
  expect(screen.getByText("Sample: Avery")).toBeVisible();
  expect(screen.getByText(/Not included: Email/)).toBeVisible();
  expect(screen.getByText(/External Constituent ID is a source reference only/)).toBeVisible();
});
it("adds, removes and remaps in place without changing records", () => {
  const p = props(); render(<ImportColumnMapping {...p} />);
  expect(screen.getByRole("button", { name: "Add field" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Add another field"), { target: { value: "email" } });
  fireEvent.click(screen.getByRole("button", { name: "Add field" }));
  expect(p.onToggle).toHaveBeenCalledWith("email");
  expect(screen.getByLabelText("Add another field")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Remove First Name from import" }));
  expect(p.onToggle).toHaveBeenCalledWith("firstName");
  fireEvent.change(screen.getByLabelText("First Name column"), { target: { value: "" } });
  expect(p.onChange).toHaveBeenCalledWith("firstName", "");
});
it("preserves missing saved mappings for an explicit repair", () => {
  render(<ImportColumnMapping {...props()} mappings={{ firstName: "Absent" }} />);
  expect(screen.getByLabelText("First Name column")).toHaveValue("Absent");
  expect(screen.getByText(/1 need a column/)).toBeVisible();
  expect(screen.getByText("Sample: No populated value in this file")).toBeVisible();
});
it("disables all editing during an operation and handles an empty upload", () => {
  const { rerender } = render(<ImportColumnMapping {...props()} disabled />);
  for (const control of [...screen.getAllByRole("combobox"), ...screen.getAllByRole("button")]) expect(control).toBeDisabled();
  rerender(<ImportColumnMapping {...props()} headers={[]} />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
