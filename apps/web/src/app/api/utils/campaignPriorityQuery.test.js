// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import { inspectCampaignQuery, readCampaignQuery } from "./campaignPriorityQuery";

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
});
