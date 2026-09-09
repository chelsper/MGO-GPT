import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ImportLocalDuplicateNotice from "./ImportLocalDuplicateNotice";
afterEach(cleanup);
const duplicate = { kind: "pending_row", rowId: "2712", runId: "88", rowNumber: 4, name: "Test Person", lookupId: "628866", reason: "matching NXT Lookup ID", sameRun: true };

describe("local import conflict guidance", () => {
  it("shows the blocking CSV row and a direct review link, not an NXT candidate", () => {
    render(<ImportLocalDuplicateNotice duplicate={duplicate} />);
    expect(screen.getByText(/Import #88 \/ CSV row 4/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review blocking import row" })).toHaveAttribute("href", "/constituency-import?queueRun=88&queueRow=2712");
    expect(screen.getByText(/keep one and skip the extra unsent row/)).toBeInTheDocument();
    expect(screen.queryByText("Use this match")).not.toBeInTheDocument();
    expect(screen.queryByText("Not a match")).not.toBeInTheDocument();
  });
  it("opens the known created system record, not the CSV Lookup ID", () => {
    render(<ImportLocalDuplicateNotice duplicate={{ ...duplicate, kind: "created", createdConstituentId: "777" }} />);
    const link = screen.getByRole("link", { name: "Open previously created NXT record" });
    expect(link.getAttribute("href")).toContain("777");
    expect(link.getAttribute("href")).not.toContain("628866");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(/keep one and skip/)).not.toBeInTheDocument();
  });
  it("does not invent links when only an orphaned creation audit remains", () => {
    render(<ImportLocalDuplicateNotice duplicate={{ ...duplicate, kind: "unconfirmed_creation", runId: null, rowNumber: null }} />);
    expect(screen.getByText(/may already have reached NXT/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
