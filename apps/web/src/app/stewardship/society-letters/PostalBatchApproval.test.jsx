import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PostalBatchApproval, { PostalBatchRunner } from "./PostalBatchApproval";

vi.mock("./SavedLetterPreview", () => ({
  default: ({ onReady }) => (
    <button onClick={onReady}>Finish rendering test document</button>
  ),
}));
const entry = (id, prepared = true) => ({
  householdId: id,
  row: {
    name: `Example ${id}`,
    societyName: "Order of the Dolphin",
    members: [id],
    letterDate: "2026-09-28",
    templateVersion: "v1",
  },
  appeal: { id: "100", description: "Example letter appeal" },
  ...(prepared ? { document: { sha256: `hash-${id}` } } : {}),
});
const draft = (entries) => ({
  id: "draft",
  format: "docx",
  status: "draft",
  entries,
});
const batch = (status = "pending") => ({
  id: "batch",
  items: ["10", "20"].map((id) => ({
    id,
    batchId: "batch",
    letterAppeals: {
      status,
      members: [{ id, status: status === "complete" ? "verified" : status }],
    },
  })),
});

describe("saved postal approval UX", () => {
  it.each(["safe", "uncertain", "read-failed"])(
    "continues after an expired pause with one click only when reloaded receipts are safe: %s",
    async (outcome) => {
      let now = Date.now();
      const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
      try {
        const failed = batch();
        failed.items.forEach((item) => {
          item.status = "prepared";
        });
        failed.items[0].letterAppeals.status = "needs_review";
        failed.items[0].letterAppeals.verificationFailure = {
          checkedAt: new Date(now).toISOString(),
          httpStatus: 429,
          retryAfterMs: 60000,
        };
        const loaded = structuredClone(failed);
        if (outcome === "uncertain")
          loaded.items[0].letterAppeals.members[0].status = "uncertain";
        const reload = vi
          .fn()
          .mockResolvedValue(
            outcome === "read-failed" ? null : { history: loaded.items },
          );
        const act = vi
          .fn()
          .mockResolvedValueOnce({ history: failed.items })
          .mockResolvedValue({ history: batch("complete").items });
        const view = render(
          <PostalBatchRunner
            batch={batch()}
            busy={false}
            act={act}
            onReload={reload}
          />,
        );
        fireEvent.click(
          screen.getByRole("button", { name: "Continue saved letters" }),
        );
        await waitFor(() =>
          expect(screen.getByText(/Processing stopped/)).toBeVisible(),
        );
        view.rerender(
          <PostalBatchRunner
            batch={failed}
            busy={false}
            act={act}
            onReload={reload}
          />,
        );
        expect(
          screen.getByRole("button", { name: "Continue saved letters" }),
        ).toBeDisabled();
        now += 60001;
        view.rerender(
          <PostalBatchRunner
            batch={structuredClone(failed)}
            busy={false}
            act={act}
            onReload={reload}
          />,
        );
        expect(act).toHaveBeenCalledOnce();
        fireEvent.click(
          screen.getByRole("button", { name: "Continue saved letters" }),
        );
        await waitFor(() => expect(reload).toHaveBeenCalledOnce());
        await waitFor(() =>
          expect(
            screen.queryByRole("button", { name: /Creating one household/ }),
          ).not.toBeInTheDocument(),
        );
        expect(act).toHaveBeenCalledTimes(outcome === "safe" ? 2 : 1);
      } finally {
        clock.mockRestore();
      }
    },
  );
  it.each([false, true])(
    "prepares only a just-created draft once, without automatic approval (creation click: %s)",
    async (autoPrepare) => {
      const pending = draft([entry("10", false)]);
      const act = vi
        .fn()
        .mockResolvedValue({ postalDraft: draft([entry("10")]) });
      const consumed = vi.fn();
      const props = {
        draft: pending,
        revision: 3,
        busy: true,
        act,
        onApproved: vi.fn(),
        autoPrepare,
        onAutoPrepareConsumed: consumed,
      };
      const view = render(<PostalBatchApproval {...props} />);
      expect(act).not.toHaveBeenCalled();
      view.rerender(<PostalBatchApproval {...props} busy={false} />);
      if (autoPrepare) {
        await waitFor(() => expect(act).toHaveBeenCalledOnce());
        expect(act).toHaveBeenCalledWith({
          action: "prepare_postal_document",
          draftId: "draft",
          householdId: "10",
        });
        expect(consumed).toHaveBeenCalledOnce();
      }
      view.rerender(
        <PostalBatchApproval {...props} busy={false} revision={4} />,
      );
      expect(act).toHaveBeenCalledTimes(autoPrepare ? 1 : 0);
      expect(props.onApproved).not.toHaveBeenCalled();
    },
  );
  it("unlocks an expired provider pause on read-only reload, without resubmitting automatically", async () => {
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const failed = batch();
      failed.items.forEach((item) => {
        item.status = "prepared";
      });
      failed.items[0].letterAppeals.status = "needs_review";
      failed.items[0].letterAppeals.verificationFailure = {
        checkedAt: new Date(now).toISOString(),
        httpStatus: 429,
        retryAfterMs: 300000,
      };
      const act = vi.fn().mockResolvedValue({ history: failed.items });
      const reload = vi.fn().mockResolvedValue({ history: failed.items });
      const view = render(
        <PostalBatchRunner
          batch={batch()}
          busy={false}
          act={act}
          onReload={reload}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Continue saved letters" }),
      );
      await waitFor(() =>
        expect(screen.getByText(/Processing stopped/)).toBeVisible(),
      );
      view.rerender(
        <PostalBatchRunner
          batch={failed}
          busy={false}
          act={act}
          onReload={reload}
        />,
      );
      expect(screen.getByText(/NXT requested a pause/)).toBeVisible();
      fireEvent.click(
        screen.getByRole("button", { name: "Reload saved batch status" }),
      );
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(
        screen.getByRole("button", { name: "Continue saved letters" }),
      ).toBeDisabled();
      now += 300001;
      fireEvent.click(
        screen.getByRole("button", { name: "Reload saved batch status" }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Continue saved letters" }),
        ).toBeEnabled(),
      );
      expect(
        screen.queryByText(/NXT requested a pause/),
      ).not.toBeInTheDocument();
      expect(act).toHaveBeenCalledOnce();
    } finally {
      clock.mockRestore();
    }
  });
  it("unlocks after a definite failure is resolved, without submitting the next letter", async () => {
    const failed = batch();
    failed.items[0].letterAppeals.status = "needs_review";
    const act = vi.fn().mockResolvedValue({ history: failed.items });
    const view = render(
      <PostalBatchRunner batch={batch()} busy={false} act={act} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Continue saved letters",
        }),
      ).toBeDisabled(),
    );
    view.rerender(<PostalBatchRunner batch={failed} busy={false} act={act} />);
    const resolved = structuredClone(failed);
    resolved.items[0].letterAppeals.status = "complete";
    resolved.items[0].letterAppeals.members[0].status = "verified";
    view.rerender(
      <PostalBatchRunner batch={resolved} busy={false} act={act} />,
    );
    expect(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    ).toBeEnabled();
    expect(act).toHaveBeenCalledOnce();
  });
  it.each(["pending", "uncertain", "cooldown", "failed-read"])(
    "reloads %s receipts read-only after a transport stop",
    async (scenario) => {
      const original = batch();
      const act = vi.fn().mockResolvedValue(null);
      const loaded = batch();
      loaded.items.forEach((item) => {
        item.status = "prepared";
      });
      if (scenario === "uncertain")
        loaded.items[0].letterAppeals.members[0].status = "uncertain";
      if (scenario === "cooldown")
        loaded.items[0].letterAppeals.verificationFailure = {
          checkedAt: new Date().toISOString(),
          retryAfterMs: 300000,
        };
      const reload = vi
        .fn()
        .mockResolvedValue(
          scenario === "failed-read" ? null : { history: loaded.items },
        );
      const view = render(
        <PostalBatchRunner
          batch={original}
          busy={false}
          act={act}
          onReload={reload}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: "Continue saved letters",
        }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", {
            name: "Continue saved letters",
          }),
        ).toBeDisabled(),
      );
      view.rerender(
        <PostalBatchRunner
          batch={structuredClone(original)}
          busy={false}
          act={act}
          onReload={reload}
        />,
      );
      expect(
        screen.getByRole("button", {
          name: "Continue saved letters",
        }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", { name: "Reload saved batch status" }),
      );
      await waitFor(() => expect(reload).toHaveBeenCalledOnce());
      if (scenario === "pending")
        await waitFor(() =>
          expect(
            screen.getByRole("button", {
              name: "Continue saved letters",
            }),
          ).toBeEnabled(),
        );
      else
        expect(
          screen.getByRole("button", {
            name: "Continue saved letters",
          }),
        ).toBeDisabled();
      expect(act).toHaveBeenCalledOnce();
    },
  );
  it("does not start a newly approved batch during a saved NXT cooldown", () => {
    const pending = batch();
    pending.items[0].letterAppeals.verificationFailure = {
      checkedAt: new Date().toISOString(),
      retryAfterMs: 300000,
    };
    const act = vi.fn();
    render(
      <PostalBatchRunner
        batch={pending}
        busy={false}
        act={act}
        autoStart
        onAutoStartConsumed={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    ).toBeDisabled();
    expect(act).not.toHaveBeenCalled();
  });
  it("unlocks continuation after automatic read-only confirmation, without starting any writes", async () => {
    const pending = batch();
    const unresolved = batch();
    unresolved.items[0].letterAppeals.status = "needs_review";
    unresolved.items[0].letterAppeals.members[0].status = "uncertain";
    const act = vi.fn().mockResolvedValue({ history: unresolved.items });
    const { rerender } = render(
      <PostalBatchRunner batch={pending} busy={false} act={act} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    );
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    rerender(<PostalBatchRunner batch={unresolved} busy={false} act={act} />);
    expect(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    ).toBeDisabled();
    const confirmed = structuredClone(unresolved);
    confirmed.items[0].letterAppeals.status = "complete";
    confirmed.items[0].letterAppeals.members[0].status = "verified";
    rerender(<PostalBatchRunner batch={confirmed} busy={false} act={act} />);
    expect(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    ).toBeEnabled();
    expect(act).toHaveBeenCalledTimes(1);
  });
  it("does not prepare or submit on mount and requires rendered document approval", async () => {
    const act = vi.fn().mockResolvedValue({});
    render(
      <PostalBatchApproval
        draft={draft([entry("10")])}
        revision={3}
        busy={false}
        act={act}
        onApproved={vi.fn()}
      />,
    );
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview document (optional)" }),
    );
    expect(
      screen.getByRole("button", { name: "Finish preview" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Approve letters and continue",
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Finish rendering test document" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish preview" }));
    await waitFor(() =>
      expect(act).toHaveBeenCalledWith({
        action: "review_postal_document",
        draftId: "draft",
        householdId: "10",
        documentHash: "hash-10",
        confirm: true,
      }),
    );
    expect(act).toHaveBeenCalledOnce();
  });
  it("requires all exact document hashes and explicit batch confirmation", async () => {
    const act = vi.fn().mockResolvedValue({ batchId: "saved" });
    const onApproved = vi.fn();
    const entries = [entry("10"), entry("20")].map((e) => ({
      ...e,
      reviewedHash: e.document.sha256,
    }));
    render(
      <PostalBatchApproval
        draft={draft(entries)}
        revision={3}
        busy={false}
        act={act}
        onApproved={onApproved}
      />,
    );
    const approve = screen.getByRole("button", {
      name: "Approve letters and continue",
    });
    expect(approve).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I approve these documents/ }),
    );
    fireEvent.click(approve);
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith("saved"));
    expect(act).toHaveBeenCalledExactlyOnceWith({
      action: "approve_postal_draft",
      draftId: "draft",
      confirm: true,
      approvePreparedDocuments: true,
    });
  });
  it("prepares sequential saved documents and stops on failure without approving", async () => {
    const act = vi
      .fn()
      .mockResolvedValueOnce({
        postalDraft: draft([entry("10"), entry("20", false)]),
      })
      .mockResolvedValueOnce(null);
    render(
      <PostalBatchApproval
        draft={draft([entry("10", false), entry("20", false)])}
        revision={3}
        busy={false}
        act={act}
        onApproved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare documents" }));
    await waitFor(() => expect(act).toHaveBeenCalledTimes(2));
    expect(act.mock.calls.map(([body]) => body.householdId)).toEqual([
      "10",
      "20",
    ]);
    expect(
      act.mock.calls.every(
        ([body]) => body.action === "prepare_postal_document",
      ),
    ).toBe(true);
  });
  it("never starts appeal updates automatically and stops at an uncertain response", async () => {
    const items = batch().items;
    items[0].letterAppeals = {
      status: "needs_review",
      members: [{ id: "10", status: "uncertain" }],
    };
    const act = vi.fn().mockResolvedValue({ history: items });
    render(<PostalBatchRunner batch={batch()} busy={false} act={act} />);
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    );
    await waitFor(() => expect(act).toHaveBeenCalledOnce());
    expect(act).toHaveBeenCalledWith({
      action: "continue_postal_batch",
      batchId: "batch",
      confirm: true,
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Continue saved letters",
        }),
      ).toBeDisabled(),
    );
  });
  it("processes one household at a time and stops after the completed batch", async () => {
    const partial = batch().items;
    partial[0].letterAppeals.status = "complete";
    const act = vi
      .fn()
      .mockResolvedValueOnce({ history: partial })
      .mockResolvedValueOnce({ history: batch("complete").items });
    render(<PostalBatchRunner batch={batch()} busy={false} act={act} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    );
    await waitFor(() => expect(act).toHaveBeenCalledTimes(2));
  });
  it("leaves saved uncertain batches paused after reopening", () => {
    const act = vi.fn();
    render(
      <PostalBatchRunner batch={batch("uncertain")} busy={false} act={act} />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Continue saved letters",
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Saved submissions are checked automatically/),
    ).toBeVisible();
    expect(act).not.toHaveBeenCalled();
  });
  it("approves prepared letters in one step without reopening previews", async () => {
    const act = vi.fn().mockResolvedValue({ batchId: "saved" });
    render(
      <PostalBatchApproval
        draft={draft([entry("10"), entry("20")])}
        revision={3}
        busy={false}
        act={act}
        onApproved={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I approve these documents/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Approve letters and continue" }),
    );
    await waitFor(() => expect(act).toHaveBeenCalledOnce());
    expect(act).toHaveBeenCalledWith({
      action: "approve_postal_draft",
      draftId: "draft",
      confirm: true,
      approvePreparedDocuments: true,
    });
    expect(
      screen.queryByRole("button", { name: "Finish rendering test document" }),
    ).toBeNull();
  });
  it("continues once from a fresh approval click, but never retries it on rerender", async () => {
    const act = vi.fn().mockResolvedValue({ history: batch("complete").items });
    const consumed = vi.fn();
    const view = render(
      <PostalBatchRunner
        batch={batch()}
        busy={true}
        act={act}
        autoStart
        onAutoStartConsumed={consumed}
      />,
    );
    expect(act).not.toHaveBeenCalled();
    view.rerender(
      <PostalBatchRunner
        batch={batch()}
        busy={false}
        act={act}
        autoStart
        onAutoStartConsumed={consumed}
      />,
    );
    await waitFor(() => expect(act).toHaveBeenCalledOnce());
    view.rerender(
      <PostalBatchRunner
        batch={batch()}
        busy={false}
        act={act}
        autoStart
        onAutoStartConsumed={consumed}
      />,
    );
    expect(consumed).toHaveBeenCalledOnce();
    expect(act).toHaveBeenCalledOnce();
  });
});
