// Pre-travel checklist. Items are reminders to check, not statements about what any border officer will require.
export const travelSections = [
  { id: "passport", label: "Passport", items: [
    ["passport-valid", "Passport is valid for the length of my trip and my planned return"],
    ["passport-copy", "I have a photocopy or secure scan of my passport photo page stored separately"],
  ] },
  { id: "visa", label: "Visa and entry", items: [
    ["visa-valid", "Visa is valid for re-entry, or I know how my school says to handle it"],
    ["visa-appointment", "I checked the consulate's current wait times if I need a new visa"],
  ] },
  { id: "documents", label: "School and program documents", items: [
    ["docs-i20", "I carry my current I-20 or DS-2019 (original)"],
    ["docs-enrollment", "I have proof of enrollment and financial support from my school"],
  ] },
  { id: "signature", label: "Travel signature", items: [
    ["signature-current", "My DSO confirmed my travel signature is current for this trip"],
  ] },
  { id: "medication", label: "Medication and health", items: [
    ["med-supply", "I have enough medication for the trip, in original containers"],
    ["med-letter", "I have a doctor's letter for prescriptions I carry, if my airline or destination asks"],
    ["med-insurance", "I know how my insurance works abroad and brought my insurance card"],
  ] },
  { id: "accommodation", label: "Accommodation and money", items: [
    ["stay-address", "I saved the address of where I will stay, and my U.S. address"],
    ["stay-money", "I have a way to pay abroad and told my bank about the trip"],
  ] },
  { id: "emergency", label: "Emergency contacts", items: [
    ["emergency-dso", "I saved my DSO and international office contact details"],
    ["emergency-consulate", "I saved my country's nearest embassy or consulate details"],
    ["emergency-person", "A trusted person knows my itinerary"],
  ] },
];

export function allTravelItems(custom = []) {
  const builtIn = travelSections.flatMap((section) => section.items.map(([id, label]) => ({ id, label, section: section.id, sectionLabel: section.label })));
  const extra = custom.map((item) => ({ id: item.id, label: item.label, section: item.section || "custom", sectionLabel: "My own items", custom: true }));
  return [...builtIn, ...extra];
}
