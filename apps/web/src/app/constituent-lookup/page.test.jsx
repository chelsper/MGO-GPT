import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/utils/useUser", () => ({ default: mocks.user }));
vi.mock("react-router", () => ({ useLocation: () => ({ search: "" }) }));
vi.mock("@/components/RelationshipOriginator", () => ({ default: () => <div>Relationship originator</div> }));
import Page from "./page";
const user = { id: 7, role: "mgo", name: "Signed-in Fundraiser" };
let role;
beforeEach(() => {
  role = "mgo";
  mocks.user.mockReturnValue({ data: { email: "test@example.test" }, loading: false });
  vi.stubGlobal("fetch", vi.fn(async url => ({ ok: true, json: async () => url.includes("/profile")
    ? { user: { ...user, role }, actingAsUser: { id: 99, name: "Viewed Fundraiser" } }
    : { results: [{ name: "Example Donor", blackbaudConstituentId: "123", lookupId: "LOOKUP-123" }] } })));
});
afterEach(() => vi.unstubAllGlobals());
async function search() {
  render(<Page />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Example" } });
  await screen.findByText("Example Donor");
}
it("offers an Advancement Services request alongside existing controls using the signed-in identity", async () => {
  await search();
  fireEvent.click(screen.getByRole("button", { name: "Request portfolio assignment" }));
  expect(screen.getByText(/Signed-in Fundraiser.*Lead Solicitor/)).toBeVisible();
  expect(screen.queryByText(/Viewed Fundraiser.*Lead Solicitor/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open NXT profile" })).toBeVisible();
  expect(screen.getByText("Relationship originator")).toBeVisible();
});
it("does not expose a personal portfolio request to a services-only account", async () => {
  role = "advancement_services";
  await search();
  expect(screen.queryByRole("button", { name: "Request portfolio assignment" })).not.toBeInTheDocument();
});
