import general from "../assets/news/general.svg";
import employment from "../assets/news/employment.svg";
import travel from "../assets/news/travel-entry.svg";
import forms from "../assets/news/forms-fees.svg";

const fallbacks = { employment, "travel-entry": travel, "forms-fees": forms };
export function newsImageFor(item = {}) {
  if (item.image?.url && item.image?.alt) return item.image;
  const topic = item.topics?.[0];
  return { url: fallbacks[topic] || general, alt: `${topic ? topic.replace(/-/g, " ") : "General update"} illustration` };
}
