import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SetupReturnLink from "./SetupReturnLink";

it("links explicitly to Setup Hub without fetching, saving, or depending on browser history", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    render(<SetupReturnLink className="mb-4" />);
    const link = screen.getByRole("link", { name: "Back to Setup Hub" });
    expect(link).toHaveAttribute("href", "/setup");
    expect(link).toHaveClass("min-h-11", "mb-4");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});

it("offers Home instead when setup access is unavailable", () => {
  render(<SetupReturnLink canManageWorkspace={false} />);
  expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  expect(screen.queryByRole("link", { name: "Back to Setup Hub" })).not.toBeInTheDocument();
});
