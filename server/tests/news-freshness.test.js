import request from "supertest";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { sourceHealth } from "../src/news/coverage.js";
import { createDemoStore } from "../src/store.js";

describe("source freshness for students", () => {
  test("reports a delayed check, naming only the publisher, when a verified source keeps failing", () => {
    const now = Date.parse("2026-10-03T06:00:00Z");
    const result = sourceHealth([
      { publisher: "Federal Register", verified: true, enabled: true, consecutiveFailures: 2, lastCheckedAt: "2026-10-01T00:00:00Z", url: "https://secret.example/x" },
      { publisher: "Other", verified: true, enabled: true, consecutiveFailures: 0, lastCheckedAt: "2026-10-03T00:00:00Z" },
    ], now);
    expect(result.state).toBe("delayed");
    expect(result.delayedPublishers).toEqual(["Federal Register"]);
    expect(JSON.stringify(result)).not.toContain("secret.example");
  });

  test("reports current when every verified, enabled source checked successfully", () => {
    const now = Date.parse("2026-10-03T06:00:00Z");
    expect(sourceHealth([{ publisher: "A", verified: true, enabled: true, consecutiveFailures: 0, lastCheckedAt: "2026-10-03T00:00:00Z" }], now).state).toBe("current");
  });

  test("a source that stopped being checked reads as delayed, not current, once it is older than twice its cadence", () => {
    const checkedAt = "2026-10-01T00:00:00Z";
    const source = { publisher: "Silent", verified: true, enabled: true, consecutiveFailures: 0, lastCheckedAt: checkedAt, cadenceHours: 12 };
    expect(sourceHealth([source], Date.parse("2026-10-01T20:00:00Z")).state).toBe("current");
    const later = sourceHealth([source], Date.parse("2026-10-03T00:00:00Z"));
    expect(later.state).toBe("delayed");
    expect(later.delayedPublishers).toEqual(["Silent"]);
  });

  test("the staleness window follows each source's own cadence", () => {
    const weekly = { publisher: "Weekly", verified: true, enabled: true, consecutiveFailures: 0, lastCheckedAt: "2026-10-01T00:00:00Z", cadenceHours: 168 };
    expect(sourceHealth([weekly], Date.parse("2026-10-06T00:00:00Z")).state).toBe("current");
    expect(sourceHealth([weekly], Date.parse("2026-10-20T00:00:00Z")).state).toBe("delayed");
  });

  test("an unreadable last-check timestamp is treated as delayed rather than trusted", () => {
    const result = sourceHealth([{ publisher: "Odd", verified: true, enabled: true, consecutiveFailures: 0, lastCheckedAt: "not-a-date" }], Date.now());
    expect(result.state).toBe("delayed");
  });

  test("never says a source is current when it has not been checked yet", () => {
    expect(sourceHealth([{ publisher: "A", verified: true, enabled: true }]).state).toBe("not-checked");
  });

  test("ignores unverified or disabled sources entirely", () => {
    expect(sourceHealth([{ publisher: "Pending", verified: false, enabled: false, consecutiveFailures: 5 }]).state).toBe("not-checked");
  });

  test("the feed response carries the freshness summary to the student", async () => {
    const store = createDemoStore();
    await store.newsSources.upsert("uni-a", { publisher: "UNC ISSS", universityId: "uni-a", verified: true, enabled: true, consecutiveFailures: 1, lastCheckedAt: "2026-10-03T00:00:00Z" });
    const app = createApp({ store, auth: null, assistant: null });

    const response = await request(app).get("/api/news").set("x-demo-user", "student-a").expect(200);
    expect(response.body.data.sourceHealth.state).toBe("delayed");
    expect(response.body.data.sourceHealth.delayedPublishers).toEqual(["UNC ISSS"]);
  });
});
