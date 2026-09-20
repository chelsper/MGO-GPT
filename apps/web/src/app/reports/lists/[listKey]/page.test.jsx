import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
afterEach(() => vi.restoreAllMocks());
const mocks = vi.hoisted(() => ({
  useList: vi.fn(),
  refresh: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("../useConstituentList", () => ({ default: mocks.useList }));
vi.mock("@/app/reports/SharedReportHeader", () => ({
  default: ({ title, action }) => (
    <header>
      <h1>{title}</h1>
      {action}
    </header>
  ),
}));
vi.mock("@/components/ListMembershipSearch", () => ({
  default: () => <div>Add-member controls</div>,
}));
import Page from "./page";
const data = {
  report: {
    key: "list-demo",
    title: "Interests",
    dataConfiguration: { fieldCategory: "Interests", fieldDescription: "Golf" },
    canManageMembers: false,
  },
  snapshot: {
    total: 26,
    generatedAt: "2026-09-19T12:00:00Z",
    rows: Array.from({ length: 26 }, (_, i) => ({
      constituentId: String(i + 1),
      name: `Person ${i + 1}`,
      lookupId: `ID-${i + 1}`,
      values: ["Golf"],
    })),
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.useList.mockReturnValue({
    data,
    refresh: mocks.refresh,
    reload: mocks.reload,
  });
});
it("searches and paginates saved members without refreshing NXT and hides management controls from viewers", () => {
  render(<Page params={{ listKey: "list-demo" }} />);
  expect(screen.getAllByRole("link", { name: "Open NXT" })).toHaveLength(25);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Person 26")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search saved list"), {
    target: { value: "ID-12" },
  });
  expect(screen.getAllByRole("link", { name: "Open NXT" })).toHaveLength(1);
  expect(screen.getByText("Person 12")).toBeInTheDocument();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.queryByText("Add-member controls")).not.toBeInTheDocument();
});
it("distinguishes a missing snapshot from a verified empty list", () => {
  mocks.useList.mockReturnValue({
    data: { ...data, snapshot: null },
    refresh: mocks.refresh,
  });
  const { rerender } = render(<Page params={{ listKey: "list-demo" }} />);
  expect(screen.getByText(/No saved list yet/)).toBeInTheDocument();
  expect(screen.queryByText("0 constituents")).not.toBeInTheDocument();
  mocks.useList.mockReturnValue({
    data: { ...data, snapshot: { ...data.snapshot, total: 0, rows: [] } },
    refresh: mocks.refresh,
  });
  rerender(<Page params={{ listKey: "list-demo" }} />);
  expect(
    screen.getByText("No constituents matched at the last complete refresh."),
  ).toBeInTheDocument();
});
const pendingOutput = {
  report: {
    ...data.report,
    canConfigure: true,
    dataConfiguration: { source: "saved_query", queryId: "123" },
  },
  snapshot: null,
  queryOutput: {
    total: 1,
    headers: ["Name", "Amount"],
    tableRows: [["New result", "250"]],
    generatedAt: "2026-09-19T12:00:00Z",
  },
  refresh: {
    status: "needs_configuration",
    stage: "mapping",
    message: "Choose the correct ID field.",
    retryAt: "2026-09-20T12:00:00Z",
  },
};
it("shows query output and setup guidance rather than hiding data behind futile retries", () => {
  mocks.useList.mockReturnValue({
    data: pendingOutput,
    reload: mocks.reload,
    refresh: mocks.refresh,
  });
  render(<Page params={{ listKey: "list-demo" }} />);
  expect(
    screen.getByText("Query output ready; fundraiser setup needs attention"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Returned output fields: Name, Amount"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open Report Access & Configurations" }),
  ).toHaveAttribute("href", "/report-configurations");
  const preview = screen.getByRole("region", { name: "Query output preview" });
  expect(within(preview).getByText("New result")).toBeInTheDocument();
  expect(
    screen.queryByText(/No saved list yet|Resume after|Waiting for NXT query/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: /Resume refresh|Refresh list|Restart unfinished/,
    }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/blank current-lead cell/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload status" }));
  expect(mocks.reload).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("keeps the last complete list visible, puts newer output in a separate preview and limits setup links", () => {
  mocks.useList.mockReturnValue({
    data: {
      ...pendingOutput,
      report: { ...pendingOutput.report, canConfigure: false },
      snapshot: {
        ...pendingOutput.queryOutput,
        tableRows: [["Older complete result", "100"]],
      },
    },
  });
  render(<Page params={{ listKey: "list-demo" }} />);
  expect(
    screen.getByText(/Ask an administrator or Advancement Services/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /Configurations/ }),
  ).not.toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Saved query output" }),
    ).getByText("Older complete result"),
  ).toBeVisible();
  const toggle = screen.getByText("View newer query output preview");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(toggle);
  expect(screen.getByText("New result")).toBeInTheDocument();
});
it("asks before explicitly rereading a saved query edited in NXT", () => {
  mocks.useList.mockReturnValue({
    data: pendingOutput,
    reload: mocks.reload,
    refresh: mocks.refresh,
  });
  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  render(<Page params={{ listKey: "list-demo" }} />);
  const button = screen.getByRole("button", { name: "Refresh query output" });
  fireEvent.click(button);
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(true);
});
