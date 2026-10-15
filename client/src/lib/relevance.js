import { universityIdFor } from "./news-data";

// Informational matching between an update's published tags and fields the student entered. It never decides whether
// an update legally applies to anyone; it only explains why GlobeReady is showing a label.
const topicAliases = {
  "travel-entry": ["travel-entry", "travel"],
  "forms-fees": ["forms-fees", "forms", "fees"],
  "taxes-social-security": ["taxes-social-security", "taxes", "social-security"],
  "campus-life": ["campus-life", "campus"],
};
const stageAliases = {
  "preparing for arrival": ["pre-arrival", "arriving", "arrival"],
  "newly arrived": ["arrived", "arrival", "enrolled"],
  "current student": ["enrolled"],
  "preparing for graduation": ["graduating", "opt"],
};
const topicLabel = (topic) => topic.replaceAll("-", " ");

export function relevanceFor(item = {}, profile = {}) {
  const matches = [];
  const visa = typeof profile.visaType === "string" ? profile.visaType.trim().toLowerCase() : "";
  if (visa && Array.isArray(item.visaTypes) && item.visaTypes.includes(visa)) {
    matches.push({ field: "visaType", label: "visa type", value: profile.visaType.trim() });
  }
  const stage = typeof profile.journeyStage === "string" ? profile.journeyStage.trim() : "";
  const stageTags = stageAliases[stage.toLowerCase()] || [];
  if (stage && Array.isArray(item.journeyStages) && stageTags.some((tag) => item.journeyStages.includes(tag))) {
    matches.push({ field: "journeyStage", label: "journey stage", value: stage });
  }
  const universityId = universityIdFor(profile.university);
  if (universityId && Array.isArray(item.universityIds) && item.universityIds.includes(universityId)) {
    matches.push({ field: "university", label: "university", value: profile.university.trim() });
  }
  const itemTopics = Array.isArray(item.topics) ? item.topics : [];
  const matchedTopics = (Array.isArray(profile.topics) ? profile.topics : []).filter((topic) => (topicAliases[topic] || [topic]).some((alias) => itemTopics.includes(alias)));
  if (matchedTopics.length) matches.push({ field: "topics", label: "saved topics", value: matchedTopics.map(topicLabel).join(", ") });
  if (!matches.length) return null;
  const list = matches.map((match) => `${match.label} (${match.value})`);
  const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0];
  return {
    label: "May be relevant to you",
    matches,
    explanation: `Matched on your ${joined}. This is an informational match based on the update's tags. It does not mean the update legally applies to you. Confirm with your designated school official or the official source.`,
  };
}
