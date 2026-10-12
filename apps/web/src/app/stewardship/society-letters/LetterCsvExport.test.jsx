import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { csvWorkspace } from "../../../../test/societyLetterCsvFixture";
import LetterCsvExport from "./LetterCsvExport";

describe("mail merge export controls", () => {
  it("provides a separate opt-in tracked export, not an appeal or mailing action", async () => {
    const data = csvWorkspace(70),
      onExport = vi.fn(),
      onTrackedExport = vi.fn().mockResolvedValue(undefined);
    render(
      <LetterCsvExport
        data={data}
        onExport={onExport}
        onTrackedExport={onTrackedExport}
      />,
    );
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save tracked CSV & download" }),
    );
    await waitFor(() => expect(onTrackedExport).toHaveBeenCalledOnce());
    expect(onTrackedExport.mock.calls[0][0]).toMatchObject({
      action: "create_csv_run",
      householdIds: data.rows.map((row) => row.householdId),
    });
    expect(onExport).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Tracked CSV saved for 70 households/),
    ).toBeVisible();
  });
  it("exports all reviewed households for one society only on an explicit click", async () => {
    const data = csvWorkspace(70);
    data.rows[69].recipientReview.status = "unreviewed";
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<LetterCsvExport data={data} busy={false} onExport={onExport} />);
    const button = screen.getByRole("button", {
      name: "Download reviewed households (.csv)",
    });
    expect(button).toBeDisabled();
    expect(onExport).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    expect(
      screen.getByText("69 households ready for CSV; 1 not included."),
    ).toBeVisible();
    fireEvent.click(screen.getByText("Why some recipients are not included"));
    expect(
      screen.getByText(/Review and save recipient choices first/),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("CSV letter date"), {
      target: { value: "2026-10-14" },
    });
    fireEvent.click(button);
    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
    expect(onExport.mock.calls[0][0]).toMatchObject({
      action: "export_merge_csv",
      revision: 7,
      letterDate: "2026-10-14",
      societyKey: "ood",
      householdIds: data.rows.slice(0, 69).map((row) => row.householdId),
    });
    expect(
      await screen.findByText(/CSV download started for 69 households/),
    ).toBeVisible();
    expect(
      screen.getByText(/Repeating an export may include the same households/),
    ).toBeVisible();
  });
  it("blocks duplicate clicks and surfaces failures without marking success", async () => {
    const data = csvWorkspace();
    let reject;
    const onExport = vi.fn(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    render(<LetterCsvExport data={data} onExport={onExport} />);
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    const button = screen.getByRole("button", {
      name: /Download reviewed households/,
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    reject(new Error("Reload saved results first."));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reload saved results first.",
    );
    expect(screen.queryByText(/CSV download started/)).not.toBeInTheDocument();
  });
  it("disables export during other work and when setup is out of date", () => {
    const data = csvWorkspace();
    const onExport = vi.fn();
    const { rerender } = render(
      <LetterCsvExport data={data} busy onExport={onExport} />,
    );
    expect(screen.getByLabelText("Society for CSV")).toBeDisabled();
    rerender(
      <LetterCsvExport
        data={{ ...data, setup: { membershipCurrent: false } }}
        onExport={onExport}
      />,
    );
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    expect(
      screen.getByRole("button", { name: /Download reviewed households/ }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Save source settings and finish a membership refresh/),
    ).toBeVisible();
  });
});
