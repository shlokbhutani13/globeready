import { rulesLibrary } from "../data/rules-library";
import { searchResources } from "../data/resource-center";

// Searches titles and names only: reviewed updates, guides, task titles and document names. Document contents are never
// searched here; they can be searched only inside Ask, and only while document reading is on.
const normalize = (text) => String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "");
const terms = (query) => normalize(query).split(/[^a-z0-9]+/u).filter((term) => term.length > 1);

function matches(fields, queryTerms) {
  const haystack = normalize(fields.filter(Boolean).join(" "));
  return queryTerms.every((term) => haystack.includes(term));
}

export function searchEverything(query, { news = [], guides = [], tasks = [], documents = [], cases = [], rules = rulesLibrary } = {}, { perGroup = 8 } = {}) {
  const queryTerms = terms(query);
  if (queryTerms.length === 0) return { query: String(query || "").trim(), groups: [], total: 0 };
  const groups = [
    { id: "news", label: "Updates", results: news.filter((item) => matches([item.title, item.shortSummary, item.excerpt, item.publisher], queryTerms)).map((item) => ({ id: item.id, title: item.title, detail: item.publisher || "", to: `/news/${encodeURIComponent(item.id)}` })) },
    { id: "guides", label: "Guides", results: guides.filter((guide) => matches([guide.title, guide.summary, guide.category, guide.source], queryTerms)).map((guide) => ({ id: guide.id, title: guide.title, detail: guide.category || "", to: "/guides" })) },
    { id: "rules", label: "Rules and forms", results: rules.filter((entry) => matches([entry.title, entry.agency, entry.citation, ...(entry.keywords || [])], queryTerms)).map((entry) => ({ id: entry.id, title: entry.title, detail: entry.agency, to: "/rules" })) },
    { id: "resources", label: "Safety and life resources", results: searchResources(query).map((entry) => ({ id: entry.id, title: entry.title, detail: entry.agency, to: "/resources" })) },
    { id: "cases", label: "Cases", results: cases.filter((record) => matches([record.title, record.formNumber], queryTerms)).map((record) => ({ id: record.id, title: record.title, detail: record.formNumber ? `Form ${record.formNumber}` : "Case", to: "/cases" })) },
    { id: "tasks", label: "Tasks", results: tasks.filter((task) => matches([task.title, task.category], queryTerms)).map((task) => ({ id: task.id, title: task.title, detail: task.dueDate ? `Due ${task.dueDate}` : "No due date", to: "/tasks" })) },
    { id: "documents", label: "Document names", results: documents.filter((document) => matches([document.name], queryTerms)).map((document) => ({ id: document.id, title: document.name, detail: "Name only. Open Ask to search inside documents.", to: "/documents" })) },
  ].map((group) => ({ ...group, total: group.results.length, results: group.results.slice(0, perGroup) })).filter((group) => group.total > 0);
  return { query: String(query).trim(), groups, total: groups.reduce((sum, group) => sum + group.total, 0) };
}
