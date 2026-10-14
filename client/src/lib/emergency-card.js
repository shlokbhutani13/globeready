import { contactRoleLabels } from "../pages/ContactsPage";

// An emergency information card. Everything on it is typed by the student or picked from their own Contacts, and nothing
// goes on the card unless they tick it. The text is kept in this browser only. Producing the card is an explicit
// download, print or copy; nothing is shared or uploaded.
export const cardFields = [
  { id: "fullName", label: "Full name", section: "About me", max: 120 },
  { id: "allergies", label: "Allergies", section: "Health", max: 300, long: true },
  { id: "medicalNotes", label: "Medical notes and medications", section: "Health", max: 500, long: true },
  { id: "insuranceProvider", label: "Health insurance company", section: "Insurance", max: 120 },
  { id: "insuranceMemberId", label: "Insurance member or policy number", section: "Insurance", max: 60, sensitive: true },
  { id: "insurancePhone", label: "Insurance phone number", section: "Insurance", max: 40 },
  { id: "embassyName", label: "Embassy or consulate", section: "Embassy", max: 120 },
  { id: "embassyPhone", label: "Embassy or consulate phone", section: "Embassy", max: 40 },
  { id: "campusSafetyPhone", label: "Campus safety phone", section: "Campus", max: 40 },
  { id: "campusNote", label: "Campus emergency notes (for example, a meeting point)", section: "Campus", max: 200 },
];
export const cardOptions = [
  { id: "university", label: "My university name" },
  { id: "usNumber", label: "A line saying 911 is the U.S. emergency number" },
];
export const maxContacts = 8;
const key = (scope) => `globeready:emergency-card:v1:${scope || "anon"}`;
const empty = () => ({ values: {}, include: {}, options: {}, contactIds: [] });
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function cleanCard(value) {
  const out = empty();
  if (!value || typeof value !== "object") return out;
  for (const field of cardFields) {
    const v = text(value.values?.[field.id], field.max);
    if (v) out.values[field.id] = v;
    if (value.include?.[field.id] === true) out.include[field.id] = true;
  }
  for (const option of cardOptions) if (value.options?.[option.id] === true) out.options[option.id] = true;
  out.contactIds = [...new Set(Array.isArray(value.contactIds) ? value.contactIds.filter((id) => typeof id === "string" && id.length < 80) : [])].slice(0, maxContacts);
  return out;
}
export function loadCard(storage, scope) { try { return cleanCard(JSON.parse(storage?.getItem(key(scope)) || "null")); } catch { return empty(); } }
export function saveCard(storage, scope, card) {
  const clean = cleanCard(card);
  try { storage.setItem(key(scope), JSON.stringify(clean)); } catch { throw new Error("This browser would not save your card. Private browsing can block it."); }
  return clean;
}
export function clearCard(storage, scope) { try { storage?.removeItem(key(scope)); } catch { /* ignore */ } }

export const setValue = (card, id, value) => ({ ...card, values: { ...card.values, [id]: value } });
export const setInclude = (card, id, on) => ({ ...card, include: { ...card.include, [id]: on } });
export const setOption = (card, id, on) => ({ ...card, options: { ...card.options, [id]: on } });
export function toggleContact(card, id) {
  if (card.contactIds.includes(id)) return { ...card, contactIds: card.contactIds.filter((value) => value !== id) };
  if (card.contactIds.length >= maxContacts) throw new Error(`A card can list up to ${maxContacts} contacts.`);
  return { ...card, contactIds: [...card.contactIds, id] };
}

export function buildCard({ card, profile = {}, contacts = [], now = new Date() } = {}) {
  const sections = [];
  const header = { title: "Emergency information", prepared: [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-") };
  const add = (heading, lines) => { if (lines.length) sections.push({ heading, lines }); };
  const chosen = (section) => cardFields.filter((field) => field.section === section && card.include[field.id] && card.values[field.id]).map((field) => `${field.label}: ${card.values[field.id]}`);
  add("About me", [...chosen("About me"), ...(card.options.university && profile.university ? [`University: ${profile.university}`] : [])]);
  add("Health", chosen("Health"));
  add("Insurance", chosen("Insurance"));
  add("Contacts", contacts.filter((contact) => card.contactIds.includes(contact.id)).map((contact) => [`${contact.name} (${contactRoleLabels[contact.role] || "Contact"})`, contact.phone, contact.email].filter(Boolean).join("; ")));
  add("Embassy", chosen("Embassy"));
  add("Campus", [...chosen("Campus"), ...(card.options.usNumber ? ["In the United States, call 911 for emergencies."] : [])]);
  return { header, sections, empty: sections.length === 0, notice: "Written by the student. Not a medical record or an official document." };
}
export function cardText(built) {
  const lines = [built.header.title, `Prepared ${built.header.prepared}`, built.notice];
  for (const section of built.sections) lines.push("", section.heading.toUpperCase(), ...section.lines.map((line) => `- ${line}`));
  return lines.join("\n");
}
export const cardFileName = (built) => `emergency-card-${built.header.prepared}.txt`;
