import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImportCustomFieldOptions from "./ImportCustomFieldOptions";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("custom field category selection", () => {
  it("loads only on request, keeps a saved choice, and does not submit an import", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [{ name: "Interest", dataType: "Text" }] }) });
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    render(<ImportCustomFieldOptions category="Saved choice" onChange={onChange} />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveValue("Saved choice");
    fireEvent.click(screen.getByRole("button", { name: "Load NXT categories" }));
    await screen.findByRole("option", { name: "Interest (Text)" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Interest" } });
    expect(onChange).toHaveBeenCalledWith("Interest");
    expect(fetcher.mock.calls).toEqual([["/api/constituency-import/custom-field-categories"]]);
  });
  it("explains a failed metadata read without exposing provider details or losing selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Private provider diagnostics")));
    render(<ImportCustomFieldOptions category="Interest" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load NXT categories" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No import was submitted");
    expect(screen.queryByText(/Private provider/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("Interest");
  });
  it("prevents changing categories or reloading while the import is busy", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ImportCustomFieldOptions category="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button")).toBeDisabled();
    fireEvent.click(screen.getByRole("button"));
    expect(fetch).not.toHaveBeenCalled();
  });
});
