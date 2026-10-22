import { describe, expect, it } from "vitest";
import {
  groupLettersBySociety,
  printReadyPdfFilename,
} from "./societyLetterDownloads";

describe("society download groups and filenames", () => {
  it("groups by society key, not donor name or lower-tier coverage, without changing saved records", () => {
    const items = [
      {
        id: "1",
        societyKey: "presidents",
        societyName: "President's Society",
        coveredKeys: ["presidents", "ood"],
      },
      { id: "2", societyKey: "ood", societyName: "Order of the Dolphin" },
      { id: "3", societyKey: "presidents", societyName: "President's Society" },
      { id: "4", societyKey: "different", societyName: "Order of the Dolphin" },
    ];
    const before = structuredClone(items);
    const groups = groupLettersBySociety(items);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["1", "3"],
      ["2"],
      ["4"],
    ]);
    expect(items).toEqual(before);
  });

  it("uses descriptive, bounded ASCII filenames and keeps mixed/legacy downloads compatible", () => {
    const items = [
      { societyKey: "presidents", societyName: "President's Society" },
    ];
    expect(printReadyPdfFilename(items, true)).toBe(
      "society-letters-presidents-society-selected-print-ready.pdf",
    );
    expect(printReadyPdfFilename(items)).toBe(
      "society-letters-presidents-society-print-ready.pdf",
    );
    expect(
      printReadyPdfFilename([
        ...items,
        { societyKey: "ood", societyName: "Order of the Dolphin" },
      ]),
    ).toBe("society-letters-print-ready.pdf");
    expect(printReadyPdfFilename([{}])).toBe("society-letters-print-ready.pdf");
    expect(printReadyPdfFilename([])).toBe("society-letters-print-ready.pdf");
    expect(groupLettersBySociety([])).toEqual([]);
    const unsafe = printReadyPdfFilename([
      { societyName: '../"\r\nName: bad/\\' + "x".repeat(200) },
    ]);
    expect(unsafe).toMatch(/^society-letters-[a-z0-9-]+-print-ready\.pdf$/);
    expect(unsafe.length).toBeLessThan(120);
  });
});
