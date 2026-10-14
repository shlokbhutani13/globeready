import general from "../assets/news/general.svg";
import employment from "../assets/news/employment.svg";
import travel from "../assets/news/travel-entry.svg";
import forms from "../assets/news/forms-fees.svg";
import status from "../assets/news/status.svg";
import taxes from "../assets/news/taxes-social-security.svg";
import campus from "../assets/news/campus-life.svg";
import emergency from "../assets/news/emergency.svg";
import university from "../assets/news/university.svg";

// Every illustration is an original GlobeReady drawing bundled with the app. Nothing is fetched from another site, no
// agency seal or logo is used, and no photograph is reproduced, so there is no third-party copyright to clear and no
// image request reveals what a student reads.
const byTopic = {
  status, employment, "travel-entry": travel, "forms-fees": forms, "taxes-social-security": taxes, "campus-life": campus, emergency, university,
};
const aliases = { travel: "travel-entry", forms: "forms-fees", fees: "forms-fees", taxes: "taxes-social-security", "social-security": "taxes-social-security", campus: "campus-life", opt: "employment", work: "employment" };
export const imageCredit = "Illustration by GlobeReady. It is not an official image.";

export function topicImage(topic) {
  const key = aliases[topic] || topic;
  return byTopic[key] || null;
}

export function newsImageFor(item = {}) {
  // A story may name its own picture, but only a file served from this site; an outside address is ignored.
  if (typeof item.image?.url === "string" && item.image.url.startsWith("/") && !item.image.url.startsWith("//") && item.image.alt) return { ...item.image, credit: item.image.credit || imageCredit };
  const topics = Array.isArray(item.topics) ? item.topics : [];
  for (const topic of topics) {
    const url = topicImage(topic);
    if (url) return { url, alt: `${String(topic).replace(/-/g, " ")} illustration`, credit: imageCredit };
  }
  return { url: general, alt: `${topics[0] ? String(topics[0]).replace(/-/g, " ") : "General update"} illustration`, credit: imageCredit };
}
