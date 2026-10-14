// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), user: vi.fn(), connection: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: mocks.user }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: mocks.read, getBlackbaudConnection: mocks.connection,
  createBlackbaudQueryJob: vi.fn(), getBlackbaudQueryJob: vi.fn(), streamBlackbaudQueryResultWithMetadata: vi.fn() }));
import { campaignTransport } from "./campaignPriorityQuery";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({id:7,role:"admin",active:true});
  mocks.connection.mockResolvedValue({connected_at:"2026-10-07T00:00:00Z"});
});
describe("campaign split lookup transport", () => {
  it("reads the exact gift through the shared connection with no write or retry", async () => {
    mocks.read.mockResolvedValue({id:"11"});
    const transport = await campaignTransport("https://fictional.invalid");
    expect(await transport.gift("11")).toEqual({id:"11"});
    expect(mocks.read.mock.calls).toEqual([["/gift/v1/gifts/11", {
      userId:7,authUserId:7,origin:"https://fictional.invalid",maxRetries:0,timeoutMs:12000,method:"GET",
    }]]);
  });
  it("does not request a malformed gift ID", async () => {
    const transport = await campaignTransport("https://fictional.invalid");
    expect(() => transport.gift("../gifts")).toThrow(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("requires an active authorized reporting connection before reading gifts", async () => {
    mocks.user.mockResolvedValue({id:7,role:"mgo",active:true});
    await expect(campaignTransport("https://fictional.invalid")).rejects.toThrow(/authorized/);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(["installments", "pledgepayments"])("reads only the selected pledge's %s with no write or retry", async section => {
    const transport = await campaignTransport("https://fictional.invalid");
    await transport.pledge("11", section);
    expect(mocks.read.mock.calls).toEqual([[`/gft-gifts/v2/gifts/11/${section}`, {
      userId:7,authUserId:7,origin:"https://fictional.invalid",maxRetries:0,timeoutMs:12000,method:"GET",
    }]]);
  });
  it("rejects unapproved pledge endpoints and malformed IDs without a request", async () => {
    const transport = await campaignTransport("https://fictional.invalid");
    expect(() => transport.pledge("11", "writeoff")).toThrow();
    expect(() => transport.pledge("../11", "installments")).toThrow();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
