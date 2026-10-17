import { describe, expect, test } from "vitest";
import { overdueSourceFailures, sourceIssueMarker } from "../src/news/source-issues.js";

describe("persistent news source failures", () => {
  test("opens only for enabled failures older than 24 hours", () => {
    const reports = [
      { sourceId: "old", state: "failed", failedSince: "2026-10-15T11:59:59Z" },
      { sourceId: "new", state: "failed", failedSince: "2026-10-16T13:00:00Z" },
      { sourceId: "off", state: "disabled", failedSince: "2026-10-01T00:00:00Z" },
      { sourceId: "ok", state: "current", failedSince: "2026-10-01T00:00:00Z" },
    ];
    expect(overdueSourceFailures(reports, new Date("2026-10-16T12:00:00Z")).map((item) => item.sourceId)).toEqual(["old"]);
  });

  test("uses a stable hidden marker for issue deduplication", () => {
    expect(sourceIssueMarker("ice-sevp")).toBe("<!-- globeready-news-source:ice-sevp -->");
  });
});
