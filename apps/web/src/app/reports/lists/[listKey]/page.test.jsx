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
it("puts data first and keeps technical setup details collapsed for administrators", () => {
  mocks.useList.mockReturnValue({
    data: pendingOutput,
    reload: mocks.reload,
    refresh: mocks.refresh,
  });
  render(<Page params={{ listKey: "list-demo" }} />);
  expect(screen.getByText("Fundraiser details pending")).toBeInTheDocument();
  const details = screen.getByText("List settings & status").closest("details");
  expect(details).not.toHaveAttribute("open");
  expect(screen.getByText("Choose the correct ID field.")).not.toBeVisible();
  fireEvent.click(screen.getByText("List settings & status"));
  expect(
    screen.getByText("Returned output fields: Name, Amount"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Configure list" })).toHaveAttribute(
    "href",
    "/report-configurations",
  );
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
it("keeps the last complete list visible without exposing diagnostics or a competing preview to viewers", () => {
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
    screen.queryByText(
      /Choose the correct ID field|Returned output fields|Administrator details/,
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /Configurations/ }),
  ).not.toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Saved query output" }),
    ).getByText("Older complete result"),
  ).toBeVisible();
  expect(
    screen.queryByText("View newer query output preview"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("New result")).not.toBeInTheDocument();
  expect(screen.queryByText("List settings & status")).not.toBeInTheDocument();
});
it("shows initial query results to viewers without configuration warnings or repair controls", () => {
  mocks.useList.mockReturnValue({
    data: {
      ...pendingOutput,
      report: { ...pendingOutput.report, canConfigure: false },
    },
    refresh: mocks.refresh,
    reload: mocks.reload,
  });
  render(<Page params={{ listKey: "list-demo" }} />);
  expect(screen.getByText("New result")).toBeVisible();
  expect(screen.getByText("Fundraiser details pending")).toBeVisible();
  expect(
    screen.queryByText(
      /Choose the correct ID|Returned output fields|Administrator details/,
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /List settings|Configure list/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: /Refresh query output|Reload status/,
    }),
  ).not.toBeInTheDocument();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.reload).not.toHaveBeenCalled();
});
it("gives administrators a direct setup entry without an expanded warning", () => {
  mocks.useList.mockReturnValue({ data: pendingOutput });
  render(<Page params={{ listKey: "list-demo" }} />);
  expect(
    screen.getByRole("link", { name: "List settings", exact: true }),
  ).toHaveAttribute("href", "/report-configurations");
  expect(screen.getByText("Choose the correct ID field.")).not.toBeVisible();
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
  fireEvent.click(screen.getByText("List settings & status"));
  const button = screen.getByRole("button", { name: "Refresh query output" });
  fireEvent.click(button);
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(true);
});
it("replaces the expired-job Resume loop with one clearly labeled restart and no misleading waiting status", () => {
  mocks.useList.mockReturnValue({
    data: {
      ...pendingOutput,
      queryOutput: null,
      refresh: {
        status: "needs_restart",
        stage: "query",
        message: "This query attempt has expired and is not running.",
        retryAt: null,
      },
    },
    refresh: mocks.refresh,
    reload: mocks.reload,
  });
  vi.spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  render(<Page params={{ listKey: "list-demo" }} />);
  expect(
    screen.getByText("Refresh paused. Try again when ready."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/Waiting for NXT|Resume after/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Resume refresh" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Restart unfinished refresh" }),
  ).not.toBeInTheDocument();
  expect(mocks.refresh).not.toHaveBeenCalled();
  const restart = screen.getByRole("button", {
    name: "Restart refresh",
    exact: true,
  });
  fireEvent.click(restart);
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(restart);
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(true);
});
it("does not hide a real cooldown or imply an expired query is still running", () => {
  mocks.useList.mockReturnValue({
    data: {
      ...pendingOutput,
      queryOutput: null,
      refresh: {
        status: "needs_restart",
        stage: "query",
        retryAt: "2099-09-20T01:00:00Z",
        busy: true,
      },
    },
    refresh: mocks.refresh,
  });
  render(<Page params={{ listKey: "list-demo" }} />);
  expect(screen.getByText(/A new refresh can start after/)).not.toBeVisible();
  fireEvent.click(screen.getByText("List settings & status"));
  expect(screen.getByText(/A new refresh can start after/)).toBeVisible();
  expect(
    screen.queryByText(/Waiting for NXT|Resume after/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Restart refresh" }),
  ).toBeDisabled();
});
