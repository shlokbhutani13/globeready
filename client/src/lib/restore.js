import {
  maxContacts, maxPlannerCustom, maxPlannerHave, validContact, validPlanner, validProfileFields, validResource, validTask, validTrackedDate,
} from "./zero-cost-data";

// Restores GlobeReady's own export file. Nothing is written until the student confirms a preview, existing records are
// never overwritten or deleted, and the file must belong to the signed-in account.
export const maxRestoreBytes = 10 * 1024 * 1024;
export const restoreLimits = { tasks: 2_000, savedResources: 500, savedNews: 1_000, trackedDates: 200, contacts: maxContacts, planner: 2 };
const newsIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const sections = ["tasks", "savedResources", "savedNews", "trackedDates", "contacts", "planner"];

const fail = (error) => ({ ok: false, error });
const norm = (value) => String(value ?? "").trim().toLowerCase();

export function planRestore(text, { uid, existing = {} } = {}) {
  if (typeof text !== "string") return fail("The file is empty.");
  if (new TextEncoder().encode(text).length > maxRestoreBytes) return fail("The file is larger than 10 MB, the size of the largest export GlobeReady creates.");
  if (!text.trim()) return fail("The file is empty.");
  let archive;
  try { archive = JSON.parse(text); } catch { return fail("This is not a valid GlobeReady export (the file is not JSON)."); }
  if (!archive || typeof archive !== "object" || Array.isArray(archive)) return fail("This is not a valid GlobeReady export.");
  if (archive.schemaVersion !== 2) return fail("This export version is not supported. Use an export made by the current GlobeReady beta.");
  if (typeof archive.uid !== "string" || !uid || archive.uid !== uid) return fail("This export belongs to a different account, so it cannot be restored here. Sign in to the account it came from.");
  for (const section of sections) {
    if (archive[section] === undefined) continue;
    if (!Array.isArray(archive[section])) return fail(`The "${section}" section is not a list.`);
    if (archive[section].length > restoreLimits[section]) return fail(`The "${section}" section has more than ${restoreLimits[section]} records, more than the free beta stores.`);
  }

  const plan = { ok: true, add: { tasks: [], savedResources: [], savedNews: [], trackedDates: [], contacts: [], planner: [] }, duplicates: 0, invalid: [], capped: [], notRestored: [], profileFill: {} };
  const invalid = (section, index, error) => plan.invalid.push({ section, index, reason: error.message || String(error) });

  const have = {
    tasks: new Set((existing.tasks || []).map((task) => `${norm(task.title)}|${task.dueDate || ""}`)),
    savedResources: new Set((existing.savedResources || []).map((item) => item.url)),
    savedNews: new Set(existing.savedNews || []),
    trackedDates: new Set((existing.trackedDates || []).map((entry) => `${entry.kind}|${entry.date}|${norm(entry.label)}`)),
    contacts: new Set((existing.contacts || []).map((entry) => `${norm(entry.name)}|${entry.role}|${norm(entry.email)}|${norm(entry.phone)}`)),
  };
  const take = (section, key, value) => {
    if (have[section].has(key)) { plan.duplicates += 1; return; }
    have[section].add(key);
    plan.add[section].push(value);
  };

  (archive.tasks || []).forEach((record, index) => {
    try {
      const task = validTask(record);
      take("tasks", `${norm(task.title)}|${task.dueDate}`, { ...task, completed: record?.completed === true });
    } catch (error) { invalid("tasks", index, error); }
  });
  (archive.savedResources || []).forEach((record, index) => {
    try { const resource = validResource(record); take("savedResources", resource.url, resource); } catch (error) { invalid("savedResources", index, error); }
  });
  (archive.savedNews || []).forEach((record, index) => {
    const id = record?.newsItemId ?? record?.id;
    if (typeof id !== "string" || !newsIdPattern.test(id)) { invalid("savedNews", index, new Error("Saved update id is invalid.")); return; }
    take("savedNews", id, id);
  });
  (archive.trackedDates || []).forEach((record, index) => {
    try { const entry = validTrackedDate(record); take("trackedDates", `${entry.kind}|${entry.date}|${norm(entry.label)}`, entry); } catch (error) { invalid("trackedDates", index, error); }
  });
  (archive.contacts || []).forEach((record, index) => {
    try { const contact = validContact(record); take("contacts", `${norm(contact.name)}|${contact.role}|${norm(contact.email)}|${norm(contact.phone)}`, contact); } catch (error) { invalid("contacts", index, error); }
  });

  // Free-beta bounds: contacts cap at 50 in total, counting the contacts already saved.
  const room = Math.max(0, maxContacts - (existing.contacts || []).length);
  if (plan.add.contacts.length > room) { plan.capped.push({ section: "contacts", skipped: plan.add.contacts.length - room }); plan.add.contacts = plan.add.contacts.slice(0, room); }

  // Planner progress merges as a union with what is already saved; it never removes progress.
  for (const record of archive.planner || []) {
    const id = record?.id;
    if (!["journey", "travel"].includes(id)) { invalid("planner", 0, new Error("Unknown planner list.")); continue; }
    try {
      const incoming = validPlanner(record);
      const current = existing.planner?.[id] || { have: [], custom: [] };
      const customIds = new Set((current.custom || []).map((item) => item.id));
      const mergedHave = [...new Set([...(current.have || []), ...incoming.have])];
      const mergedCustom = [...(current.custom || []), ...incoming.custom.filter((item) => !customIds.has(item.id))];
      if (mergedHave.length > maxPlannerHave || mergedCustom.length > maxPlannerCustom) throw new Error("Merged checklist would exceed the free beta's limits.");
      const changed = mergedHave.length !== (current.have || []).length || mergedCustom.length !== (current.custom || []).length;
      if (changed) plan.add.planner.push({ id, have: mergedHave, custom: mergedCustom });
      else plan.duplicates += 1;
    } catch (error) { invalid("planner", 0, error); }
  }

  // Profile: only blank fields are filled; anything already entered is kept.
  if (archive.profile && typeof archive.profile === "object") {
    try {
      const incoming = validProfileFields(Object.fromEntries(Object.entries(archive.profile).filter(([key]) => !["consent", "updatedAt", "timeZone"].includes(key))));
      for (const [key, value] of Object.entries(incoming)) {
        const present = existing.profile?.[key];
        const blank = present === undefined || present === "" || (Array.isArray(present) && present.length === 0);
        if (blank && value !== "" && !(Array.isArray(value) && value.length === 0)) plan.profileFill[key] = value;
      }
    } catch (error) { invalid("profile", 0, error); }
  }

  if (Array.isArray(archive.documents) && archive.documents.length) plan.notRestored.push(`${archive.documents.length} document${archive.documents.length === 1 ? "" : "s"} of extracted text. Add the original files again so they are read on your device with your current consent.`);
  if (archive.profile?.consent) plan.notRestored.push("Privacy choices. Review them in Settings.");

  const added = plan.add;
  const writes = added.tasks.length + added.tasks.filter((task) => task.completed).length + added.savedResources.length + added.savedNews.length
    + added.trackedDates.length + added.contacts.length + added.planner.length + (Object.keys(plan.profileFill).length ? 1 : 0);
  plan.writes = writes;
  plan.counts = Object.fromEntries(Object.entries(added).map(([key, list]) => [key, list.length]));
  plan.nothingToRestore = writes === 0;
  return plan;
}

