import { Router } from "express";
import { mergedSources, sourceHealth, universityCoverage } from "../news/coverage.js";
import { buildCoverageLedger, publicCoverageLedger } from "../news/coverage-ledger.js";
import { canonicalOfficialUrl } from "../news/official-url.js";
import { isPublished, publicNewsItem } from "../news/schema.js";
import { explainPublishedNews } from "../news/explain-news.js";
import { createAssistant } from "../assistant.js";

const topics = new Set([
  "general", "status", "forms-fees", "employment", "travel-entry",
  "taxes-social-security", "emergency", "campus-life", "university",
]);
const visaTypes = new Set(["f-1", "f-2", "m-1", "m-2", "j-1", "j-2", "h-1b"]);
const countryCodes = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ "
  + "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR "
  + "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO "
  + "JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR "
  + "MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO "
  + "RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW "
  + "TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" "));
const legalStates = new Set([
  "proposed", "final", "scheduled", "effective", "delayed", "enjoined",
  "superseded", "withdrawn", "expired", "informational",
]);
const filterFields = new Set(["topic", "visaType", "universityId", "legalState", "sourceId", "q", "from", "to", "limit", "cursor"]);
const preferenceFields = new Set([
  "visaTypes", "homeCountries", "universityIds", "topics", "digestFrequency", "pushEnabled", "emailRemindersEnabled",
]);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u;

function invalid(response, message) {
  return response.status(422).json({ error: { code: "invalid_news_request", message } });
}

function oneString(value, max = 128) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function closedArray(value, allowed, { max = 20, pattern } = {}) {
  if (!Array.isArray(value) || value.length > max) return null;
  if (value.some((entry) => typeof entry !== "string" || entry.length > 128
    || (allowed && !allowed.has(entry)) || (pattern && !pattern.test(entry)))) return null;
  return new Set(value).size === value.length ? [...value] : null;
}

function parseFilters(query) {
  if (Object.keys(query).some((key) => !filterFields.has(key))) throw new Error("Unknown news filter.");
  for (const value of Object.values(query)) if (Array.isArray(value)) throw new Error("News filters must be singular.");
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("News limit must be between 1 and 50.");
  if (query.topic !== undefined && !topics.has(query.topic)) throw new Error("Unknown news topic.");
  if (query.visaType !== undefined && !visaTypes.has(query.visaType)) throw new Error("Unknown visa type.");
  if (query.legalState !== undefined && !legalStates.has(query.legalState)) throw new Error("Unknown legal state.");
  if (query.universityId !== undefined && !idPattern.test(query.universityId)) throw new Error("Invalid university ID.");
  if (query.cursor !== undefined && (!oneString(query.cursor, 4_096))) throw new Error("Invalid news cursor.");
  if (query.q !== undefined && (!oneString(query.q, 120) || query.q.trim() !== query.q)) throw new Error("Invalid news search.");
  if (query.sourceId !== undefined && (!oneString(query.sourceId) || !/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(query.sourceId))) throw new Error("Invalid news source.");
  for (const field of ["from", "to"]) {
    if (query[field] !== undefined && (!/^\d{4}-\d{2}-\d{2}$/u.test(query[field])
      || Number.isNaN(new Date(`${query[field]}T00:00:00Z`).valueOf())
      || new Date(`${query[field]}T00:00:00Z`).toISOString().slice(0, 10) !== query[field])) throw new Error("Invalid news date.");
  }
  if (query.from && query.to && query.from > query.to) throw new Error("Invalid news date range.");
  return {
    ...(query.topic ? { topic: query.topic } : {}),
    ...(query.visaType ? { visaType: query.visaType } : {}),
    ...(query.universityId ? { universityId: query.universityId } : {}),
    ...(query.legalState ? { legalState: query.legalState } : {}),
    ...(query.sourceId ? { sourceId: query.sourceId } : {}),
    ...(query.q ? { q: query.q.toLocaleLowerCase() } : {}),
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  };
}

function parsePreferences(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !preferenceFields.has(key))) return null;
  if (!preferenceFields.size || Object.keys(body).length === 0) return null;
  const parsed = {};
  if (Object.hasOwn(body, "visaTypes")) {
    parsed.visaTypes = closedArray(body.visaTypes, visaTypes);
    if (!parsed.visaTypes) return null;
  }
  if (Object.hasOwn(body, "homeCountries")) {
    parsed.homeCountries = closedArray(body.homeCountries, countryCodes);
    if (!parsed.homeCountries) return null;
  }
  if (Object.hasOwn(body, "universityIds")) {
    parsed.universityIds = closedArray(body.universityIds, null, { pattern: idPattern });
    if (!parsed.universityIds) return null;
  }
  if (Object.hasOwn(body, "topics")) {
    parsed.topics = closedArray(body.topics, topics);
    if (!parsed.topics) return null;
  }
  if (Object.hasOwn(body, "digestFrequency")) {
    if (!["daily", "weekly", "off"].includes(body.digestFrequency)) return null;
    parsed.digestFrequency = body.digestFrequency;
  }
  if (Object.hasOwn(body, "emailRemindersEnabled")) {
    if (typeof body.emailRemindersEnabled !== "boolean") return null;
    parsed.emailRemindersEnabled = body.emailRemindersEnabled;
  }
  if (Object.hasOwn(body, "pushEnabled")) {
    if (typeof body.pushEnabled !== "boolean") return null;
    parsed.pushEnabled = body.pushEnabled;
  }
  return parsed;
}

