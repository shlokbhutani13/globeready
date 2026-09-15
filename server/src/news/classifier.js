import { documentTypes, legalStates } from "./schema.js";

const topicTerms = new Map([
  ["status", [
    "maintenance of status",
    "unlawful presence",
    "grace period",
    "departure period",
    "duration of status",
    "extension of stay",
    "change of status",
  ]],
  ["forms-fees", [
    "filing fee",
    "form edition",
    "new form",
    "form i-765",
    "i-765",
    "fee schedule",
  ]],
  ["employment", [
    "stem opt",
    "cap-gap",
    "cap gap",
    "employment authorization",
    "work-hour",
    "work hour",
    "practical training",
    "cpt",
    "opt",
  ]],
  ["travel-entry", [
    "travel restriction",
    "entry ban",
    "visa suspension",
    "consular closure",
    "port of entry",
    "i-94",
    "admission",
    "travel",
  ]],
  ["taxes-social-security", [
    "tax filing",
    "tax obligation",
    "social security",
    "ssn",
    "health insurance",
  ]],
  ["emergency", ["emergency relief", "special student relief", "emergency"]],
  ["campus-life", ["welcome picnic", "welcome event", "orientation", "campus life"]],
]);

const highImpactTerms = [
  "maintenance of status",
  "unlawful presence",
  "grace period",
  "departure period",
  "duration of status",
  "extension of stay",
  "stem opt",
  "cap-gap",
  "cap gap",
  "employment authorization",
  "work-hour",
  "work hour",
  "practical training",
  "cpt",
  "opt",
  "visa suspension",
  "travel restriction",
  "entry ban",
  "consular closure",
  "filing deadline",
  "filing fee",
  "form edition",
  "new form",
  "i-765",
  "eligibility standard",
  "court injunction",
  "injunction",
  "effective date",
  "tax filing",
  "tax obligation",
  "social security eligibility",
  "health insurance",
  "emergency relief",
  "special student relief",
];

const relevanceTerms = [
  ...highImpactTerms,
  "international student employment",
  "student taxation",
  "school certification",
  "student dependent",
  "student visa",
  "sevis",
];

const visaTypeTerms = new Map([
  ["f-1", ["f-1", "f1 student", "f 1 student"]],
  ["f-2", ["f-2", "f2 dependent", "f 2 dependent"]],
  ["m-1", ["m-1", "m1 student", "m 1 student"]],
  ["m-2", ["m-2", "m2 dependent", "m 2 dependent"]],
  ["j-1", ["j-1", "j1 exchange", "j 1 exchange"]],
  ["j-2", ["j-2", "j2 dependent", "j 2 dependent"]],
  ["h-1b", ["h-1b", "h1b", "cap-gap", "cap gap"]],
]);

const legalStateTerms = new Map([
  ["enjoined", ["court injunction", "injunction", "enjoined"]],
  ["delayed", ["delayed", "delay of", "postponed"]],
  ["withdrawn", ["withdrawn", "withdrawal"]],
  ["superseded", ["superseded", "replaced by"]],
  ["expired", ["expired", "expiration"]],
  ["effective", ["now effective", "takes effect", "effective immediately"]],
  ["scheduled", ["scheduled to take effect"]],
]);

function cleanText(value) {
  return typeof value === "string" ? value.toWellFormed().replace(/\s+/gu, " ").trim() : "";
}

function searchText(candidate) {
  return [candidate?.title, candidate?.excerpt, candidate?.normalizedText]
    .map(cleanText)
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

function includesTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "iu").test(text);
}

function matchingTerms(text, terms) {
  return terms.filter((term) => includesTerm(text, term));
}

