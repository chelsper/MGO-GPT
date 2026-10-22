import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Setup from "./CampaignInvestmentSetup";

const result = { queryId: "31071", queryName: "Comprehensive Investment - JUMGOGPT", fields: ["Name", "Gift Amount", "Gift Date", "System Record ID"] };
function setup(props = {}) {
  const command = vi.fn().mockResolvedValue(true), onClose = vi.fn(), readFields = vi.fn().mockResolvedValue(result);
  render(<Setup data={{ version: 7, config: {} }} command={command} readFields={readFields} onClose={onClose} {...props} />);
  return { command, onClose, readFields };
}
async function load() {
  fireEvent.click(screen.getByRole("button", { name: "Load classification fields" }));
  await screen.findByRole("status");
}
afterEach(cleanup);

it("defaults to 31071, loads on request and saves classification only after confirmation", async () => {
  const { command, readFields, onClose } = setup();
  expect(screen.getByLabelText("Comprehensive Investment query ID")).toHaveValue("31071");
  expect(readFields).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save classification query" })).toBeDisabled();
  await load();
  expect(readFields).toHaveBeenCalledWith("31071");
  expect(screen.getByLabelText("Classification gift system record ID")).toHaveValue("System Record ID");
  expect(screen.getByRole("button", { name: "Save classification query" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save classification query" }));
  await act(async () => {});
  expect(command).toHaveBeenCalledExactlyOnceWith("investment", {
    queryId: "31071", queryName: result.queryName, giftIdColumn: "System Record ID", confirmed: true,
  }, { _version: 7 });
  expect(onClose).toHaveBeenCalledTimes(1);
});
it("never offers constituent IDs or lookup IDs in place of gift system IDs", async () => {
  setup({ readFields: vi.fn().mockResolvedValue({ ...result, fields: ["Constituent System Record ID", "Fund System Record ID", "Gift ID"] }) });
  await load();
  expect(screen.getByRole("alert")).toHaveTextContent("Add the Gift System Record ID");
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save classification query" })).toBeDisabled();
});
it("ignores late metadata after changing the query, and discards confirmation", async () => {
  let finish;
  const { command } = setup({ readFields: () => new Promise(resolve => { finish = resolve; }) });
  fireEvent.click(screen.getByRole("button", { name: "Load classification fields" }));
  fireEvent.change(screen.getByLabelText("Comprehensive Investment query ID"), { target: { value: "31072" } });
  await act(async () => finish(result));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(command).not.toHaveBeenCalled();
});
it("requires re-confirmation after a field change or failed recheck", async () => {
  const readFields = vi.fn().mockResolvedValueOnce({ ...result, fields: [...result.fields, "Gift System Record ID"] }).mockRejectedValueOnce(new Error("NXT is temporarily unavailable."));
  setup({ readFields }); await load();
  expect(screen.getByLabelText("Classification gift system record ID")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Classification gift system record ID"), { target: { value: "System Record ID" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Classification gift system record ID"), { target: { value: "Gift System Record ID" } });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Load classification fields" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
  expect(screen.getByRole("button", { name: "Save classification query" })).toBeDisabled();
});
it("keeps the editor open when saving fails and blocks editing during a refresh", async () => {
  const onClose = vi.fn();
  setup({ command: vi.fn().mockResolvedValue(false), onClose });
  await load(); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save classification query" }));
  await act(async () => {}); expect(onClose).not.toHaveBeenCalled();
  cleanup(); setup({ active: true });
  expect(screen.getByLabelText("Comprehensive Investment query ID")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Load classification fields" })).toBeDisabled();
});
