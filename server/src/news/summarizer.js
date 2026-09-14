const allowedUrgency = new Set(["low", "medium", "high", "urgent", "critical"]);
const allowedImpactAreas = new Set([
  "status",
  "employment",
  "travel-entry",
  "forms-fees",
  "taxes-social-security",
  "emergency",
  "university",
  "general",
]);
const allowedTopics = new Set([...allowedImpactAreas, "campus-life"]);
const allowedVisaTypes = new Set(["f-1", "f-2", "m-1", "m-2", "j-1", "j-2", "h-1b"]);
const rootFields = new Set([
  "plainLanguageSummary",
  "urgency",
  "impactAreas",
  "visaTypes",
  "topics",
  "actions",
]);
const actionFields = new Set(["label", "sourceUrl"]);
const isoDatePattern = /\b\d{4}-\d{2}-\d{2}\b/gu;
const urlPattern = /https?:\/\/[^\s<>"']+/giu;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value, field, max) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Generated ${field} must be a non-empty string.`);
  }
  const cleaned = value.toWellFormed().replace(/\s+/gu, " ").trim();
  if (cleaned.length > max) throw new Error(`Generated ${field} exceeds its length limit.`);
  return cleaned;
}

function enumValue(value, values, field) {
  if (typeof value !== "string" || !values.has(value)) {
    throw new Error(`Generated ${field} contains an unknown value.`);
  }
  return value;
}

function enumArray(value, values, field) {
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error(`Generated ${field} must be a bounded array.`);
  }
  const result = value.map((entry) => enumValue(entry, values, field));
  if (new Set(result).size !== result.length) {
    throw new Error(`Generated ${field} cannot contain duplicate values.`);
  }
  return result;
}

function rejectUnknownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`Generated ${label} contains an unknown field: ${unknown[0]}.`);
}

function validateDraft(value) {
  if (!isRecord(value)) throw new Error("Generated JSON must contain an object.");
  rejectUnknownFields(value, rootFields, "summary");
  for (const field of rootFields) {
    if (!Object.hasOwn(value, field)) throw new Error(`Generated summary is missing ${field}.`);
  }

  if (!Array.isArray(value.actions) || value.actions.length > 5) {
    throw new Error("Generated actions must be a bounded array.");
  }
  const actions = value.actions.map((action) => {
    if (!isRecord(action)) throw new Error("Generated action must be an object.");
    rejectUnknownFields(action, actionFields, "action");
    if (!Object.hasOwn(action, "label") || !Object.hasOwn(action, "sourceUrl")) {
      throw new Error("Generated action is missing a required field.");
    }
    return {
      label: cleanString(action.label, "action label", 160),
      sourceUrl: cleanString(action.sourceUrl, "action sourceUrl", 2_000),
    };
  });

  return {
    plainLanguageSummary: cleanString(value.plainLanguageSummary, "plainLanguageSummary", 1_500),
    urgency: enumValue(value.urgency, allowedUrgency, "urgency"),
    impactAreas: enumArray(value.impactAreas, allowedImpactAreas, "impactAreas"),
    visaTypes: enumArray(value.visaTypes, allowedVisaTypes, "visaTypes"),
    topics: enumArray(value.topics, allowedTopics, "topics"),
    actions,
  };
}

function generatedText(output) {
  if (typeof output === "string") return output;
  if (isRecord(output) && typeof output.text === "string") return output.text;
  throw new Error("Generated response did not contain JSON text.");
}

function sourceMaterial(candidate) {
  return [
    candidate?.title,
    candidate?.excerpt,
    candidate?.normalizedText,
    candidate?.publishedAt,
    candidate?.updatedAt,
    candidate?.effectiveAt,
    candidate?.canonicalUrl,
    candidate?.officialPdfUrl,
  ].filter((value) => typeof value === "string").join("\n");
}

function allStrings(value, strings = []) {
  if (typeof value === "string") {
    strings.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) allStrings(entry, strings);
  } else if (isRecord(value)) {
    for (const entry of Object.values(value)) allStrings(entry, strings);
  }
  return strings;
}

function registryDomains(values) {
  if (!Array.isArray(values)) throw new Error("Verified official domains must be an array.");
  return values.map((value) => {
    const candidate = typeof value === "string" ? value : value?.hostname;
    if (typeof candidate !== "string" || !candidate.trim()) {
      throw new Error("Verified official domain entry is invalid.");
    }
    let hostname = candidate.trim().toLowerCase();
    if (hostname.includes("://")) {
      try {
        hostname = new URL(hostname).hostname.toLowerCase();
      } catch {
        throw new Error("Verified official domain entry is invalid.");
      }
    }
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(hostname) || !hostname.includes(".")) {
      throw new Error("Verified official domain entry is invalid.");
    }
    return hostname;
  });
}

function trimUrlPunctuation(value) {
  return value.replace(/[),.;:\]}]+$/u, "");
}

function validateSourceBounds(draft, candidate, verifiedDomains) {
  const material = sourceMaterial(candidate);
  const strings = allStrings(draft);
  const dates = [...new Set(strings.flatMap((value) => value.match(isoDatePattern) || []))];
  for (const date of dates) {
    if (!material.includes(date)) {
      throw new Error(`Generated date does not occur in source material: ${date}.`);
    }
  }

  const domains = registryDomains(verifiedDomains);
  const canonicalUrl = typeof candidate?.canonicalUrl === "string" ? candidate.canonicalUrl : "";
  const urls = [...new Set([
    ...draft.actions.map((action) => action.sourceUrl),
    ...strings.flatMap((value) => (value.match(urlPattern) || []).map(trimUrlPunctuation)),
  ])];
  for (const value of urls) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Generated summary contains a malformed URL.");
    }
    const hostname = url.hostname.toLowerCase();
    const verified = value === canonicalUrl
      || domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !verified) {
      throw new Error(`Generated summary contains an unverified official URL: ${value}.`);
    }
  }
}

function reviewFailure(error) {
  return {
    ok: false,
    reviewRequired: true,
    publishable: false,
    draft: null,
    error: error instanceof Error ? error.message : "Generated summary failed validation.",
  };
}

export function createNewsSummarizer({ generate } = {}) {
  if (typeof generate !== "function") throw new Error("News summarizer requires a generate function.");

  return {
    async summarize(candidate, { verifiedDomains = [] } = {}) {
      try {
        const output = await generate({
          schemaVersion: 1,
          untrustedSource: {
            title: candidate?.title || "",
            excerpt: candidate?.excerpt || "",
            normalizedText: candidate?.normalizedText || "",
            publishedAt: candidate?.publishedAt || null,
            updatedAt: candidate?.updatedAt || null,
            effectiveAt: candidate?.effectiveAt || null,
            canonicalUrl: candidate?.canonicalUrl || "",
          },
        });
        let parsed;
        try {
          parsed = JSON.parse(generatedText(output));
        } catch (error) {
          if (error instanceof SyntaxError) throw new Error("Generated response is not valid JSON.");
          throw error;
        }
        const draft = validateDraft(parsed);
        validateSourceBounds(draft, candidate, verifiedDomains);
        return {
          ok: true,
          reviewRequired: true,
          publishable: false,
          draft,
          error: null,
        };
      } catch (error) {
        return reviewFailure(error);
      }
    },
  };
}
