import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { csvWorkspace } from "../../../../test/societyLetterCsvFixture";
import LetterCsvExport from "./LetterCsvExport";

describe("mail merge export controls", () => {
  it("previews date and name options and saves per-society defaults without exporting", async () => {
    const data = csvWorkspace(),
      onSaveFormat = vi.fn().mockResolvedValue({}),
      onExport = vi.fn();
    render(
      <LetterCsvExport
        data={data}
        onSaveFormat={onSaveFormat}
        onExport={onExport}
      />,
    );
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    const preview = within(
      screen.getByRole("region", { name: "CSV wording preview" }),
    );
    expect(preview.getByText("Dear Al,")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Salutation format"), {
      target: { value: "individual_first" },
    });
    fireEvent.change(screen.getByLabelText("Addressee format"), {
      target: { value: "household_preferred" },
    });
    fireEvent.change(screen.getByLabelText("CSV date display"), {
      target: { value: "short_us" },
    });
    fireEvent.change(screen.getByLabelText("CSV letter date"), {
      target: { value: "2026-10-15" },
    });
    expect(preview.getByText("Dear Alex,")).toBeVisible();
    expect(preview.getByText("Al Example")).toBeVisible();
    expect(preview.getByText("10/15/2026")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Save CSV format for this society" }),
    );
    await waitFor(() => expect(onSaveFormat).toHaveBeenCalledOnce());
    expect(onSaveFormat.mock.calls[0][0]).toMatchObject({
      action: "save_csv_format",
      societyKey: "ood",
      csvFormat: {
        salutation: "individual_first",
        addressee: "household_preferred",
        dateFormat: "short_us",
      },
    });
    expect(onSaveFormat.mock.calls[0][0]).not.toHaveProperty("letterDate");
    expect(onExport).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/CSV format saved for this society/),
    ).toBeVisible();
  });
  it("restores server-saved formats across mounts and keeps society drafts separate", () => {
    const data = csvWorkspace();
    data.csvFormats = {
      ood: {
        salutation: "reviewed",
        addressee: "record",
        dateFormat: "iso",
        joiner: " and ",
        sharedLastName: "repeat",
        organization: "address",
        greetingField: "salutation",
      },
    };
    render(<LetterCsvExport data={data} onExport={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    expect(screen.getByLabelText("Salutation format")).toHaveValue("reviewed");
    fireEvent.change(screen.getByLabelText("Salutation format"), {
      target: { value: "individual_preferred" },
    });
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "presidents" },
    });
    expect(screen.getByLabelText("Salutation format")).toHaveValue(
      "household_preferred",
    );
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    expect(screen.getByLabelText("Salutation format")).toHaveValue(
      "individual_preferred",
    );
    expect(screen.getByLabelText("CSV date display")).toHaveValue("iso");
  });
  it("reports a failed format save without claiming success", async () => {
    render(
      <LetterCsvExport
        data={csvWorkspace()}
        onSaveFormat={vi
          .fn()
          .mockRejectedValue(new Error("Reload current settings first."))}
      />,
    );
    fireEvent.change(screen.getByLabelText("Society for CSV"), {
      target: { value: "ood" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save CSV format for this society" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reload current settings first.",
    );
    expect(
      screen.queryByText(/CSV format saved for this society/),
    ).not.toBeInTheDocument();
  });
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
