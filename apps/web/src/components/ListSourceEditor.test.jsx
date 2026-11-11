import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ListSourceEditor from "./ListSourceEditor";
import { projectSource } from "@/utils/projectProspecting";

afterEach(() => vi.unstubAllGlobals());
const source = {
  version: 1,
  source: "saved_query",
  queryId: "123",
  fieldCategory: "",
  fieldDescription: "",
  leadFundraiser: {
    enabled: true,
    systemIdColumn: "Lead Fundraiser",
    assignmentTypes: ["Lead Solicitor"],
  },
};
const headers = ["QRECID", "Constituent system record ID", "Name", "Amount"];
const response = (overrides = {}) => ({
  ok: true,
  json: async () => ({
    report: { dataConfiguration: source },
    queryOutput: { headers, tableRows: [["200", "100", "Example", "250"]] },
    ...overrides,
  }),
});
function Editor() {
  const [value, onChange] = useState(source);
  return (
    <ListSourceEditor value={value} onChange={onChange} reportKey="list-demo" />
  );
}
const load = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Load returned output fields" }),
  );

it("project setup offers fixed NXT membership settings separately from system-ID mapping and app-only tags", async () => {
  const value = projectSource();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ report: { dataConfiguration: value } })));
  const onChange = vi.fn();
  render(<ListSourceEditor value={value} onChange={onChange} reportKey="list-project-center" />);
  expect(screen.getByLabelText("NXT custom field category")).toHaveValue("");
  expect(screen.getByLabelText("NXT description / value for project additions")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Load NXT choices" })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("option", { name: "NXT custom field" })).not.toBeInTheDocument();
  load(); await screen.findByText(/Returned output fields loaded/);
  const select = screen.getByRole("combobox", { name: /Constituent system record ID for project tags/ });
  expect(within(select).queryByRole("option", { name: "QRECID" })).not.toBeInTheDocument();
  fireEvent.change(select, { target: { value: "Constituent system record ID" } });
  expect(onChange).toHaveBeenCalledWith({ ...value, systemIdColumn: "Constituent system record ID" });
  fireEvent.change(screen.getByLabelText("NXT custom field category"), { target: { value: "Prospect Research" } });
  expect(onChange).toHaveBeenCalledWith({ ...value, fieldCategory: "Prospect Research", fieldDescription: "" });
  fireEvent.change(screen.getByLabelText("NXT description / value for project additions"), { target: { value: "The Center" } });
  expect(onChange).toHaveBeenCalledWith({ ...value, fieldDescription: "The Center" });
});

it("loads exact preview headers only on request and requires explicit selection without saving or querying NXT", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  render(<Editor />);
  expect(fetch).not.toHaveBeenCalled();
  const select = screen.getByRole("combobox", {
    name: "Constituent system record ID output header",
  });
  expect(select).toHaveValue("Lead Fundraiser");
  load();
  await screen.findByText(/Returned output fields loaded/);
  expect(within(select).getAllByRole("option")).toHaveLength(
    headers.length + 2,
  );
  expect(
    within(select).getByRole("option", {
      name: "Lead Fundraiser (not in returned fields)",
    }),
  ).toBeDisabled();
  expect(within(select).getByRole("option", { name: "QRECID" })).toHaveValue(
    "QRECID",
  );
  expect(select).toHaveValue("Lead Fundraiser");
  fireEvent.change(select, {
    target: { value: "Constituent system record ID" },
  });
  expect(select).toHaveValue("Constituent system record ID");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/api/reports/lists/list-demo",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(fetch.mock.calls[0][1]).not.toHaveProperty("method");
});
it("does not reuse returned headers for an unsaved different query", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  render(<Editor />);
  load();
  await screen.findByText(/Returned output fields loaded/);
  fireEvent.change(screen.getByLabelText("Saved query system record ID"), {
    target: { value: "456" },
  });
  const select = screen.getByRole("combobox", {
    name: "Constituent system record ID output header",
  });
  expect(
    within(select).queryByRole("option", {
      name: "Constituent system record ID",
    }),
  ).not.toBeInTheDocument();
  load();
  await screen.findByText(/These source changes have not been saved/);
  expect(
    within(select).queryByRole("option", {
      name: "Constituent system record ID",
    }),
  ).not.toBeInTheDocument();
});
it("does not attach a late response to a different query or expose generated fundraiser columns as identity fields", async () => {
  let resolve;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  render(<Editor />);
  load();
  fireEvent.change(screen.getByLabelText("Saved query system record ID"), {
    target: { value: "456" },
  });
  await act(async () =>
    resolve(
      response({
        queryOutput: null,
        snapshot: {
          headers: [...headers, "Current lead fundraiser"],
          leadAsOf: "2026-09-19",
        },
      }),
    ),
  );
  const select = screen.getByRole("combobox", {
    name: "Constituent system record ID output header",
  });
  expect(
    within(select).queryByRole("option", {
      name: "Constituent system record ID",
    }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Saved query system record ID"), {
    target: { value: "123" },
  });
  expect(
    within(select).getByRole("option", {
      name: "Constituent system record ID",
    }),
  ).toBeInTheDocument();
  expect(
    within(select).queryByRole("option", { name: "Current lead fundraiser" }),
  ).not.toBeInTheDocument();
});
it("explains first-output discovery without requiring an ID guess", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(response({ queryOutput: null, snapshot: null })),
  );
  render(<Editor />);
  load();
  await screen.findByText(
    /fundraiser lookup will wait until you select an ID field/,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
