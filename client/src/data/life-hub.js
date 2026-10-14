import { journeyItemsFor } from "./journey-templates";
import { guides } from "./guides";
import { resourceCenter } from "./resource-center";

// Arrival and daily life, organised by topic. It adds no second checklist: steps that Journey already has are reused by
// id, and the few extra steps here become ordinary tasks. Links point only to guides and resources GlobeReady already
// curates. Where there is no vetted official source (phone, transport), the page says so and points to the school.
export const lifeCategory = "Arrival and daily life";

export const lifeTopics = [
  { id: "housing", label: "Housing and move-in", blurb: "Read before you sign, document the place when you arrive, and know who to call.", journeyIds: ["gen-arrival-address", "f1-enroll-address"],
    items: [
      { id: "life-housing-lease", title: "Read the whole lease before signing and keep a copy", priority: "high" },
      { id: "life-housing-photos", title: "Photograph your room or apartment on move-in day and note any damage", priority: "medium" },
      { id: "life-housing-contact", title: "Write down who to call for repairs and when rent is due", priority: "medium" },
    ], links: [["resource", "hud-renters"], ["resource", "ftc-rental-scams"]] },
  { id: "banking", label: "Banking and money", blurb: "Compare accounts, ask what each one needs, and turn on fraud alerts.", journeyIds: ["gen-arrival-bank"],
    items: [{ id: "life-bank-alerts", title: "Set up online banking and turn on fraud alerts", priority: "medium" }],
    links: [["guide", "banking"], ["resource", "ftc-report-fraud"]], tools: [["/life/budget", "Plan your costs in Budget"]] },
  { id: "phone", label: "Phone service", blurb: "A U.S. number helps with school, banks and emergencies.", journeyIds: [],
    items: [
      { id: "life-phone-plan", title: "Compare student phone plans and check what each needs to start (ID, address, deposit)", priority: "medium" },
      { id: "life-phone-share", title: "Give your U.S. phone number to your school and save it in your Contacts", priority: "medium" },
    ], note: "GlobeReady does not compare or rate plans and has no vetted official source for this. Check your carrier's own site and your school's pages." },
  { id: "transport", label: "Getting around", blurb: "Plan how you will reach campus and daily needs.", journeyIds: [],
    items: [
      { id: "life-transport-route", title: "Work out how you will get to campus and what it costs", priority: "medium" },
      { id: "life-transport-pass", title: "Ask your school whether students get a transit pass or local ID", priority: "low" },
    ], note: "Local transit differs everywhere. Your school and city websites are the right sources.", tools: [["/university", "Find your school's pages"]] },
  { id: "health", label: "Healthcare", blurb: "Know where to go before you are sick.", journeyIds: [],
    items: [
      { id: "life-health-center", title: "Find your campus health center and how to book an appointment", priority: "high" },
      { id: "life-health-records", title: "Check which immunization records your school asks for", priority: "high" },
    ], links: [["guide", "health"], ["resource", "find-health-center"], ["resource", "cdc-vaccines"]] },
  { id: "insurance", label: "Insurance", blurb: "Confirm what your plan covers and keep the details handy.", journeyIds: ["gen-enroll-insurance", "j1-enroll-insurance"],
    items: [{ id: "life-insurance-card", title: "Keep your insurance card details where you can find them offline", priority: "medium" }],
    tools: [["/life/emergency-card", "Add them to your Emergency card"]] },
  { id: "tax", label: "Taxes and Social Security", blurb: "Learn the basics early and use official sources.", journeyIds: ["gen-post-tax"],
    items: [{ id: "life-tax-help", title: "Ask your international office about tax help for international students", priority: "medium" }],
    links: [["guide", "tax"], ["guide", "ssn"], ["resource", "irs-foreign-students"], ["resource", "irs-scam-alerts"]] },
  { id: "campus", label: "Campus setup", blurb: "The accounts and places you will use every week.", journeyIds: ["gen-arrival-docs", "gen-enroll-register", "gen-enroll-office"],
    items: [
      { id: "life-campus-accounts", title: "Activate your school email and student portal", priority: "high" },
      { id: "life-campus-map", title: "Save your campus map and where the international office is", priority: "low" },
    ], tools: [["/university", "Open your university page"], ["/prepare", "Prepare questions for the international office"]] },
  { id: "emergency", label: "Emergency preparation", blurb: "A few minutes now saves time when it matters.", journeyIds: [],
    items: [
      { id: "life-emergency-numbers", title: "Save your campus emergency number and local emergency number", priority: "high" },
      { id: "life-emergency-kit", title: "Put together a small emergency kit and learn where to go in severe weather", priority: "low" },
    ], links: [["resource", "call-911"], ["resource", "ready-gov"], ["resource", "campus-contacts"]], tools: [["/life/emergency-card", "Make an Emergency card"], ["/contacts", "Save contacts"]] },
];

export function resolveLifeLink([kind, id]) {
  if (kind === "guide") { const guide = guides.find((entry) => entry.id === id); return guide && { id: `guide:${id}`, label: guide.title, source: guide.source, url: guide.url }; }
  const resource = resourceCenter.find((entry) => entry.id === id);
  if (!resource) return null;
  const base = { id: `resource:${id}`, label: resource.title, source: resource.agency };
  if (resource.url) return { ...base, url: resource.url };
  if (resource.internal) return { ...base, to: resource.internal };
  return resource.phone ? { ...base, phone: resource.phone } : null;
}

// The steps for one topic: ones Journey already has (by id, so nothing is duplicated) plus this topic's own.
export function topicSteps(topic, visaType = "") {
  const reused = journeyItemsFor(visaType).filter((item) => topic.journeyIds.includes(item.id));
  return [...reused, ...topic.items.map((item) => ({ category: lifeCategory, ...item }))];
}
export const allLifeItems = () => lifeTopics.flatMap((topic) => topic.items.map((item) => ({ category: lifeCategory, ...item })));
