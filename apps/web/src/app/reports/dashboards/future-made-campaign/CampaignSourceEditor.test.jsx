import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Editor from "./CampaignSourceEditor";

const fields = ["Gift ID", "Gift Amount", "Gift Date", "Gift Type", "Fund Description", "Fund ID", "Fund System Record ID", "Fund Type", "Fund Category", "Gift Pledge Balance"];
const completeFields = [...fields, "Gift System Record ID", "Gift Split System Record ID", "Split Gift Amount"];
const result = list => ({ queryId: "27460", queryName: "Fictional Campaign", fields: list });
function setup(props = {}) {
  const command = vi.fn().mockResolvedValue(true), onClose = vi.fn(), readFields = vi.fn().mockResolvedValue(result(fields));
  render(<Editor data={{}} pending={false} command={command} onClose={onClose} readFields={readFields} {...props} />);
  return { command, onClose, readFields };
}
afterEach(cleanup);
it("loads only on request and makes missing split fields explicit", async () => {
  const { readFields, command } = setup();
  expect(readFields).not.toHaveBeenCalled(); expect(screen.queryByLabelText("Fund system record ID")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" }));
  expect(await screen.findByRole("status")).toHaveTextContent("2 of 5 required fields matched");
  expect(screen.getByLabelText("Fund system record ID")).toHaveValue("Fund System Record ID");
  expect(screen.getByLabelText("Fund name")).toHaveValue("Fund Description");
  expect(screen.getByLabelText("Gift system record ID")).toHaveValue("");
  expect(screen.getByLabelText("Campaign-countable amount")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Save source settings" })).toBeDisabled(); expect(command).not.toHaveBeenCalled();
});
it("saves reviewed complete mapping once without starting a refresh", async () => {
  const { command, onClose } = setup({ readFields: vi.fn().mockResolvedValue(result(completeFields)) });
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" })); await screen.findByRole("status");
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Save source settings" }));
  await act(async () => {});
  expect(command).toHaveBeenCalledTimes(1); expect(command).toHaveBeenCalledWith("source", expect.objectContaining({ mode: "split", confirmed: true, columns: expect.objectContaining({ splitId: "Gift Split System Record ID", amount: "Split Gift Amount" }) }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
it("does not overwrite removed saved mappings and blocks saving until corrected", async () => {
  setup({ data: { config: { sourceKey: "saved", queryId: "27460", queryName: "Campaign", mode: "split", columns: { fundName: "Old Fund Name" } } } });
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" })); await screen.findByRole("status");
  expect(screen.getByLabelText("Fund name")).toHaveValue("Old Fund Name");
  expect(within(screen.getByLabelText("Mapping still needed")).getByText(/no longer returns/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox")).toBeDisabled();
});
it("ignores a late field response after the query ID changes", async () => {
  let finish;
  setup({ readFields: () => new Promise(resolve => { finish = resolve; }) });
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" }));
  fireEvent.change(screen.getByLabelText("Saved Gift query system ID"), { target: { value: "999" } });
  await act(async () => finish(result(completeFields)));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Saved Gift query system ID")).toHaveValue("999");
});
it("clears amount and confirmation when switching accounting modes", async () => {
  setup({ readFields: vi.fn().mockResolvedValue(result(completeFields)) });
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" })); await screen.findByRole("status");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Amount basis"), { target: { value: "gift" } });
  expect(screen.getByLabelText("Campaign-countable amount")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Save source settings" })).toBeDisabled();
});
it("shows lookup-ID errors and invalidates confirmation after an edit", async () => {
  setup({ readFields: vi.fn().mockResolvedValue(result(completeFields)) });
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" })); await screen.findByRole("status");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Gift system record ID"), { target: { value: "Gift ID" } });
  expect(screen.getByLabelText("Gift system record ID")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Save source settings" })).toBeDisabled();
});
it("requires a fresh field load after a failed recheck, without saving", async () => {
  const readFields = vi.fn().mockResolvedValueOnce(result(completeFields)).mockRejectedValueOnce(new Error("Try after the cooldown."));
  const { command } = setup({ readFields });
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" })); await screen.findByRole("status");
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Reload query fields" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("cooldown");
  expect(screen.queryByRole("button", { name: "Save source settings" })).not.toBeInTheDocument(); expect(command).not.toHaveBeenCalled();
});
