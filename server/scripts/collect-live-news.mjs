import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildAutoReviewCandidates, collectAutoNews } from "../src/news/auto-collector.js";
import { fetchSource } from "../src/news/fetch-source.js";
import { createRobotsPolicy } from "../src/news/robots.js";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const registryPath = resolve(valueAfter("--registry", "../config/news-sources.json"));
const outputPath = resolve(valueAfter("--output", "../client/public/data/live-news.json"));
const reportPath = resolve(valueAfter("--report", "data/live-news-run.json"));
const candidatesPath = resolve(valueAfter("--candidates", "data/live-news-candidates.json"));

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function writeJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function validateRegistry(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.sources) || value.sources.length < 6) throw new Error("News source registry is invalid.");
  const ids = new Set();
  for (const source of value.sources) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(source.id || "") || ids.has(source.id)) throw new Error("News source ids must be unique slugs.");
    ids.add(source.id);
    if (!source.name || !["rss", "atom", "html", "json"].includes(source.type) || typeof source.enabled !== "boolean") throw new Error(`News source ${source.id} is incomplete.`);
    if (!Array.isArray(source.allowedHosts) || !source.allowedHosts.length) throw new Error(`News source ${source.id} needs an allowlist.`);
    const url = new URL(source.url);
    if (url.protocol !== "https:" || !source.allowedHosts.includes(url.hostname)) throw new Error(`News source ${source.id} URL is not allowlisted.`);
    if (!source.enabled && !source.disabledReason) throw new Error(`Disabled news source ${source.id} needs a reason.`);
  }
  return value.sources;
}

const registry = validateRegistry(await readJson(registryPath));
const previous = await readJson(outputPath, { stories: [] });
const robots = createRobotsPolicy({ fetchSource });
const artifact = await collectAutoNews({ sources: registry, fetcher: fetchSource, detailFetcher: fetchSource, robots, previous });
const report = {
  schemaVersion: 1,
  generatedAt: artifact.generatedAt,
  totalStories: artifact.stories.length,
  sources: artifact.sourceReports,
};
const candidates = { schemaVersion: 1, generatedAt: artifact.generatedAt, candidates: buildAutoReviewCandidates(artifact.stories, registry, artifact.generatedAt) };

await writeJson(outputPath, artifact);
await writeJson(reportPath, report);
await writeJson(candidatesPath, candidates);
for (const source of artifact.sourceReports) {
  const detail = source.state === "current" ? `${source.fetched} stories` : source.error || source.reason || `${source.retained || 0} retained`;
  console.log(`${source.sourceId}: ${source.state} — ${detail}`);
}
console.log(`total: ${artifact.stories.length} stories`);