const changePredicatePattern = /\b(?:change[ds]?|changing|expand(?:s|ed|ing)?|increas(?:e|es|ed|ing)|decreas(?:e|es|ed|ing)|reduc(?:e|es|ed|ing|tion)|extend(?:s|ed|ing)?|shorten(?:s|ed|ing)?|open(?:s|ed|ing)?|clos(?:e|es|ed|ing)|begin(?:s|ning)?|end(?:s|ed|ing)?|remain(?:s|ed|ing)?|stay(?:s|ed|ing)?|unchanged|unaffected|the\s+same)\b/iu;
const rightClausePredicatePattern = /^\s+(?:the\s+|a\s+|an\s+)?(?:[a-z0-9]+(?:-[a-z0-9]+)?\s+){0,8}(?:change[ds]?|expand(?:s|ed|ing)?|increas(?:e|es|ed|ing)|decreas(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|extend(?:s|ed|ing)?|shorten(?:s|ed|ing)?|open(?:s|ed|ing)?|clos(?:e|es|ed|ing)|begin(?:s|ning)?|end(?:s|ed|ing)?|remain(?:s|ed|ing)?|stay(?:s|ed|ing)?|does?\s+not\s+change|do\s+not\s+change|will\s+(?:change|expand|increase|decrease|reduce|extend|shorten|open|close|begin|end|remain|stay))\b/iu;

function splitCoordinatingClaims(clause) {
  const parts = [];
  let start = 0;
  const separator = /\band\b/giu;
  for (const match of clause.matchAll(separator)) {
    const left = clause.slice(start, match.index);
    const right = clause.slice(match.index + match[0].length);
    if (changePredicatePattern.test(left) && rightClausePredicatePattern.test(right)) {
      if (left.trim()) parts.push(left.trim());
      start = match.index + match[0].length;
    }
  }
  const tail = clause.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function claimClauses(text) {
  return text.split(/(?:[.!?;:\n]+|,\s*(?:and|but|however|yet)\b|\b(?:but|however|yet)\b)/iu)
    .flatMap(splitCoordinatingClaims)
    .filter(Boolean);
}

function hasPostTermNoChange(suffix) {
  const unchanged = /\b(?:(?:remains?|stays?|is|are|was|were|will\s+remain)\s+(?:unchanged|unaffected|the\s+same)|(?:does|do|did)\s+not\s+change)\b/iu.exec(suffix);
  if (!unchanged) return false;
  const changed = /\b(?:change[ds]?|expand(?:s|ed|ing)?|increas(?:e|es|ed|ing)|decreas(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|extend(?:s|ed|ing)?|shorten(?:s|ed|ing)?|open(?:s|ed|ing)?|clos(?:e|es|ed|ing)|begin(?:s|ning)?|end(?:s|ed|ing)?)\b/iu.exec(suffix);
  return !changed || unchanged.index <= changed.index;
}

function includesAffirmedTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
  const matcher = new RegExp(`(?:^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`, "giu");
  for (const clause of claimClauses(text)) {
    for (const match of clause.matchAll(matcher)) {
      const termOffset = match.index + match[0].indexOf(match[1]);
      const prefix = clause.slice(0, termOffset);
      const suffix = clause.slice(termOffset + match[1].length);
      const negatedBefore = /\b(?:no|without)\b/iu.test(prefix)
        || /\b(?:do|does|did|has|have|had|is|are|was|were|will|would|can|could)\s+not\b/iu.test(prefix)
        || /\b(?:doesn't|didn't|hasn't|haven't|isn't|aren't|wasn't|weren't|won't|wouldn't|can't|couldn't)\b/iu.test(prefix);
      const negatedAfter = hasPostTermNoChange(suffix);
      if (!negatedBefore && !negatedAfter) return true;
    }
  }
  return false;
}

function matchingAffirmedTerms(text, terms) {
  return terms.filter((term) => includesAffirmedTerm(text, term));
}

function sourceDocumentType(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;
  if (text.includes("correction")) return "correction";
  if (text.includes("proposed") && text.includes("rule")) return "proposed-rule";
  if (text.includes("rule")) return "final-rule";
  if (text.includes("guidance")) return "guidance";
  if (text.includes("policy")) return "policy-update";
  if (text.includes("form")) return "form-change";
  if (text.includes("fee")) return "fee-change";
  if (text.includes("court")) return "court-update";
  if (text.includes("emergency")) return "emergency";
  if (text.includes("university")) return "university-notice";
  if (text.includes("notice")) return "notice";
  return null;
}

function inferredDocumentType(text) {
  if (includesTerm(text, "correction")) return "correction";
  if (includesTerm(text, "proposed rule")) return "proposed-rule";
  if (includesTerm(text, "final rule") || includesTerm(text, "rule")) return "final-rule";
  if (includesTerm(text, "court injunction") || includesTerm(text, "court order")) return "court-update";
  if (includesTerm(text, "policy manual") || includesTerm(text, "policy update")) return "policy-update";
  if (includesTerm(text, "form edition") || includesTerm(text, "new form") || includesTerm(text, "i-765")) return "form-change";
  if (includesTerm(text, "filing fee") || includesTerm(text, "fee schedule")) return "fee-change";
  if (includesTerm(text, "emergency")) return "emergency";
  if (includesTerm(text, "guidance")) return "guidance";
  return "notice";
}

function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function currentIsoDate(clock) {
  if (typeof clock !== "function") throw new Error("News classifier clock must be a function.");
  const now = new Date(clock());
  if (Number.isNaN(now.valueOf())) throw new Error("News classifier clock returned an invalid date.");
  return now.toISOString().slice(0, 10);
}

function classifyLegalState(candidate, text, documentType, today) {
  const explicit = cleanText(candidate?.sourceLegalState).toLowerCase();
  const futureEffectiveDate = validIsoDate(candidate?.effectiveAt) && candidate.effectiveAt > today;
  if (legalStates.has(explicit)) {
    return futureEffectiveDate && ["effective", "final", "informational"].includes(explicit)
      ? "scheduled"
      : explicit;
  }

  for (const [state, terms] of legalStateTerms) {
    if (state === "effective" && futureEffectiveDate) continue;
    if (matchingAffirmedTerms(text, terms).length > 0) return state;
  }

  if (documentType === "proposed-rule") return "proposed";
  if (futureEffectiveDate) return "scheduled";
  if (documentType === "final-rule") {
    if (validIsoDate(candidate?.effectiveAt)) {
      return candidate.effectiveAt > today ? "scheduled" : "effective";
    }
    return "final";
  }
  return "informational";
}

function classifyTopic(text) {
  for (const [topic, terms] of topicTerms) {
    if (matchingTerms(text, terms).length > 0) return topic;
  }
  return "general";
}

function daysUntil(date, today) {
  if (!validIsoDate(date)) return null;
  return Math.round((Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
}

function classifyUrgency({ highImpact, legalState, topic, effectiveAt }, today) {
  if (topic === "emergency") return "critical";
  if (legalState === "enjoined" || legalState === "delayed" || legalState === "withdrawn") return "urgent";
  const untilEffective = daysUntil(effectiveAt, today);
  if (highImpact && untilEffective !== null && untilEffective >= 0 && untilEffective <= 7) return "urgent";
  return highImpact ? "high" : "low";
}

export function classifyCandidate(candidate = {}, { clock = () => new Date() } = {}) {
  const text = searchText(candidate);
  const today = currentIsoDate(clock);
  const explicitDocumentType = sourceDocumentType(candidate.sourceDocumentType);
  const documentType = explicitDocumentType || inferredDocumentType(text);
  const legalState = classifyLegalState(candidate, text, documentType, today);
  const topic = classifyTopic(text);
  const topicMatches = matchingTerms(text, topicTerms.get(topic) || []);
  const impactMatches = matchingAffirmedTerms(text, highImpactTerms);
  const relevanceMatches = matchingAffirmedTerms(text, relevanceTerms);
  const visaTypes = [];
  const visaMatches = [];

  for (const [visaType, terms] of visaTypeTerms) {
    const matches = matchingTerms(text, terms);
    if (matches.length > 0) {
      visaTypes.push(visaType);
      visaMatches.push(...matches);
    }
  }

  if (/\bF\s*,\s*M\s*,?\s*(?:and|&)\s*J\b/iu.test(text)) {
    visaTypes.push("f-1", "m-1", "j-1");
    visaMatches.push("f/m/j students");
  }

  const highImpact = impactMatches.length > 0;
  const uniqueVisaTypes = [...new Set(visaTypes)];
  const audienceMatched = uniqueVisaTypes.length > 0
    || includesTerm(text, "international student")
    || includesTerm(text, "student visa")
    || includesTerm(text, "student dependent")
    || includesTerm(text, "sevis");
  const contextualRelevance = audienceMatched
    && (topic === "travel-entry" || topic === "taxes-social-security");
  const relevance = audienceMatched && (relevanceMatches.length > 0 || contextualRelevance)
    ? "relevant"
    : audienceMatched
      ? "borderline"
      : "not-relevant";
  const invalidEffectiveDate = candidate.effectiveAt != null && !validIsoDate(candidate.effectiveAt);
  const unknownSourceDocumentType = Boolean(cleanText(candidate.sourceDocumentType)) && !explicitDocumentType;
  const needsHumanReview = highImpact
    || relevance === "borderline"
    || invalidEffectiveDate
    || unknownSourceDocumentType;
  const matchedTerms = [...new Set([...topicMatches, ...impactMatches, ...visaMatches])];
  const confidence = Math.min(1, Number((
    0.45
    + (explicitDocumentType ? 0.15 : 0)
    + (topic !== "general" ? 0.15 : 0)
    + (relevanceMatches.length > 0 ? 0.15 : 0)
    + (uniqueVisaTypes.length > 0 ? 0.1 : 0)
    - (invalidEffectiveDate || unknownSourceDocumentType ? 0.2 : 0)
  ).toFixed(2)));
  const urgency = classifyUrgency({ highImpact, legalState, topic, effectiveAt: candidate.effectiveAt }, today);

  if (!documentTypes.has(documentType) || !legalStates.has(legalState)) {
    throw new Error("News classifier produced a value outside the closed schema.");
  }

  return {
    documentType,
    legalState,
    topic,
    topics: topic === "general" ? [] : [topic],
    visaTypes: uniqueVisaTypes,
    highImpact,
    urgency,
    relevance,
    confidence,
    matchedTerms,
    needsHumanReview,
    explanation: matchedTerms.length > 0
      ? `Matched deterministic terms: ${matchedTerms.join(", ")}.`
      : "No deterministic policy term matched.",
  };
}

export function isHighImpact(classification) {
  return classification?.highImpact === true;
}
