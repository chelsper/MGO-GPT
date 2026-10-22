// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import { inspectCampaignQuery, readCampaignQuery, campaignHash, campaignBaseHash, campaignSourceKey } from "./campaignPriorityQuery";
import { validateCampaignSource } from "@/utils/campaignPriorities";

const config = { queryId: "27460", queryName: "Campaign", mode: "split", columns: { giftId: "Gift", splitId: "Split", fundId: "Fund System Record ID", fundName: "Fund", amount: "Amount" } };
const metadata = { id: "27460", name: "Campaign", type: "Gift", select_fields: Object.values(config.columns).map(name => ({ query_field: { selected_field_name: name } })) };
function streamCsv(csv) {
  return async (_url, options, create) => {
    expect(options.redirect).toBe("error"); expect(options.maxBytes).toBe(128*1024*1024);
    const bytes = new TextEncoder().encode(csv), consumer = create({ contentType: "text/csv; charset=utf-8" });
    for (let i = 0; i < bytes.length; i += 65536) await consumer.write(bytes.subarray(i, i+65536));
    return { result: await consumer.finish() };
  };
}
const url = "https://nsa-pusa01.app.blackbaud.net/fixture.csv";
describe("bounded campaign query import", () => {
  it("verifies identity, Gift type, prompt-free execution and named mappings", () => {
    expect(inspectCampaignQuery(metadata, "27460", config).fields).toHaveLength(5);
    for (const change of [{ id: "1" }, { type: "Constituent" }, { has_ask_fields: true }, { name: "Changed" }, { can_execute: false }, { select_fields: [...metadata.select_fields, metadata.select_fields[0]] }])
      expect(() => inspectCampaignQuery({ ...metadata, ...change }, "27460", config)).toThrow();
  });
  it("streams a campaign-sized 87,465-row result in sequential batches of at most 500", async () => {
    const rows = 87465, csv = "Gift,Split,Fund System Record ID,Fund,Amount\n" + Array.from({ length: rows }, (_, i) => `${i+1},1,4,Scholarships,1.01`).join("\n");
    let saved = 0, inFlight = 0, maximum = 0;
    const result = await readCampaignQuery(url, {}, config, rows, async batch => {
      expect(++inFlight).toBe(1); await Promise.resolve(); maximum = Math.max(maximum, batch.length); saved += batch.length;
      expect(batch[0].baseHash).toMatch(/^[a-f0-9]{64}$/); --inFlight;
    }, streamCsv(csv));
    expect(result.rawRows).toBe(rows); expect(saved).toBe(rows); expect(maximum).toBe(500);
  });
  it.each([null, -1, 300001, 1.2])("rejects an untrustworthy expected count %s", async count => {
    const stream = vi.fn(); await expect(readCampaignQuery(url, {}, config, count, vi.fn(), stream)).rejects.toThrow(); expect(stream).not.toHaveBeenCalled();
  });
  it("does not flush a short final batch until the completed count matches", async () => {
    const save = vi.fn();
    await expect(readCampaignQuery(url, {}, config, 2, save, streamCsv("Gift,Split,Fund System Record ID,Fund,Amount\n1,2,3,Fund,25"))).rejects.toThrow(/count/);
    expect(save).not.toHaveBeenCalled();
  });
  it("rejects invalid mappings and amounts, and unsafe download hosts", async () => {
    const save = vi.fn();
    await expect(readCampaignQuery(url, {}, config, 1, save, streamCsv("Gift,Wrong,Fund System Record ID,Fund,Amount\n1,2,3,Fund,25"))).rejects.toThrow(/column/);
    await expect(readCampaignQuery(url, {}, config, 1, save, streamCsv("Gift,Split,Fund System Record ID,Fund,Amount\n1,2,3,Fund,"))).rejects.toThrow(/Blank/);
    await expect(readCampaignQuery("https://attacker.invalid/file", {}, config, 1, save, vi.fn())).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
  it("accepts a confirmed empty query without inventing gifts", async () => {
    expect(await readCampaignQuery(url, {}, config, 0, vi.fn(), streamCsv("Gift,Split,Fund System Record ID,Fund,Amount\n"))).toEqual({ rawRows: 0 });
  });
  it("preserves the legacy source key when only financial mappings are added or changed", () => {
    const before = validateCampaignSource({ ...config, confirmed: true });
    delete before.columns.writeOff; delete before.columns.pledgeBalance;
    before.connectionKey = "connection";
    const enriched = { ...before, columns: { ...before.columns, writeOff: "Write-off Amount", pledgeBalance: "Pledge Balance" } };
    expect(campaignSourceKey(enriched)).toBe(campaignHash(before));
    expect(campaignSourceKey({ ...enriched, financialSource:"nxt" })).toBe(campaignHash(before));
    expect(campaignSourceKey({ ...enriched, financialSource:"csv",writeOffLedger:{revision:"new-csv"} })).toBe(campaignHash(before));
    expect(campaignSourceKey({ ...enriched, investment:{queryId:"31071",queryName:"Investment",giftIdColumn:"System Record ID"} })).toBe(campaignHash(before));
    expect(campaignSourceKey({ ...enriched, columns: { ...enriched.columns, writeOff: "Other total" } })).toBe(campaignHash(before));
    expect(campaignSourceKey({ ...enriched, queryId: "999" })).not.toBe(campaignHash(before));
    expect(campaignSourceKey({ ...enriched, columns: { ...enriched.columns, amount: "Different amount" } })).not.toBe(campaignHash(before));
  });
  it("invalidates overrides for write-off changes, but not balance changes or newly mapped zero write-offs", () => {
    const row = { giftId: "1", splitId: null, fundId: "2", amountCents: 10000 };
    const legacy = campaignHash(["1", null, "2", 10000]);
    expect(campaignBaseHash({ ...row, writeOffCents: 0, pledgeBalanceCents: 5000 })).toBe(legacy);
    expect(campaignBaseHash({ ...row, writeOffCents: 1000 })).not.toBe(legacy);
    expect(campaignBaseHash({ ...row, writeOffCents: 1000, pledgeBalanceCents: 2000 }))
      .toBe(campaignBaseHash({ ...row, writeOffCents: 1000, pledgeBalanceCents: 4000 }));
  });
  it("streams blank deductions as zero and preserves positive financial values in hashes", async () => {
    const financial = { ...config, mode: "gift", columns: { ...config.columns, splitId: "", writeOff: "Write-off", pledgeBalance: "Balance" } };
    const batches = [];
    await readCampaignQuery(url, {}, financial, 2, async rows => batches.push(...rows), streamCsv("Gift,Fund System Record ID,Fund,Amount,Write-off,Balance\n1,3,Fund,10000,1000,2500\n2,3,Fund,100,,"));
    expect(batches).toMatchObject([{ amountCents: 1000000, writeOffCents: 100000, pledgeBalanceCents: 250000 }, { writeOffCents: 0, pledgeBalanceCents: 0 }]);
  });
});
