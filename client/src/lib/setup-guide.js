// "Set up in five minutes": which first steps the student has taken, worked out from what they have entered.
export function setupSteps({ profile = {}, dates = [], contacts = [], tasks = [], consent } = {}) {
  const has = (value) => typeof value === "string" && value.trim().length > 0;
  return [
    { id: "profile", title: "Tell us about you", why: "Your visa type, university and journey stage let GlobeReady show what may be relevant.", to: "/profile", action: "Open profile", done: has(profile.visaType) && has(profile.university) && has(profile.journeyStage) },
    { id: "dates", title: "Add your key dates", why: "Passport, visa and I-20 dates are the ones that sneak up on people. You get reminders before each.", to: "/dates", action: "Add dates", done: dates.length > 0 },
    { id: "contact", title: "Save your school contact", why: "Add your DSO or international office so you can reach them quickly.", to: "/contacts", action: "Add a contact", done: contacts.some((contact) => ["dso", "international-office"].includes(contact.role)) },
    { id: "journey", title: "Pick your first steps", why: "The journey planner lists common steps. Add the ones that fit you to Tasks.", to: "/journey", action: "Open planner", done: tasks.length > 0 },
    { id: "topics", title: "Choose topics to follow", why: "Saved topics help label updates that may be relevant.", to: "/profile", action: "Choose topics", done: Array.isArray(profile.topics) && profile.topics.length > 0 },
    { id: "documents", title: "Optional: read a document on this device", why: "Turn on document reading to find exact passages in your own files. The original file is never uploaded.", to: "/documents", action: "Open documents", done: consent?.documents === true, optional: true },
  ];
}

export function setupProgress(steps) {
  const required = steps.filter((step) => !step.optional);
  const done = required.filter((step) => step.done).length;
  return { done, total: required.length, complete: done === required.length, next: steps.find((step) => !step.done && !step.optional) || null };
}
