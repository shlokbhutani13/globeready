import { Router } from "express";
import { mergedSources, sourceHealth, universityCoverage } from "../news/coverage.js";
import { canonicalOfficialUrl } from "../news/official-url.js";
import { isPublished, publicNewsItem } from "../news/schema.js";

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
const filterFields = new Set(["topic", "visaType", "universityId", "legalState", "limit", "cursor"]);
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
  return {
    ...(query.topic ? { topic: query.topic } : {}),
    ...(query.visaType ? { visaType: query.visaType } : {}),
    ...(query.universityId ? { universityId: query.universityId } : {}),
    ...(query.legalState ? { legalState: query.legalState } : {}),
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
} = {}) {
  const router = Router();
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
