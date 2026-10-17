// Source-grounded search for the free beta. It never writes an answer and never calls an AI provider. It ranks
// short passages from content GlobeReady already ships (reviewed rules, guides, glossary, resources, news) and
// returns each one with where it came from. When nothing matches well enough it says so instead of guessing.
import { excerptFor, questionStems, rankLocalChunks } from "./local-documents/retrieval";
import { referralFor } from "./referrals";
import { glossary } from "../data/glossary";
import { guides } from "../data/guides";
import { lifeTopics } from "../data/life-hub";
import { resourceCenter } from "../data/resource-center";
import { effectiveLabel, rulesLibrary } from "../data/rules-library";

export const noSourceNotice = "Nothing in GlobeReady’s reviewed rules, guides, glossary, resources or news matched enough of your question, and GlobeReady will not guess. Try the words an official page would use (for example “OPT” or “I-94”), or ask your designated school official (DSO).";
export const resultsNotice = "These are summaries from the sources listed, not an answer about your situation. Read the source before you act.";
export const personalNotice = "GlobeReady can show what its sources say. Whether it applies to you is for your DSO or a qualified attorney to confirm.";

// "Can I…", "am I eligible…", "do I qualify…": questions about the person, not about the rule.
const personal = /\b(can i|may i|am i|do i qualify|will i|should i|am i eligible|do i need|is it ok for me|is it okay for me|allowed to)\b/i;

