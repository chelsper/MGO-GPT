import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act as reactAct,
} from "@testing-library/react";
import BulkLetterAppealUpdates from "./BulkLetterAppealUpdates";
import { savedLetterElementId } from "./letterHistoryFocus";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
});

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
  it("puts confirmation in a named dialog and supports Escape without starting updates", () => {
    const props = fixture();
    render(<BulkLetterAppealUpdates {...props} />);
    select();
    const dialog = screen.getByRole("dialog", {
      name: "Finish NXT updates for 2 letters?",
    });
    expect(dialog).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm and finish NXT updates" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Back to selection" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Back to selection" }),
    ).toHaveFocus();
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(props.onActiveChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("2 selected")).toBeVisible();
    expect(props.act).not.toHaveBeenCalled();
  });
  it("does not dismiss an active request with Escape", async () => {
    const props = fixture(1);
    let resolve;
    props.act.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<BulkLetterAppealUpdates {...props} />);
    select();
    confirm();
    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(dialog).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Stop after this household" }),
    ).toBeEnabled();
    await reactAct(async () =>
      resolve({
        bulkAppealUpdate: {
          deliveryId: "letter-0",
          status: "complete",
          stop: false,
        },
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("offers a read-only reload after a stopped request without restarting updates", async () => {
    const props = fixture(1);
    props.act.mockResolvedValueOnce(null);
    const onReload = vi.fn(async () => ({ history: props.items }));
    render(<BulkLetterAppealUpdates {...props} onReload={onReload} />);
    select();
    confirm();
    fireEvent.click(
      await screen.findByRole("button", { name: "Reload saved status" }),
    );
    await screen.findByText(/Saved status reloaded/);
    expect(onReload).toHaveBeenCalledOnce();
    expect(props.act).toHaveBeenCalledOnce();
  });
  it("opens and focuses the exact saved letter from an attention result", async () => {
    const props = fixture(1);
    props.act.mockResolvedValueOnce({
      bulkAppealUpdate: {
        deliveryId: "letter-0",
        status: "needs_review",
        stop: false,
        message: "Address needs review.",
      },
    });
    render(
      <>
        <BulkLetterAppealUpdates {...props} />
        <details>
          <summary>Saved letters</summary>
          <div tabIndex={-1} id={savedLetterElementId("letter-0")}>
            Letter details
          </div>
        </details>
      </>,
    );
    select();
    confirm();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review Sample 0" }),
    );
    expect(screen.getByText("Letter details")).toHaveFocus();
    expect(
      screen.getByText("Saved letters").closest("details"),
    ).toHaveAttribute("open");
    expect(props.act).toHaveBeenCalledOnce();
  });
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
