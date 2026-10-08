import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act as reactAct,
} from "@testing-library/react";
import BulkLetterAppealUpdates from "./BulkLetterAppealUpdates";

function fixture(count = 2) {
  const items = Array.from({ length: count }, (_, i) => ({
    id: `letter-${i}`,
    name: `Sample ${i}`,
    societyName: "Sample Society",
    members: [String(10 + i)],
    batchId: `batch-${i}`,
    channel: "post",
    status: "prepared",
    letterAppeals: {
      date: "2026-10-08",
      status: "pending",
      appeal: { id: "100", description: "Sample Letter Appeal" },
      members: [{ id: String(10 + i), status: "pending" }],
    },
  }));
  const act = vi.fn(async (body) => ({
    bulkAppealUpdate: {
      deliveryId: body.deliveryId,
      status: "complete",
      stop: false,
    },
  }));
  return { items, act, busy: false, onActiveChange: vi.fn() };
}
function select() {
  fireEvent.click(
    screen.getByRole("button", { name: "Select up to 50 unfinished letters" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Finish updates for selected letters" }),
  );
}
function confirm() {
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm and finish NXT updates" }),
  );
}
describe("bulk saved letter appeal updates", () => {
  it("requires one explicit confirmation, submits saved IDs only, and finishes sequentially across batches", async () => {
    const props = fixture();
    let resolve;
    props.act.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<BulkLetterAppealUpdates {...props} />);
    expect(props.act).not.toHaveBeenCalled();
    select();
    expect(props.act).not.toHaveBeenCalled();
    expect(props.onActiveChange).toHaveBeenLastCalledWith(true);
    const confirmationButton = screen.getByRole("button", {
      name: "Confirm and finish NXT updates",
    });
    fireEvent.click(confirmationButton);
    fireEvent.click(confirmationButton);
    expect(props.act).toHaveBeenCalledTimes(1);
    await reactAct(async () =>
      resolve({
        bulkAppealUpdate: {
          deliveryId: "letter-0",
          status: "complete",
          stop: false,
        },
      }),
    );
    await waitFor(() => expect(props.act).toHaveBeenCalledTimes(2));
    expect(props.act.mock.calls.map(([body]) => body)).toEqual(
      ["letter-0", "letter-1"].map((deliveryId) => ({
        action: "finish_selected_letter_appeals",
        deliveryIds: ["letter-0", "letter-1"],
        deliveryId,
        confirm: true,
      })),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 letters are ready to download",
    );
    expect(props.onActiveChange).toHaveBeenLastCalledWith(false);
  });
  it("leaves record-specific exceptions in Needs attention and continues other selected letters", async () => {
    const props = fixture();
    props.act.mockResolvedValueOnce({
      bulkAppealUpdate: {
        deliveryId: "letter-0",
        status: "needs_review",
        stop: false,
        message: "Review the conflicting appeal on this record.",
      },
    });
    render(<BulkLetterAppealUpdates {...props} />);
    select();
    confirm();
    await waitFor(() => expect(props.act).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("heading", { name: "Needs attention" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Review the conflicting appeal on this record."),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 letter is ready to download. 1 need attention",
    );
  });
  it.each(["cooldown", "missing", "wrong response", "transport"])(
    "stops without retrying after %s",
    async (kind) => {
      const props = fixture();
      if (kind === "transport")
        props.act.mockRejectedValueOnce(new Error("offline"));
      else
        props.act.mockResolvedValueOnce(
          kind === "missing"
            ? null
            : {
                bulkAppealUpdate: {
                  deliveryId: kind === "wrong response" ? "wrong" : "letter-0",
                  status: "needs_review",
                  stop: true,
                  message: "Wait for Blackbaud's cooldown.",
                },
              },
        );
      render(<BulkLetterAppealUpdates {...props} />);
      select();
      confirm();
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent("Updates paused"),
      );
      expect(props.act).toHaveBeenCalledTimes(1);
    },
  );
  it("does not start another household after stopping or leaving the page", async () => {
    for (const leave of [false, true]) {
      const props = fixture();
      let resolve;
      props.act.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const { unmount } = render(<BulkLetterAppealUpdates {...props} />);
      select();
      confirm();
      if (leave) unmount();
      else
        fireEvent.click(
          screen.getByRole("button", { name: "Stop after this household" }),
        );
      await reactAct(async () =>
        resolve({
          bulkAppealUpdate: {
            deliveryId: "letter-0",
            status: "complete",
            stop: false,
          },
        }),
      );
      expect(props.act).toHaveBeenCalledTimes(1);
      expect(props.onActiveChange).toHaveBeenLastCalledWith(false);
      unmount();
    }
  });
  it("selects at most 50 unfinished letters, excludes completed/email records and never starts on load", () => {
    const props = fixture(53);
    props.items[0].letterAppeals = {
      status: "complete",
      members: [{ status: "verified" }],
    };
    props.items[1].channel = "email";
    render(<BulkLetterAppealUpdates {...props} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select up to 50 unfinished letters",
      }),
    );
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(50);
    expect(
      screen.getAllByRole("checkbox", { checked: false })[0],
    ).toBeDisabled();
    expect(props.act).not.toHaveBeenCalled();
  });
  it("drops hidden selections when filters change, and supports individual selection", () => {
    const props = fixture();
    const { rerender } = render(<BulkLetterAppealUpdates {...props} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    rerender(<BulkLetterAppealUpdates {...props} items={[props.items[1]]} />);
    expect(
      screen.getByRole("button", {
        name: "Finish updates for selected letters",
      }),
    ).toBeDisabled();
    expect(props.act).not.toHaveBeenCalled();
  });
  it("keeps a completed summary visible as saved records refresh, and allows backing out without writing", async () => {
    const props = fixture(1);
    const { rerender } = render(<BulkLetterAppealUpdates {...props} />);
    select();
    fireEvent.click(screen.getByRole("button", { name: "Back to selection" }));
    expect(props.act).not.toHaveBeenCalled();
    select();
    confirm();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "1 letter is ready to download",
      ),
    );
    rerender(<BulkLetterAppealUpdates {...props} items={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 letter is ready to download",
    );
  });
});
