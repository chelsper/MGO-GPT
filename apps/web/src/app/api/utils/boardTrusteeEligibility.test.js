// @vitest-environment node
import { expect, it } from "vitest";
import { boardDateRange, evaluateBoardService } from "./boardTrusteeEligibility";
const term = (start, end, code = "Trustee") => ({ start, end, code });
const status = (start, end, year = 2027) => evaluateBoardService([term(start, end)], year).status;

it("includes blank Trustee end dates without a six-month wait, ignoring Former code dates", () => {
  expect(status("5/1/2026", "")).toBe("included");
  expect(status("", "")).toBe("included");
  expect(status("10/2026", "")).toBe("included");
  expect(evaluateBoardService([term("2020", ""), term("2026", "", "Trustee-Former")], 2027).status).toBe("included");
  expect(evaluateBoardService([term("2000", "", "Trustee-Former")], 2027).status).toBe("excluded");
  expect(evaluateBoardService([term("2000", "2020"), term("2020", "", "Trustee-Former")], 2027).status).toBe("excluded");
});
it("includes exactly six calendar months, not six months plus a day", () => {
  expect(status("2020", "12/31/2026")).toBe("included");
  expect(status("2020", "12/30/2026")).toBe("excluded");
  expect(status("7/2/2026", "12/31/2026")).toBe("excluded");
  expect(status("7/2/2026", "1/1/2027")).toBe("included");
  expect(status("10/1/2026", "3/31/2027")).toBe("included");
  expect(status("1/1/2024", "6/30/2024", 2024)).toBe("included");
});
it("uses the selected fiscal year, not today's date, and excludes service outside it", () => {
  expect(status("2010", "5/1/2026", 2026)).toBe("included");
  expect(status("2010", "5/1/2026", 2027)).toBe("excluded");
  expect(status("7/1/2027", "1/1/2028", 2027)).toBe("excluded");
  expect(status("2020", "7/1/2027", 2027)).toBe("included");
});
it.each([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027])("excludes open terms beginning after FY%s, including the July 1 boundary", year => {
  expect(status(`7/1/${year}`, "", year)).toBe("excluded");
  expect(status(`6/30/${year}`, "", year)).toBe("included");
  expect(status(`7/${year}`, "", year)).toBe("excluded");
  expect(status(String(year + 1), "", year)).toBe("excluded");
  expect(status(`6/${year}`, "", year)).toBe("included");
  expect(status(String(year), "", year)).toBe("review");
});
it("does not let a future open term hide past service or uncertain start dates", () => {
  expect(status("not a date", "", 2017)).toBe("review");
  expect(evaluateBoardService([term("7/1/2025", ""), term("2010", "2014")], 2017).status).toBe("excluded");
  expect(evaluateBoardService([term("7/1/2025", ""), term("2010", "1/31/2017")], 2017).status).toBe("included");
  expect(evaluateBoardService([term("7/1/2025", ""), term("2010", "12/2016")], 2017).status).toBe("review");
  expect(evaluateBoardService([term("7/1/2025", ""), term("2010", "", "Trustee-Former")], 2017).status).toBe("excluded");
});
it("resolves fuzzy dates only when every possible date leads to the same decision", () => {
  expect(status("", "2008")).toBe("excluded");
  expect(status("", "5/2020")).toBe("excluded");
  expect(status("2000", "1/2027")).toBe("included");
  expect(status("2000", "11/2026")).toBe("excluded");
  expect(status("2000", "12/2026")).toBe("review");
  expect(status("7/2026", "12/31/2026")).toBe("review");
  expect(status("", "1/31/2027")).toBe("review");
  expect(status("", "11/30/2026")).toBe("excluded");
});
it("does not let invalid dates roll over into another month or reverse service", () => {
  for (const end of ["2/30/2027", "2/29/2027", "2027-13-01", "00/2027", "tomorrow"])
    expect(status("2020", end)).toBe("review");
  expect(status("2/1/2027", "1/1/2027")).toBe("review");
  expect(boardDateRange("2024-02-29")).toEqual({ min: Date.UTC(2024, 1, 29), max: Date.UTC(2024, 1, 29) });
  expect(boardDateRange("2/2024")).toEqual({ min: Date.UTC(2024, 1, 1), max: Date.UTC(2024, 1, 29) });
});
it("merges consecutive terms without inflating overlapping or duplicate service", () => {
  expect(evaluateBoardService([term("7/1/2026", "9/30/2026"), term("10/1/2026", "12/31/2026")], 2027).status).toBe("included");
  expect(evaluateBoardService([term("7/1/2026", "9/30/2026"), term("7/1/2026", "9/30/2026")], 2027).status).toBe("excluded");
  expect(evaluateBoardService([term("7/1/2026", "10/31/2026"), term("9/1/2026", "11/30/2026")], 2027).status).toBe("excluded");
  expect(evaluateBoardService([term("7/1/2026", "10/31/2026"), term("2/1/2027", "6/30/2027")], 2027).status).toBe("review");
});
it("flags conflicting current-year end dates, but allows a separate qualifying service term", () => {
  expect(evaluateBoardService([term("2020", "11/30/2026"), term("2020", "1/31/2027")], 2027).status).toBe("review");
  expect(evaluateBoardService([term("2000", "2008"), term("2020", "1/31/2027")], 2027).status).toBe("included");
});
