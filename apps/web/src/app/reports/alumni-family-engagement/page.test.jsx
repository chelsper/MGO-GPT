import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AlumniFamilyEngagementPage from "./page";

const { adminUser } = vi.hoisted(() => ({
  adminUser: { id: 1, role: "admin" },
}));
vi.mock("@/utils/useUser", () => ({
  default: () => ({ data: adminUser, loading: false }),
}));
vi.mock("@/app/reports/SharedReportHeader", () => ({
  default: ({ title, action }) => <header><h1>{title}</h1>{action}</header>,
}));

const donorPanel = {
  key: "donors",
  type: "alumni_donor_count",
  title: "Alumni donor count",
  width: "half",
  rows: [{ key: "fy27", label: "FY27", queryId: "30976", refreshPolicy: "refreshable" }],
};
const queryPanel = {
  key: "ppc",
  title: "PPC output",
  layout: "query_results",
  width: "half",
  queryId: "30971",
  refreshPolicy: "refreshable",
  columnSettings: [],
  rows: [],
  columns: [],
  values: [],
};
const report = {
  status: "complete",
  generatedAt: "2026-09-04T12:00:00Z",
  report: { title: "Alumni & Family Engagement", description: "Details", canArrange: true },
  dashboardConfiguration: { dashboardVersion: 2, panels: [donorPanel, queryPanel] },
  dashboard: { panels: [{ ...donorPanel, totals: [{ ...donorPanel.rows[0], total: 139 }] }] },
  genericConfiguration: { version: 1, panels: [queryPanel] },
  genericSnapshot: { status: "refresh_required", values: [], tables: [] },
};
const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(report))));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AlumniFamilyEngagementPage dashboard arrangement", () => {
  it("saves mixed panel order and width without refreshing report data", async () => {
    render(<AlumniFamilyEngagementPage />);
    expect(await screen.findByText("139")).toBeInTheDocument();
    fetch.mockResolvedValueOnce(json({
      configuration: {
        dataConfiguration: {
          dashboardVersion: 2,
          panels: [{ ...queryPanel, width: "full" }, donorPanel],
        },
      },
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Arrange dashboard" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Arrange dashboard" }));
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move PPC output earlier" }));
    fireEvent.click(screen.getByRole("button", { name: "Use full width for PPC output" }));
    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const request = JSON.parse(fetch.mock.calls[1][1].body);
    expect(request.reportKey).toBe("alumni-family-engagement");
    expect(request.dataConfiguration.panels.map((panel) => panel.key)).toEqual(["ppc", "donors"]);
    expect(request.dataConfiguration.panels[0].width).toBe("full");
    expect(await screen.findByText(/Dashboard layout saved/)).toBeInTheDocument();
    expect(screen.getByText("139")).toBeInTheDocument();
  });
});
