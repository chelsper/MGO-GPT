import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImportContactPreflight from "./ImportContactPreflight";
import { importContactPreflight } from "@/utils/importContactPreflight";
afterEach(cleanup);
const rows = [{ email: "avery@example.test", primary: "Yes" }];
const mappings = { email: "email", emailMakePrimary: "primary" };
const props = (defaults = {}) => ({ summary: importContactPreflight(rows, mappings, defaults), intent: "updates", defaults, onChoice: vi.fn(), onDefaultType: vi.fn() });
it("makes both inclusion and omission explicit and shows update-only scope", () => {
  const p = props(); render(<ImportContactPreflight {...p} />);
  expect(screen.getByText(/no new constituents will be created/)).toBeVisible();
  expect(screen.getAllByRole("radio").every((input) => !input.checked)).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Import email addresses" }));
  expect(p.onChoice).toHaveBeenCalledWith(p.summary.groups[0], "import");
  fireEvent.click(screen.getByRole("radio", { name: /matching only/ }));
  expect(p.onChoice).toHaveBeenCalledWith(p.summary.groups[0], "matching");
});
it("shows defaults and bounded review issues only for included contacts", () => {
  const p = props({ updateEmailFields: true }); render(<ImportContactPreflight {...p} />);
  expect(screen.getByText(/1 contact value across 1 row; 1 marked primary/)).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: /Default email type/ }), { target: { value: "Personal" } });
  expect(p.onDefaultType).toHaveBeenCalledWith("defaultEmailType", "Personal");
  expect(screen.getByText("1 row needs email review")).toBeInTheDocument();
});
it("does not permit changes while the import is busy", () => {
  render(<ImportContactPreflight {...props({ updateEmailFields: true })} disabled />);
  for (const element of [...screen.getAllByRole("radio"), ...screen.getAllByRole("textbox")]) expect(element).toBeDisabled();
});
it("offers file types explicitly without treating them as verified NXT choices", () => {
  const p = props({ updateEmailFields: true });
  p.summary = importContactPreflight([{ email: "one@example.test", type: "Personal" }, { email: "two@example.test" }], { email: "email", emailType: "type" }, { updateEmailFields: true });
  const { rerender } = render(<ImportContactPreflight {...p} />);
  expect(screen.getByText(/not verified with NXT/)).toBeVisible();
  expect(screen.getByRole("textbox", { name: /Default email type/ })).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Use Personal" }));
  expect(p.onDefaultType).toHaveBeenCalledWith("defaultEmailType", "Personal");
  rerender(<ImportContactPreflight {...p} disabled />);
  expect(screen.getByRole("button", { name: "Use Personal" })).toBeDisabled();
});
