import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
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
