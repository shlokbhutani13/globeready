import { universityIdFor } from "./news-data";
import { reviewedUniversities } from "../data/university-coverage";

// Offices every university has under some name. Searching a university's own site for these is the quickest way to
// find the right page, and the right person is always the student's designated school official.
export const officeTypes = [
  { id: "international", label: "International student office", query: "international student services" },
  { id: "dso", label: "Designated school official (DSO)", query: "designated school official DSO I-20" },
  { id: "career", label: "Career services (CPT and OPT)", query: "career services CPT OPT international students" },
  { id: "health", label: "Student health services and insurance", query: "student health services insurance" },
  { id: "safety", label: "Campus safety and police", query: "campus safety police emergency" },
  { id: "housing", label: "Housing", query: "housing residential life" },
  { id: "registrar", label: "Registrar", query: "registrar enrollment verification" },
  { id: "tax", label: "Tax help for international students", query: "international student tax help" },
];

// A student may attend a university outside the United States or one whose official site is not under .edu.
// This accepts a plain public DNS name only—never a URL, IP address, path, credentials, port, or localhost name.
export const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

export const siteSearchUrl = (domain, query) => `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} ${query}`)}`;

// What GlobeReady can honestly say about this student's university.
export function universityCoverage(profile = {}, news = [], reviewed = reviewedUniversities) {
  const name = typeof profile.university === "string" ? profile.university.trim() : "";
  const domain = typeof profile.officialUniversityDomain === "string" ? profile.officialUniversityDomain.trim().toLowerCase() : "";
  const id = profile.universityId || universityIdFor(name);
  const validDomain = domainPattern.test(domain) ? domain : "";
  if (!name) return { status: "none", name: "", domain: "", id: "", updates: [], offices: [], headline: "No university added yet", detail: "Add your university in Profile to see its page." };
  const entry = reviewed.find((candidate) => candidate.id === id || (validDomain && candidate.domain === validDomain));
  const updates = news.filter((item) => Array.isArray(item.universityIds) && item.universityIds.includes(id));
  if (entry) {
    return { status: "reviewed", name, domain: entry.domain || validDomain, id, updates, offices: entry.offices || [], reviewedOn: entry.reviewedOn,
      headline: "Official office links reviewed", detail: `GlobeReady reviewed these links on ${entry.reviewedOn}. Confirm details with your international office.` };
  }
  if (validDomain) {
    return { status: "domain-only", name, domain: validDomain, id, updates, offices: [],
      headline: "Not reviewed by GlobeReady yet", detail: `You entered ${validDomain}. The links below are searches of that website that GlobeReady generated. We have not checked what they lead to, so confirm with your international office.` };
  }
  return { status: "general-only", name, domain: "", id, updates, offices: [],
    headline: "Not reviewed by GlobeReady yet", detail: "GlobeReady has no reviewed sources for your university. You still see federal updates and general guides. Add your university's website in Profile to get search links for its offices." };
}

export function officeLinks(coverage) {
  if (coverage.status === "reviewed" && coverage.offices.length) return coverage.offices.map((office) => ({ id: office.id, label: office.label, url: office.url, reviewed: true }));
  if (!coverage.domain) return [];
  return officeTypes.map((office) => ({ id: office.id, label: office.label, url: siteSearchUrl(coverage.domain, office.query), reviewed: false }));
}

export const universityLinkCategory = "University";

export function universityResources(savedResources = []) {
  return savedResources.filter((resource) => resource.category === universityLinkCategory);
}

// A saved link is only labelled as "on your university's site" when its host really is that site or a subdomain of it.
export function isOnDomain(url, domain) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return Boolean(domain) && (host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}
