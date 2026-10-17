export const newsTopicLabels = Object.freeze({
  status: "Visa",
  employment: "Work authorization",
  "travel-entry": "Travel",
  "taxes-social-security": "Tax",
  university: "University",
});

export function newsTopicLabel(topic) {
  return newsTopicLabels[topic] || String(topic || "").replaceAll("-", " ");
}
