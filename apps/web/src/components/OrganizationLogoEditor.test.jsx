import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OrganizationLogoEditor from "./OrganizationLogoEditor";
import OrganizationLogo from "./OrganizationLogo";
import { prepareOrganizationLogo } from "@/utils/organizationLogo";
vi.mock("@/utils/organizationLogo", () => ({ prepareOrganizationLogo: vi.fn() }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

it("previews a local selection and restores initials without a network save", async () => {
  const onChange = vi.fn(); const onBusyChange = vi.fn();
  prepareOrganizationLogo.mockResolvedValue("data:image/png;base64,preview");
  const { rerender } = render(<OrganizationLogoEditor value={null} shortName="EC" onChange={onChange} onBusyChange={onBusyChange} />);
  expect(screen.getByLabelText("Initials preview")).toHaveTextContent("EC");
  fireEvent.change(screen.getByLabelText("Choose logo"), { target: { files: [new File(["test"], "logo.png", { type: "image/png" })] } });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith("data:image/png;base64,preview"));
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  rerender(<OrganizationLogoEditor value="data:image/png;base64,preview" shortName="EC" onChange={onChange} onBusyChange={onBusyChange} />);
  expect(screen.getByAltText("Organization logo preview")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Restore initials" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

it("retains the previous draft on invalid files and disables input while saving", async () => {
  const onChange = vi.fn();
  prepareOrganizationLogo.mockRejectedValue(new Error("Choose a PNG, JPEG, or WebP image."));
  const { rerender } = render(<OrganizationLogoEditor value="data:image/png;base64,old" shortName="EC" onChange={onChange} onBusyChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Choose logo"), { target: { files: [new File(["x"], "bad.svg")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose a PNG");
  expect(onChange).not.toHaveBeenCalled();
  rerender(<OrganizationLogoEditor value="data:image/png;base64,old" shortName="EC" disabled onChange={onChange} onBusyChange={vi.fn()} />);
  expect(screen.getByLabelText("Choose logo")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Restore initials" })).toBeDisabled();
});

it("falls back to initials if the saved image cannot render and accepts a replacement", () => {
  const { container, rerender } = render(<OrganizationLogo logo="data:image/png;base64,old" shortName="EC" />);
  fireEvent.error(container.querySelector("img"));
  expect(screen.getByText("EC")).toBeInTheDocument();
  rerender(<OrganizationLogo logo="data:image/png;base64,new" shortName="EC" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,new");
});
