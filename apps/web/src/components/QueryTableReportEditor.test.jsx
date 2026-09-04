import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportConfigurationEditor from "./ReportConfigurationEditor";
import { getDashboardReportMetadata } from "@/app/api/utils/reportRegistry";
import { validateDashboardConfiguration } from "@/app/api/utils/dashboardConfiguration";

afterEach(() => vi.unstubAllGlobals());

describe("query table report editor integration", () => {
  it("previews query 30971, saves only its definition, then requires explicit sharing", async () => {
    let saved;
    const fetchMock = vi.fn().mockImplementation(async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.endsWith("test-query-results"))
        return {
          ok: true,
          json: async () => ({
            queryId: "30971",
            headers: ["PPC Member Name", "Total Giving FY27"],
            rows: [["Synthetic Member", "$0.00"]],
            dataSource: "query-results-csv-v1",
          }),
        };
      saved = {
        ...getDashboardReportMetadata("dashboard-ppc"),
        key: "dashboard-ppc",
        visibility: "specific_users",
        specificUserIds: [],
        active: false,
        canView: false,
        ...saved,
        ...body,
      };
      return { ok: true, json: async () => ({ configuration: saved }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ReportConfigurationEditor
        initialConfigurations={[]}
        users={[
          {
            id: 1,
            name: "Report Reviewer",
            email: "reviewer@example.test",
            role: "reviewer",
          },
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add report", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("Report title"), {
      target: { value: "PPC 2026-27" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add Output Query panel",
        exact: true,
      }),
    );
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "30971" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Load query preview", exact: true }),
    );
    expect(await screen.findByText("Synthetic Member")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Column display settings (optional)"));
    fireEvent.change(screen.getByLabelText("Format for Total Giving FY27"), {
      target: { value: "currency" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create disabled report",
        exact: true,
      }),
    );
    await screen.findByText(/Report created as a disabled draft/);
    const createBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(validateDashboardConfiguration(createBody.dataConfiguration)).toBe(
      "",
    );
    expect(createBody.dataConfiguration.panels[0]).toMatchObject({
      layout: "query_results",
      queryId: "30971",
      rows: [],
      columns: [],
      values: [],
      columnSettings: [{ header: "Total Giving FY27", format: "currency" }],
    });
    expect(JSON.stringify(createBody)).not.toContain("Synthetic Member");
    expect(createBody).not.toHaveProperty("active");
    expect(
      screen.getByRole("checkbox", { name: /Enable this report/ }),
    ).not.toBeChecked();
    expect(
      screen.getByText(
        /snapshot is not filtered by each viewer's NXT permissions/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Report Reviewer/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Enable this report/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save access", exact: true }),
    );
    await screen.findByText(/Access settings saved/);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      reportKey: "dashboard-ppc",
      visibility: "specific_users",
      specificUserIds: [1],
      active: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      within(screen.getByRole("region", { name: "Report access" })).getByRole(
        "checkbox",
        { name: /Enable this report/ },
      ),
    ).toBeChecked();
  });
});
