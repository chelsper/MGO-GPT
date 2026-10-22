// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createResultCsvVisitor,
  visitResultCsv,
} from "./dashboardQueryResults";
import { QUERY_RESULTS_LIMITS } from "./dashboardConfiguration";

function parse(chunks, maxRows) {
  const rows = [];
  const visitor = createResultCsvVisitor({
    maxRows,
    onRow: (row) => rows.push(row),
  });
  chunks.forEach((chunk) => visitor.write(chunk));
  return { ...visitor.finish(), rows };
}
describe("incremental CSV state machine", () => {
  it.each([
    'ID,Name\r\n1,"Jo ""Example"", Esq."\r\n2,"Line 1\r\nLine 2"\r\n',
    '\uFEFFID,Name\n1,""\n2,\n',
    "ID\n\n0\n",
    "ID,Name",
    "ID,Name\r\n",
    "ID,Name\n0,last",
  ])("matches whole-file parsing at every character split: %s", (content) => {
    const rows = [];
    const result = visitResultCsv(content, { onRow: (row) => rows.push(row) });
    for (let split = 0; split <= content.length; split += 1) {
      expect(
        parse([content.slice(0, split), "", content.slice(split)]),
      ).toEqual({ ...result, rows });
    }
    expect(parse([...content])).toEqual({ ...result, rows });
  });
  it("emits complete rows before EOF but not an unfinished final row", () => {
    const rows = [];
    const visitor = createResultCsvVisitor({ onRow: (row) => rows.push(row) });
    visitor.write("ID\r");
    visitor.write("\n1\r");
    expect(rows).toEqual([["1"]]);
    visitor.write("\n2");
    expect(rows).toHaveLength(1);
    expect(visitor.finish().rowCount).toBe(2);
    expect(rows).toEqual([["1"], ["2"]]);
    expect(() => visitor.write("3")).toThrow();
    expect(() => visitor.finish()).toThrow();
  });
  it.each([
    'ID,Name\n1,"unfinished',
    'ID,Name\n1,"closed" ',
    'ID\nun"escaped',
    "ID\n1\u0000",
    "ID,ID\n1,1",
    "ID,Name\n1",
    "ID\n1,2",
    "",
    "  ",
  ])("rejects malformed content in one-character chunks: %s", (content) => {
    expect(() => parse([...content])).toThrow();
  });
  it("enforces cell, column, header and row limits across chunks", () => {
    expect(() =>
      parse(["ID\n", "x".repeat(QUERY_RESULTS_LIMITS.cellCharacters), "x"]),
    ).toThrow(/cells/);
    expect(() =>
      parse([
        Array.from(
          { length: QUERY_RESULTS_LIMITS.columns },
          (_, i) => `H${i}`,
        ).join(","),
        ",extra",
      ]),
    ).toThrow(/columns/);
    expect(() => parse(["x".repeat(200), "x"])).toThrow(/headers/);
    expect(() => parse(["ID\n1\n", "2\n"], 1)).toThrow(/rows/);
  });
});