// Applies a confirmed plan. Records are only ever added; a failure stops the run and reports what already finished.
export async function applyRestore(plan, store, { onProgress = () => {}, concurrency = 8 } = {}) {
  if (!plan?.ok) throw new Error("There is no valid restore plan to apply.");
  const jobs = [];
  for (const task of plan.add.tasks) {
    jobs.push(async () => {
      const created = await store.createTask(task);
      if (task.completed) await store.toggleTask({ id: created.id, completed: false });
    });
  }
  plan.add.savedResources.forEach((resource) => jobs.push(() => store.saveResource(resource)));
  plan.add.savedNews.forEach((id) => jobs.push(() => store.saveNews(id)));
  plan.add.trackedDates.forEach((entry) => jobs.push(() => store.createTrackedDate(entry)));
  plan.add.contacts.forEach((contact) => jobs.push(() => store.createContact(contact, 0)));
  plan.add.planner.forEach((entry) => jobs.push(() => store.savePlanner(entry.id, entry)));
  if (Object.keys(plan.profileFill).length) jobs.push(() => store.saveProfile(plan.profileFill));

  let done = 0;
  let next = 0;
  let failure = null;
  const worker = async () => {
    while (!failure && next < jobs.length) {
      const job = jobs[next]; next += 1;
      try { await job(); done += 1; onProgress({ done, total: jobs.length }); } catch (error) { failure = error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  if (failure) throw Object.assign(new Error(`Restore stopped after ${done} of ${jobs.length} items (${failure.message}). Items already restored were kept. Running the restore again skips them.`), { done, total: jobs.length });
  return { done, total: jobs.length };
}
