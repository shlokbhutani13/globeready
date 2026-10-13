import request from "supertest";
import { expect, test, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

test("explains only published news and cites its official source", async () => {
  const store = createDemoStore();
  const item = (await store.news.upsert("uscis:1", { title: "OPT filing update", publisher: "USCIS", canonicalUrl: "https://www.uscis.gov/news/opt", sourceVerified: true, editorialState: "published-source-only", sourceExcerpt: "USCIS changed a filing date.", contentHash: "one", publishedAt: "2026-10-01" })).item;
  const assistant = { mode: "live", answer: vi.fn().mockResolvedValue({ answer: "This update changes the filing timeline.", confidence: "medium" }) };
  const app = createApp({ store, auth: null, assistant });
  const response = await request(app).post(`/api/news/${item.id}/explain`).set("x-demo-user", "student").send({ question: "How does this affect me?" }).expect(200);
  expect(response.body.data.answer).toMatch(/filing timeline/i);
  expect(response.body.data.sources).toEqual([{ title: "USCIS", url: "https://www.uscis.gov/news/opt" }]);
  expect(assistant.answer).toHaveBeenCalledWith(expect.objectContaining({ question: expect.stringContaining("OPT filing update") }));
});
