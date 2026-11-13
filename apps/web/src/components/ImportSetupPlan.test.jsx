import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImportSetupPlan from "./ImportSetupPlan";
import { importSetupPlan } from "@/utils/importSetupPlan";

afterEach(cleanup);
const plan = () => importSetupPlan({ rows: [{ First: "Avery" }], headers: ["First", "Notes"], mappings: { firstName: "First" }, defaults: {} });

it("starts with a calm upload prompt, not a failed-check checklist", () => {
  render(<ImportSetupPlan plan={importSetupPlan()} />);
  expect(screen.getByText(/Upload a CSV to see its fields/)).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("groups choices and exclusions without promising writes or actual match counts", () => {
  const onChoice = vi.fn(), onOptions = vi.fn();
  render(<ImportSetupPlan plan={plan()} onChoice={onChoice} onOptions={onOptions}><div>Contact choices</div></ImportSetupPlan>);
  expect(screen.getByText("Contact choices")).toBeVisible();
  expect(screen.getByText(/requested plan, not an approval/)).toBeVisible();
  expect(screen.getByText(/1 unused column is excluded/)).toBeVisible();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(onChoice).toHaveBeenCalledWith("updateNameFields", true);
  fireEvent.click(screen.getByRole("button", { name: "Options for name fields" }));
  expect(onOptions).toHaveBeenCalledWith("Name fields");
});
it("disables choices and advanced options while work is running", () => {
  const onChoice = vi.fn(), onOptions = vi.fn();
  render(<ImportSetupPlan plan={plan()} disabled onChoice={onChoice} onOptions={onOptions} />);
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByRole("button")).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button"));
  expect(onChoice).not.toHaveBeenCalled();
  expect(onOptions).not.toHaveBeenCalled();
});
it("does not show editable fresh-file choices for a saved run", () => {
  render(<ImportSetupPlan plan={plan()} saved><div>Contact choices</div></ImportSetupPlan>);
  expect(screen.getByRole("heading", { name: "Saved import" })).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByText("Contact choices")).not.toBeInTheDocument();
});
