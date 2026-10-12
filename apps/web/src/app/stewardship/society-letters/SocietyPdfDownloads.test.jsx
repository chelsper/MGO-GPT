import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { completedLetter } from "../../../../test/societyLetterDispatchFixture";
import SocietyPdfDownloads from "./SocietyPdfDownloads";

function letters() {
  return [
    completedLetter({ id: "pres-1", templateVersion: "old" }),
    completedLetter({
      id: "ood",
      societyKey: "ood",
      societyName: "Order of the Dolphin",
    }),
    completedLetter({ id: "pres-2", templateVersion: "new" }),
  ];
}

describe("society-specific PDF download choices", () => {
  it("offers one primary PDF per society with exact IDs, preserves mixed download, and never runs on load", () => {
    const items = letters();
    const before = structuredClone(items);
    const onDownload = vi.fn();
    render(<SocietyPdfDownloads items={items} onDownload={onDownload} />);
    expect(onDownload).not.toHaveBeenCalled();
    expect(screen.getByText("2 letters in one PDF")).toBeVisible();
    expect(screen.getByText("1 letter in one PDF")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Download President's Society print-ready PDF",
      }),
    );
    expect(onDownload).toHaveBeenLastCalledWith(["pres-1", "pres-2"]);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Download Order of the Dolphin print-ready PDF",
      }),
    );
    expect(onDownload).toHaveBeenLastCalledWith(["ood"]);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Download all these societies in one PDF",
      }),
    );
    expect(onDownload).toHaveBeenLastCalledWith(["pres-1", "ood", "pres-2"]);
    expect(items).toEqual(before);
    expect(
      screen.getByText(
        /approved letterhead, wording, and dates stay unchanged/,
      ),
    ).toBeVisible();
  });

  it("does not quietly leave out Word letters from a society's PDF; other PDF societies stay available", () => {
    const items = letters();
    items[0].postalDocument.format = "docx";
    render(<SocietyPdfDownloads items={items} onDownload={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /President's Society/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Order of the Dolphin/ }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /all these societies/ }),
    ).not.toBeInTheDocument();
  });

  it.each(["pending", "uncertain", "cancelled", "missing-document", "busy"])(
    "retains %s safety checks",
    (kind) => {
      const items = letters();
      if (kind === "pending") items[0].letterAppeals.status = "pending";
      if (kind === "uncertain")
        items[0].letterAppeals.members[0].status = "uncertain";
      if (kind === "cancelled") items[0].status = "cancelled";
      if (kind === "missing-document") delete items[0].postalDocument.id;
      const onDownload = vi.fn();
      render(
        <SocietyPdfDownloads
          items={items}
          disabled={kind === "busy"}
          onDownload={onDownload}
        />,
      );
      const presidents = screen.getByRole("button", {
        name: /President's Society/,
      });
      expect(presidents).toBeDisabled();
      fireEvent.click(presidents);
      expect(onDownload).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: /all these societies/ }),
      ).toBeDisabled();
    },
  );
});