// A question that starts like a definition is best answered by the plain-language meaning first.
const definition = /^\s*(what('s| is| are| does)|define|meaning of|explain)\b/i;
// Words that frame a question about the person. They are not in any source, so they are left out of the match.
const framing = /\b(eligible|eligibility|qualify|qualified|allowed|permitted|able|find|finding|choose|pick)\b/gi;

const clean = (value, max = 400) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

function visaOk(allowed, visaCategory) {
  if (!visaCategory || !Array.isArray(allowed) || allowed.length === 0) return true;
  return allowed.includes(visaCategory);
}

function newsEntry(item) {
  const reviewed = item.sourceVerified === true && item.autoIngested !== true;
  const url = item.canonicalUrl || item.sourceUrl || item.url || "";
  const safeUrl = /^https:\/\//i.test(url) ? url : "";
  return {
    id: `news:${item.id}`,
    kind: "news",
    label: reviewed ? "News · reviewed by GlobeReady" : "News · official source, not yet reviewed by GlobeReady",
    title: clean(item.title, 200),
    summary: clean(item.excerpt || item.summary || item.explanation, 500),
    keywords: [...(item.topics || []), item.updateType].filter(Boolean).join(" "),
    publisher: clean(item.publisher || item.agency || item.source, 120),
    url: safeUrl,
    internal: safeUrl ? "" : (item.id ? `/news/${item.id}` : ""),
    date: item.publishedAt || item.publishedOn || "",
    visa: item.visaTypes,
  };
}

// Reviewed material first, so it wins ties against unreviewed news.
export function buildCorpus({ news = [], visaCategory = "", definitionsFirst = false } = {}) {
  const entries = [];
  for (const rule of rulesLibrary) {
    if (!visaOk(rule.visaTypes, visaCategory)) continue;
    entries.push({
      id: `rule:${rule.id}`, kind: "rule",
      label: rule.status === "superseded" ? "Rule · replaced, see the newer rule" : `Rule · reviewed library · ${effectiveLabel(rule)}`,
      title: rule.title, summary: clean(rule.summary, 500), keywords: (rule.keywords || []).join(" "),
      publisher: rule.agency, url: rule.sourceUrl || "", date: rule.publishedAt || "",
    });
  }
  for (const guide of guides) {
    if (!visaOk(guide.visaCategories, visaCategory)) continue;
    entries.push({
      id: `guide:${guide.id}`, kind: "guide", label: `Guide · reviewed ${guide.reviewed || ""}`.trim(),
      title: guide.title, summary: clean(guide.summary, 500), keywords: guide.category || "",
      publisher: guide.source, url: guide.url || "",
    });
  }
  for (const term of glossary) {
    entries.push({
      id: `term:${term.id}`, kind: "term", label: "Plain-language meaning · not a legal definition",
      title: term.term, summary: clean(term.meaning, 500), keywords: term.short || "",
      publisher: "GlobeReady glossary", url: "", internal: term.to || "/help",
    });
  }
  for (const topic of lifeTopics) {
    entries.push({
      id: `life:${topic.id}`, kind: "life", label: "Arrival and daily life \u00b7 general checklist, not legal advice",
      title: topic.label, summary: clean(`${topic.blurb} ${(topic.items || []).map((item) => item.title).join(". ")}`, 500),
      keywords: topic.id, publisher: "GlobeReady", internal: "/life",
    });
  }
  for (const resource of resourceCenter) {
    entries.push({
      id: `resource:${resource.id}`, kind: "resource", label: "Resource",
      title: resource.title, summary: clean(resource.summary, 500),
      keywords: [resource.category, resource.phone ? `call phone number ${resource.phone}` : ""].filter(Boolean).join(" "),
      publisher: resource.agency || "", url: resource.url || "", internal: resource.internal || "", phone: resource.phone || "",
    });
  }
  const items = (Array.isArray(news) ? news : []).filter((item) => item && item.title && visaOk(item.visaTypes, visaCategory));
  const reviewed = items.filter((item) => item.sourceVerified === true && item.autoIngested !== true).map(newsEntry);
  const automatic = items.filter((item) => !(item.sourceVerified === true && item.autoIngested !== true)).map(newsEntry);
  const ordered = [...entries, ...reviewed, ...automatic];
  return definitionsFirst ? [...ordered.filter((entry) => entry.kind === "term"), ...ordered.filter((entry) => entry.kind !== "term")] : ordered;
}

export function answerFromSources({ question, news = [], visaCategory = "" }) {
  const text = String(question || "").trim();
  if (!text) throw new Error("Enter a question about GlobeReady’s guides and official sources.");
  if (text.length > 500) throw new Error("Questions must be 500 characters or fewer.");

  const built = buildCorpus({ news, visaCategory, definitionsFirst: definition.test(text) });
  // Among equally good matches, an entry whose own title covers the question comes first ("What is SEVIS?" -> SEVIS).
  const wanted = questionStems(text.replace(framing, " "));
  const titled = (entry) => wanted.length > 0 && (() => { const have = new Set(questionStems(`${entry.title} ${entry.kind === "term" ? entry.keywords : ""}`)); return wanted.every((term) => have.has(term)); })();
  const corpus = [...built.filter(titled), ...built.filter((entry) => !titled(entry))];
  const chunks = corpus.map((entry, index) => ({
    documentId: entry.id, documentName: entry.title, page: index,
    text: `${entry.title}. ${entry.summary} ${entry.keywords}`,
  }));
  const byId = new Map(corpus.map((entry) => [entry.id, entry]));
  const searchText = text.replace(framing, " ").replace(/\s+/g, " ").trim() || text;
  const results = rankLocalChunks(searchText, chunks, { limit: 3 })
    .map(({ chunk, matched }) => {
      const entry = byId.get(chunk.documentId);
      return {
        id: entry.id, kind: entry.kind, label: entry.label, title: entry.title,
        excerpt: excerptFor(entry.summary || entry.title, matched, 400),
        publisher: entry.publisher || "", url: entry.url || "", internal: entry.internal || "", phone: entry.phone || "",
        date: entry.date || "",
      };
    })
    .filter((result) => result.excerpt);

  const referral = referralFor(text);
  return {
    kind: "sources",
    noMatch: results.length === 0,
    evidence: results.length ? "source" : "insufficient",
    answer: "",
    notice: results.length ? (personal.test(text) ? `${resultsNotice} ${personalNotice}` : resultsNotice) : noSourceNotice,
    results,
    referral,
    sources: [],
    searched: corpus.length,
  };
}
