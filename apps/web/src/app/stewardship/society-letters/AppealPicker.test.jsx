import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act as reactAct,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ReadinessSettings } from "./LetterReadinessPanel";
import ExclusionAppealSettings from "./ExclusionAppealSettings";

const choice = {
  lookupId: "CY26OOD-MGO",
  description: "CY2026 OOD Letter Sent via JUMGOGPT",
};
const excluded = {
  lookupId: "CY26OODEX-MGO",
  description: "CY 2026 OOD Letter Excluded",
};
const base = {
  period: { start: "2026-01-01", end: "2026-12-31" },
  settings: { sourceMode: "society_queries", societyKeys: ["ood"] },
  definitions: [{ key: "ood", name: "Order of the Dolphin" }],
  readiness: { policy: null },
  exclusionAppeals: {},
};
const loadButton = () =>
  screen.getByRole("button", { name: "Load appeal choices from NXT" });
function mockChoices(appeals = [choice, excluded]) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () =>
      Response.json({ appeals, omittedCount: 2 }),
    );
}
afterEach(() => vi.restoreAllMocks());

describe("society appeal picker", () => {
  it("does not label edited exclusion settings as verified", () => {
    render(
      <ExclusionAppealSettings
        data={{
          ...base,
          exclusionAppeals: {
            current: true,
            policy: { appeals: { ood: excluded } },
          },
        }}
        act={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("NXT exclusion appeal settings"));
    expect(
      screen.getByText("Exclusion appeal settings verified for this period."),
    ).toBeVisible();
    fireEvent.click(
      screen.getByText("Enter or edit exclusion appeal manually"),
    );
    fireEvent.change(
      screen.getByLabelText(
        "Order of the Dolphin exclusion appeal description",
      ),
      { target: { value: "Edited description" } },
    );
    expect(
      screen.queryByText("Exclusion appeal settings verified for this period."),
    ).not.toBeInTheDocument();
  });
  it("loads only on request, searches locally, fills exact fields, and waits for explicit verification", async () => {
    const fetch = mockChoices();
    const save = vi.fn().mockResolvedValue(null);
    render(<ReadinessSettings data={base} act={save} />);
    fireEvent.click(screen.getByText("Letter appeal settings for this period"));
    expect(fetch).not.toHaveBeenCalled();
    const search = screen.getByLabelText(
      "Order of the Dolphin letter-sent appeal search",
    );
    expect(search).toBeDisabled();
    fireEvent.click(loadButton());
    await screen.findByText(/2 appeal choices loaded/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      action: "inspect_appeals",
    });
    fireEvent.change(search, { target: { value: "Letter Sent" } });
    expect(screen.getByText("1 match. Choose one below.")).toBeVisible();
    expect(
      screen.getByLabelText("Order of the Dolphin appeal code"),
    ).toHaveValue("");
    fireEvent.click(
      screen.getByRole("button", {
        name: `Select ${choice.lookupId}: ${choice.description}`,
      }),
    );
    expect(
      screen.getByLabelText("Order of the Dolphin appeal code"),
    ).toHaveValue(choice.lookupId);
    expect(search).toHaveFocus();
    expect(
      screen.getByLabelText("Order of the Dolphin appeal description"),
    ).toHaveValue(choice.description);
    expect(
      screen.getByText(
        /For Order of the Dolphin, 2026-01-01 through 2026-12-31/,
      ),
    ).toBeVisible();
    const verify = screen.getByRole("button", {
      name: "Verify and save appeal settings",
    });
    expect(verify).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(fireEvent.keyDown(search, { key: "Enter", code: "Enter" })).toBe(
      false,
    );
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(verify);
    await waitFor(() =>
      expect(save).toHaveBeenCalledExactlyOnceWith({
        action: "readiness_settings",
        confirm: true,
        appeals: { ood: choice },
      }),
    );
    // A failed verification preserves the draft; a different selection clears confirmation.
    expect(
      screen.getByLabelText("Order of the Dolphin appeal code"),
    ).toHaveValue(choice.lookupId);
    fireEvent.change(search, { target: { value: "CY26OODEX" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: `Select ${excluded.lookupId}: ${excluded.description}`,
      }),
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("handles exclusion choices separately without applying an appeal", async () => {
    const fetch = mockChoices();
    const save = vi.fn();
    render(<ExclusionAppealSettings data={base} act={save} />);
    fireEvent.click(screen.getByText("NXT exclusion appeal settings"));
    fireEvent.click(loadButton());
    await screen.findByText(/2 appeal choices loaded/);
    fireEvent.change(
      screen.getByLabelText("Order of the Dolphin exclusion appeal search"),
      { target: { value: "Excluded" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Select ${excluded.lookupId}: ${excluded.description}`,
      }),
    );
    expect(
      screen.getByLabelText(
        "Order of the Dolphin exclusion appeal description",
      ),
    ).toHaveValue(excluded.description);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and save exclusion appeals" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      action: "exclusion_appeal_settings",
      appeals: { ood: excluded },
      confirm: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("shares one load across society fields and does not reinterpret numeric lookup codes", async () => {
    const numeric = { ...choice, lookupId: "100" };
    const fetch = mockChoices([numeric]);
    const data = {
      ...base,
      settings: { ...base.settings, societyKeys: ["ood", "presidents"] },
      definitions: [
        ...base.definitions,
        { key: "presidents", name: "President's Society" },
      ],
      readiness: {
        policy: {
          appeals: { ood: { id: "old-id", description: "Old mapping" } },
        },
      },
    };
    render(<ReadinessSettings data={data} act={vi.fn()} />);
    fireEvent.click(screen.getByText("Letter appeal settings for this period"));
    fireEvent.click(loadButton());
    await screen.findByText(/1 appeal choice loaded/);
    fireEvent.change(
      screen.getByLabelText("Order of the Dolphin letter-sent appeal search"),
      { target: { value: "100" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Select 100: ${choice.description}` }),
    );
    expect(
      screen.getByLabelText("Order of the Dolphin find appeal by"),
    ).toHaveValue("lookup");
    expect(
      screen.getByLabelText("Order of the Dolphin appeal code"),
    ).toHaveValue("100");
    expect(
      screen.queryByLabelText("Order of the Dolphin appeal system record ID"),
    ).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("President's Society letter-sent appeal search"),
      { target: { value: "100" } },
    );
    expect(
      screen.getByRole("button", { name: `Select 100: ${choice.description}` }),
    ).toBeEnabled();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("bounds the displayed results and offers a no-match state", async () => {
    mockChoices(
      Array.from({ length: 30 }, (_, i) => ({
        lookupId: `CODE-${i}`,
        description: `Society letter ${i}`,
      })),
    );
    render(<ReadinessSettings data={base} act={vi.fn()} />);
    fireEvent.click(screen.getByText("Letter appeal settings for this period"));
    fireEvent.click(loadButton());
    await screen.findByText(/30 appeal choices loaded/);
    const search = screen.getByLabelText(
      "Order of the Dolphin letter-sent appeal search",
    );
    fireEvent.change(search, { target: { value: "society" } });
    expect(
      screen.getAllByRole("button", { name: /^Select CODE/ }),
    ).toHaveLength(20);
    expect(screen.getByText(/30 matches; showing the first 20/)).toBeVisible();
    fireEvent.change(search, { target: { value: "not-matched" } });
    expect(screen.getByText(/No matching appeal/)).toBeVisible();
  });
  it("keeps saved settings and manual entry available after a load failure", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json(
          { error: "Blackbaud has paused appeal lookup." },
          { status: 429 },
        ),
      );
    render(
      <ReadinessSettings
        data={{
          ...base,
          readiness: { policy: { appeals: { ood: { ...choice, id: "100" } } } },
        }}
        act={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Letter appeal settings for this period"));
    fireEvent.click(loadButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Blackbaud has paused appeal lookup.",
    );
    expect(
      screen.getByLabelText("Order of the Dolphin appeal code"),
    ).toHaveValue(choice.lookupId);
    fireEvent.click(screen.getByText("Enter or edit appeal manually"));
    expect(
      screen.getByLabelText("Order of the Dolphin appeal description"),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("deduplicates double clicks, disables edits while loading, and aborts on unmount", async () => {
    let finish;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = render(<ReadinessSettings data={base} act={vi.fn()} />);
    fireEvent.click(screen.getByText("Letter appeal settings for this period"));
    fireEvent.click(loadButton());
    fireEvent.click(
      screen.getByRole("button", { name: "Loading appeal choices..." }),
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      screen.getByLabelText("Order of the Dolphin appeal code"),
    ).toBeDisabled();
    const signal = fetch.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    await reactAct(async () =>
      finish(Response.json({ appeals: [choice], omittedCount: 0 })),
    );
  });
});
