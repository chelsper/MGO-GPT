import { describe, expect, it, vi } from "vitest";
import {
  act as reactAct,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { csvWorkspace } from "../../../../test/societyLetterCsvFixture";
import CsvRunManager from "./CsvRunManager";

function fixture(count = 2) {
  const data = csvWorkspace(count);
  const run = {
    id: "run",
    sha256: "a".repeat(64),
    periodKey: data.period.key,
    societyName: "Order of the Dolphin",
    letterDate: data.today,
    count,
    createdAt: "2026-10-12T12:00:00Z",
    entries: data.rows.map(({ householdId, name }) => ({ householdId, name })),
  };
  data.csvRuns = [run];
  data.history = [];
  const act = vi.fn(async (body) =>
    body.action === "confirm_csv_letters"
      ? { csvDeliveryIds: body.householdIds }
      : {
          bulkAppealUpdate: {
            deliveryId: body.deliveryId,
            status: "complete",
            stop: false,
          },
        },
  );
  return {
    data,
    run,
    act,
    loadRun: vi.fn().mockResolvedValue(run),
    downloadRun: vi.fn(),
    onActiveChange: vi.fn(),
  };
}
async function open() {
  fireEvent.change(screen.getByLabelText("Tracked export"), {
    target: { value: "run" },
  });
  await screen.findByRole("button", { name: "Select eligible on this page" });
}
describe("tracked CSV controls", () => {
  it("does not fetch, reserve or submit appeals on mount; requires selection and explicit creation confirmation", async () => {
    const f = fixture();
    render(<CsvRunManager {...f} />);
    expect(f.loadRun).not.toHaveBeenCalled();
    expect(f.act).not.toHaveBeenCalled();
    await open();
    const button = screen.getByRole("button", {
      name: "Confirm letters created & apply appeals",
    });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Example 0/ }));
    expect(button).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I created and checked/ }),
    );
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText(/1 letter has confirmed appeals/);
    expect(f.act.mock.calls.map(([body]) => body.action)).toEqual([
      "confirm_csv_letters",
      "finish_selected_letter_appeals",
    ]);
    expect(f.act.mock.calls[0][0]).toMatchObject({
      runId: "run",
      sha256: f.run.sha256,
      householdIds: ["1000"],
      confirm: true,
    });
    expect(f.act.mock.calls[1][0]).toMatchObject({
      deliveryIds: ["1000"],
      deliveryId: "1000",
      confirm: true,
    });
    expect(screen.getByText(/Nothing has been marked mailed/)).toBeVisible();
  });
  it("downloads the original without creation or appeals and pages large exports in groups of 50", async () => {
    const f = fixture(120);
    render(<CsvRunManager {...f} />);
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Download original CSV again" }),
    );
    expect(f.downloadRun).toHaveBeenCalledWith("run");
    expect(f.act).not.toHaveBeenCalled();
    expect(screen.getAllByRole("checkbox")).toHaveLength(51);
    fireEvent.click(
      screen.getByRole("button", { name: "Select eligible on this page" }),
    );
    expect(screen.getByText(/50 selected \(up to 50\)/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next CSV page" }));
    expect(
      screen.getByRole("checkbox", { name: /Example 50 / }),
    ).toBeDisabled();
    expect(f.act).not.toHaveBeenCalled();
  });
  it("does not continue NXT work when confirmation fails", async () => {
    const f = fixture();
    f.act.mockResolvedValue(null);
    render(<CsvRunManager {...f} />);
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Select eligible on this page" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I created and checked/ }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm letters created & apply appeals",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Confirmation could not finish",
    );
    expect(
      screen.queryByText("Saving your confirmation..."),
    ).not.toBeInTheDocument();
    expect(f.act).toHaveBeenCalledOnce();
  });
  it("stops between households when NXT requests a pause", async () => {
    const f = fixture();
    f.act.mockImplementation(async (body) =>
      body.action === "confirm_csv_letters"
        ? { csvDeliveryIds: ["1000", "1001"] }
        : {
            bulkAppealUpdate: {
              deliveryId: body.deliveryId,
              status: "pending",
              stop: true,
            },
          },
    );
    render(<CsvRunManager {...f} />);
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Select eligible on this page" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I created and checked/ }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm letters created & apply appeals",
      }),
    );
    await screen.findByText(/Paused before the next household/);
    expect(f.act).toHaveBeenCalledTimes(2);
  });
  it("does not start appeals after leaving while confirmation is in flight", async () => {
    const f = fixture();
    let resolve;
    f.act.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = render(<CsvRunManager {...f} />);
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Select eligible on this page" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I created and checked/ }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm letters created & apply appeals",
      }),
    );
    view.unmount();
    await reactAct(async () => resolve({ csvDeliveryIds: ["1000", "1001"] }));
    expect(f.act).toHaveBeenCalledOnce();
  });
});
