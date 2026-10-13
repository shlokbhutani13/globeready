import { describe, expect, test } from "vitest";

import {
  adminCoverageLedger,
  buildCoverageLedger,
  publicCoverageLedger,
} from "../src/news/coverage-ledger.js";

const now = new Date("2026-10-13T12:00:00.000Z");

function source(id, input = {}) {
  return {
    id,
    publisher: `Publisher ${id}`,
    authority: "federal",
    jurisdiction: "US",
    topics: ["status"],
    verified: true,
    enabled: true,
    cadenceHours: 12,
    ...input,
  };
}

describe("coverage ledger", () => {
  test("classifies active, pending, disabled, delayed, failing, and never-successful sources", () => {
    const sources = [
      source("active"),
      source("pending", { verified: false, enabled: false, pendingReason: "Parser contract pending." }),
      source("disabled", { enabled: false, pendingReason: "Operator disabled." }),
      source("delayed"),
      source("failing"),
      source("never"),
    ];
    const runs = [
      { id: "run-active", sourceId: "active", status: "success", endedAt: "2026-10-13T06:00:00.000Z" },
      { id: "run-delayed", sourceId: "delayed", status: "success", endedAt: "2026-10-11T00:00:00.000Z" },
      { id: "run-failing-ok", sourceId: "failing", status: "success", endedAt: "2026-10-13T01:00:00.000Z" },
      { id: "run-failing", sourceId: "failing", status: "failed", endedAt: "2026-10-13T11:00:00.000Z", errorCode: "FETCH" },
      { id: "run-disabled", sourceId: "disabled", status: "success", endedAt: "2026-10-13T10:00:00.000Z" },
    ];

    const ledger = buildCoverageLedger({ sources, runs, now });

    expect(Object.fromEntries(ledger.entries.map((entry) => [entry.id, entry.status]))).toEqual({
      active: "active",
      delayed: "delayed",
      disabled: "disabled",
      failing: "failing",
      never: "not-checked",
      pending: "pending",
    });
    expect(ledger.summary).toEqual({
      total: 6,
      active: 1,
      pending: 1,
      disabled: 1,
      delayed: 1,
      failing: 1,
      notChecked: 1,
    });
    expect(ledger.entries.find(({ id }) => id === "failing")).toMatchObject({
      lastAttemptAt: "2026-10-13T11:00:00.000Z",
      lastSuccessAt: "2026-10-13T01:00:00.000Z",
      consecutiveFailures: 1,
    });
  });

  test("uses explicit public and administrator projections", () => {
    const ledger = buildCoverageLedger({
      now,
      sources: [source("university", {
        authority: "university",
        universityId: "example-u",
        selector: ".private-selector",
        secret: "hidden",
        reviewerUid: "admin-secret",
        privateNotes: "not public",
      })],
      runs: [{
        id: "run-1", sourceId: "university", status: "success", endedAt: "2026-10-13T10:00:00.000Z",
        responseValidators: { etag: "private" }, errorCode: null,
      }],
    });

    const publicResult = publicCoverageLedger(ledger);
    expect(publicResult.entries).toEqual([{
      id: "university",
      publisher: "Publisher university",
      authority: "university",
      jurisdiction: "US",
      topics: ["status"],
      universityId: "example-u",
      status: "active",
      cadenceHours: 12,
      lastSuccessAt: "2026-10-13T10:00:00.000Z",
      safeReason: null,
    }]);
    expect(JSON.stringify(publicResult)).not.toMatch(/selector|secret|reviewer|privateNotes|etag/i);

    const adminResult = adminCoverageLedger(ledger);
    expect(adminResult.entries[0]).toMatchObject({
      id: "university",
      lastAttemptAt: "2026-10-13T10:00:00.000Z",
      consecutiveFailures: 0,
      latestRunStatus: "success",
    });
    expect(JSON.stringify(adminResult)).not.toMatch(/private-selector|admin-secret|not public|etag/i);
  });
});
