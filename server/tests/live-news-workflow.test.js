import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("live news workflow refreshes only public feed artifacts on a four-hour schedule", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/refresh-live-news.yml", import.meta.url), "utf8");
  expect(workflow).toMatch(/cron:\s*"17 \*\/4 \* \* \*"/u);
  expect(workflow).toMatch(/workflow_dispatch:/u);
  expect(workflow).toMatch(/npm run news:live/u);
  expect(workflow).toMatch(/client\/public\/data\/live-news\.json/u);
  expect(workflow).toMatch(/server\/data\/live-news-run\.json/u);
  expect(workflow).toMatch(/server\/data\/live-news-candidates\.json/u);
  expect(workflow).toMatch(/issues:\s*write/u);
  expect(workflow).toMatch(/24 \* 60 \* 60 \* 1000/u);
  expect(workflow).toMatch(/globeready-news-source/u);
  expect(workflow).toMatch(/state_reason: 'completed'/u);
  expect(workflow).not.toMatch(/firebase|deploy|service.account|secret/iu);
});
