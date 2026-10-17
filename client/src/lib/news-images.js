import general from "../assets/news/general.svg";
import employment from "../assets/news/employment.svg";
import travel from "../assets/news/travel-entry.svg";
import forms from "../assets/news/forms-fees.svg";
import status from "../assets/news/status.svg";
import taxes from "../assets/news/taxes-social-security.svg";
import campus from "../assets/news/campus-life.svg";
import emergency from "../assets/news/emergency.svg";
import university from "../assets/news/university.svg";
import uscisSource from "../assets/news/source-uscis.svg";
import studySource from "../assets/news/source-study.svg";
import sevpSource from "../assets/news/source-sevp.svg";
import federalRegisterSource from "../assets/news/source-federal-register.svg";
import nafsaSource from "../assets/news/source-nafsa.svg";
import mitSource from "../assets/news/source-mit.svg";
import stateSource from "../assets/news/source-state.svg";

// Every illustration is an original GlobeReady drawing bundled with the app. Nothing is fetched from another site, no
// agency seal or logo is used, and no photograph is reproduced, so there is no third-party copyright to clear and no
// image request reveals what a student reads.
const byTopic = {
  status, employment, "travel-entry": travel, "forms-fees": forms, "taxes-social-security": taxes, "campus-life": campus, emergency, university,
};
const aliases = { travel: "travel-entry", forms: "forms-fees", fees: "forms-fees", taxes: "taxes-social-security", "social-security": "taxes-social-security", campus: "campus-life", opt: "employment", work: "employment" };
const bySource = Object.freeze({
  "uscis-news": uscisSource,
  "study-in-the-states": studySource,
  "ice-sevp": sevpSource,
  "federal-register": federalRegisterSource,
  "nafsa-press": nafsaSource,
  "mit-iso": mitSource,
  "state-visa-news": stateSource,
});
const sourceNames = Object.freeze({
  "uscis-news": "USCIS", "study-in-the-states": "Study in the States", "ice-sevp": "SEVP",
  "federal-register": "Federal Register", "nafsa-press": "NAFSA", "mit-iso": "MIT international office",
  "state-visa-news": "State Department visa news",
});
export const imageCredit = "Illustration by GlobeReady. It is not an official image.";

export function topicImage(topic) {
  const key = aliases[topic] || topic;
  return byTopic[key] || null;
}

export function sourceImage(sourceId) {
  return bySource[sourceId] || null;
}

export function newsImageFor(item = {}) {
  const topics = Array.isArray(item.topics) ? item.topics : [];
  const fallback = (() => {
    if (item.autoIngested && sourceImage(item.sourceId)) {
      return { url: sourceImage(item.sourceId), alt: `${sourceNames[item.sourceId] || item.publisher || "Official source"} source illustration`, credit: imageCredit };
    }
    for (const topic of topics) {
      const url = topicImage(topic);
      if (url) return { url, alt: `${String(topic).replace(/-/g, " ")} illustration`, credit: imageCredit };
    }
    return { url: general, alt: `${topics[0] ? String(topics[0]).replace(/-/g, " ") : "General update"} illustration`, credit: imageCredit };
  })();
  if (typeof item.image?.url === "string" && item.image.url.startsWith("/") && !item.image.url.startsWith("//") && item.image.alt) return { ...item.image, credit: item.image.credit || imageCredit };
  if (item.autoIngested && item.image?.alt) {
    try {
      const remote = new URL(item.image.url);
      if (remote.protocol === "https:" && !remote.username && !remote.password) return { ...item.image, remote: true, fallbackUrl: fallback.url };
    } catch { /* Use the bundled fallback for invalid source image URLs. */ }
  }
  return fallback;
}
