import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AlumniReportConfiguration, { AlumniReportPreview } from "./AlumniReportConfiguration";
import { DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD, getAlumniDonorCountRowFingerprint } from "@/app/api/utils/alumniDonorConfiguration";

function Harness() {
  const [value, setValue] = useState(DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD);
  return <><AlumniReportConfiguration value={value} onChange={setValue} /><output data-testid="configuration">{JSON.stringify(value)}</output></>;
}

afterEach(() => vi.unstubAllGlobals());

describe("existing Alumni configuration compatibility", () => {
  it("edits presentation without changing saved query IDs or frozen policy", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Panel title"), { target: { value: "Historical engagement" } });
    fireEvent.change(screen.getAllByLabelText("Row label")[0], { target: { value: "Current fiscal year" } });
    const data = JSON.parse(screen.getByTestId("configuration").textContent);
    expect(data.panels[0].rows.map((row) => [row.key, row.queryId, row.refreshPolicy])).toEqual(DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD.panels[0].rows.map((row) => [row.key, row.queryId, row.refreshPolicy]));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses a manager-only test request without saving snapshots and rejects invalid returned counts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ queryId: "30976", count: "bad" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getAllByRole("button", { name: "Test query" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("did not return a valid row count");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/reports/dashboards/test-query");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ queryId: "30976" });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ queryId: "30976", count: 0 }) });
    fireEvent.click(screen.getAllByRole("button", { name: "Test query" })[0]);
    expect(await within(screen.getByRole("region", { name: "Count row 1" })).findByRole("status")).toHaveTextContent("0 result rows");
  });
  it("previews only source-compatible saved totals, including zero", () => {
    const configuration = DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD;
    const panel = configuration.panels[0];
    const fingerprint = getAlumniDonorCountRowFingerprint(configuration, { ...panel.rows[0], panelKey: panel.key, panelType: panel.type });
    render(<AlumniReportPreview configuration={configuration} snapshot={{ totals: [{ total: 0, definitionFingerprint: fingerprint }, { total: 99, definitionFingerprint: "old-source" }] }} />);
    expect(screen.getByText("0", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.queryByText("99", { exact: true })).not.toBeInTheDocument();
  });
});