function canonicalSuggestion(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["url", "universityId"].includes(key))) return null;
  let url;
  try { url = canonicalOfficialUrl(body.url); } catch { return null; }
  if (body.universityId !== undefined && (typeof body.universityId !== "string" || !idPattern.test(body.universityId))) return null;
  return { canonicalUrl: url.href, ...(body.universityId ? { universityId: body.universityId } : {}) };
}

const pass = (_request, _response, next) => next();

export function newsRouter(store, {
  sourceSuggestionLimiter = pass,
  newsQueryLimiter = pass,
  registeredSources = [],
  clock = () => new Date(),
  assistant = createAssistant(),
  aiLimiter = pass,
} = {}) {
  const router = Router();
  router.get("/coverage", newsQueryLimiter, async (_request, response) => {
    const [stored, runs] = await Promise.all([
      store.newsSources.listGlobal(),
      store.newsRuns.listGlobal(),
    ]);
    const ledger = buildCoverageLedger({
      sources: mergedSources(registeredSources, stored),
      runs,
      now: clock(),
    });
    response.json({ data: publicCoverageLedger(ledger) });
  });
  router.get("/university-coverage", newsQueryLimiter, async (request, response) => {
    const universityId = request.query.universityId;
    if (Object.keys(request.query).some((key) => key !== "universityId")
      || typeof universityId !== "string" || !idPattern.test(universityId)) {
      return invalid(response, "Provide a valid universityId.");
    }
    const stored = await store.newsSources.listGlobal();
    response.json({ data: universityCoverage(mergedSources(registeredSources, stored), universityId) });
  });
  router.get("/", newsQueryLimiter, async (request, response) => {
    let filters;
    try { filters = parseFilters(request.query); } catch (error) { return invalid(response, error.message); }
    let results;
    try { results = await store.news.listPublished(filters); } catch { return invalid(response, "News cursor is invalid."); }
    const stored = await store.newsSources.listGlobal();
    response.json({
      data: {
        items: [...results].slice(0, filters.limit),
        nextCursor: results.cursor || null,
        sourceHealth: sourceHealth(mergedSources(registeredSources, stored), clock().getTime()),
      },
    });
  });
  router.get("/preferences", async (request, response) => {
    response.json({ data: await store.newsPreferences.get(request.user.uid) });
  });
  router.put("/preferences", async (request, response) => {
    const input = parsePreferences(request.body);
    if (!input) return invalid(response, "News preferences are invalid.");
    response.json({ data: await store.newsPreferences.set(request.user.uid, input) });
  });
  router.get("/digests", async (request, response) => {
    response.json({ data: await store.newsDigests.list(request.user.uid) });
  });
  router.post("/source-suggestions", sourceSuggestionLimiter, async (request, response) => {
    const suggestion = canonicalSuggestion(request.body);
    if (!suggestion) return invalid(response, "Submit one canonical HTTPS .gov or .edu URL.");
    const item = await store.reviewQueue.create({
      type: "source-suggestion",
      ...suggestion,
      submittedBy: request.user.uid,
      status: "pending",
      trusted: false,
    });
    response.status(201).json({ data: item });
  });
  router.post("/:id/explain", aiLimiter, async (request, response) => {
    if (!idPattern.test(request.params.id)) return response.status(404).json({ error: { code: "news_not_found" } });
    const item = await store.news.get(request.params.id);
    if (!isPublished(item)) return response.status(404).json({ error: { code: "news_not_found" } });
    const question = request.body?.question;
    if (question !== undefined && (typeof question !== "string" || question.trim().length > 500)) return invalid(response, "News explanation question is invalid.");
    try {
      const profile = await store.profiles.get(request.user.uid);
      response.json({ data: await explainPublishedNews({ item, profile, question, provider: assistant }) });
    } catch {
      response.status(503).json({ error: { code: "news_explanation_unavailable", message: "AI explanation is temporarily unavailable. The verified story and official source remain available." } });
    }
  });
  router.get("/:id", async (request, response) => {
    if (!idPattern.test(request.params.id)) return response.status(404).json({ error: { code: "news_not_found" } });
    const item = await store.news.get(request.params.id);
    if (!isPublished(item)) return response.status(404).json({ error: { code: "news_not_found" } });
    response.json({ data: publicNewsItem(item) });
  });
  router.post("/:id/save", async (request, response) => {
    if (!idPattern.test(request.params.id)) return response.status(404).json({ error: { code: "news_not_found" } });
    const item = await store.news.get(request.params.id);
    if (!isPublished(item)) return response.status(404).json({ error: { code: "news_not_found" } });
    const existing = (await store.savedNews.list(request.user.uid)).find(({ newsItemId }) => newsItemId === item.id);
    if (existing) return response.json({ data: existing });
    const saved = await store.savedNews.create(request.user.uid, { newsItemId: item.id });
    response.status(201).json({ data: saved });
  });
  router.delete("/:id/save", async (request, response) => {
    if (!idPattern.test(request.params.id)) return response.status(404).json({ error: { code: "saved_news_not_found" } });
    const existing = (await store.savedNews.list(request.user.uid)).find(({ newsItemId }) => newsItemId === request.params.id);
    if (!existing) return response.status(404).json({ error: { code: "saved_news_not_found" } });
    await store.savedNews.remove(request.user.uid, existing.id);
    response.status(204).end();
  });
  return router;
}
