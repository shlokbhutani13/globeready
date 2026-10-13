import { expect, test, vi } from "vitest";
import { createDisabledEmailDelivery } from "../src/email/delivery.js";
import { createDigestService } from "../src/news/digest-service.js";
import { createDemoStore } from "../src/store.js";

function item(id, overrides = {}) {
  return { id, title: id, publisher: "USCIS", canonicalUrl: `https://www.uscis.gov/${id}`,
    legalState: "final", urgency: "normal", topics: ["general"], universityIds: [], ...overrides };
}

test("creates one in-app digest per stable period and leaves email disabled", async () => {
  const store = createDemoStore();
  store.news.listPublished = vi.fn(async () => [
    item("urgent", { urgency: "urgent" }),
    item("campus", { universityIds: ["unc"] }),
  ]);
  await store.newsPreferences.set("student", { digestFrequency: "weekly", universityIds: ["unc"], emailRemindersEnabled: true });
  const service = createDigestService({ store, delivery: createDisabledEmailDelivery(), clock: () => new Date("2026-10-13T12:00:00Z") });
  const period = { periodStart: "2026-10-06T00:00:00.000Z", periodEnd: "2026-10-13T00:00:00.000Z" };
  const first = await service.generateForUser("student", period);
  const replay = await service.generateForUser("student", period);
  expect(first.id).toBe(replay.id);
  expect(first.delivery).toMatchObject({ status: "disabled" });
  expect(first.sections.map(({ title }) => title)).toContain("Urgent updates");
  expect(first.sections.map(({ title }) => title)).toContain("Your university");
  expect(await store.newsDigests.list("student")).toHaveLength(1);
});

test("honors an off preference without creating a digest", async () => {
  const store = createDemoStore();
  await store.newsPreferences.set("student", { digestFrequency: "off" });
  const service = createDigestService({ store, delivery: createDisabledEmailDelivery() });
  await expect(service.generateForUser("student", { periodStart: "2026-10-01", periodEnd: "2026-10-02" }))
    .resolves.toEqual({ status: "off" });
  expect(await store.newsDigests.list("student")).toHaveLength(0);
});
