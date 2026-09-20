import { expect, it } from "vitest";
import {
  LEGACY_QUERY_EXPIRY_MESSAGE,
  listQueryRecovery,
  QUERY_JOB_MAX_AGE_MS,
} from "./listQueryRecovery";

const now = Date.parse("2026-09-20T00:19:00Z");
const job = {
  status: "paused",
  stage: "query",
  queryStartedAt: new Date(now - QUERY_JOB_MAX_AGE_MS - 1).toISOString(),
};
const retryAt = new Date(now + 60000).toISOString();

it("recognizes an expired saved attempt without waiting for another failed provider call", () => {
  expect(listQueryRecovery(job, now)).toMatchObject({
    restartRequired: true,
    retryAt: null,
  });
  expect(listQueryRecovery(job, now).message).toMatch(/not running/);
  expect(job.status).toBe("paused");
});
it("removes only a known local expiry cooldown, never a provider cooldown", () => {
  expect(
    listQueryRecovery(
      { ...job, message: LEGACY_QUERY_EXPIRY_MESSAGE, retryAt },
      now,
    ).retryAt,
  ).toBeNull();
  expect(
    listQueryRecovery(
      { ...job, failureCode: "LIST_QUERY_EXPIRED", retryAt },
      now,
    ).retryAt,
  ).toBeNull();
  expect(
    listQueryRecovery({ ...job, message: "NXT throttling", retryAt }, now)
      .retryAt,
  ).toBe(retryAt);
  expect(
    listQueryRecovery(
      { ...job, failureCode: "LIST_QUERY_FAILED", retryAt },
      now,
    ).retryAt,
  ).toBe(retryAt);
});
it("does not discard valid output or an in-progress fundraiser checkpoint because query time is old", () => {
  for (const stage of ["members", "mapping", "fundraisers", "complete"]) {
    expect(listQueryRecovery({ ...job, stage }, now).restartRequired).toBe(
      false,
    );
  }
  expect(
    listQueryRecovery({ ...job, status: "complete" }, now).restartRequired,
  ).toBe(false);
  expect(
    listQueryRecovery(
      { ...job, queryStartedAt: new Date(now).toISOString() },
      now,
    ).restartRequired,
  ).toBe(false);
  expect(
    listQueryRecovery({ ...job, queryStartedAt: undefined }, now)
      .restartRequired,
  ).toBe(false);
  expect(listQueryRecovery(null, now).restartRequired).toBe(false);
});
it("keeps terminal failed attempts stopped until an explicit restart", () => {
  expect(
    listQueryRecovery(
      {
        ...job,
        status: "needs_restart",
        queryStartedAt: new Date(now).toISOString(),
        message: "NXT declined the query.",
      },
      now,
    ),
  ).toMatchObject({
    restartRequired: true,
    message: "NXT declined the query.",
    retryAt: null,
  });
});
