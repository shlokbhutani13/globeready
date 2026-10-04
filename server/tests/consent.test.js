import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { consentVersion } from "../src/consent.js";
import { createGeminiAssistant } from "../src/gemini.js";
import { createUnavailableAssistant } from "../src/assistant.js";
import { createLogger } from "../src/logger.js";
import { createDemoStore } from "../src/store.js";
import { createReminderService } from "../src/reminders.js";

const as = "student-a";
const yes = { version: consentVersion, documents: true, aiGeneration: false };

function indexingApp(store) {
  const assistant = {
    mode: "live",
    indexDocument: vi.fn(async () => ({ chunkCount: 1 })),
    answer: vi.fn(async () => ({ answer: "", evidence: "retrieved", documentCitations: [], sources: [] })),
    analyzeDocument: vi.fn(async () => ({})),
  };
  return { assistant, app: createApp({ store, auth: null, demoMode: true, assistant }) };
}

async function withDocument(store) {
  return store.documents.create(as, {
    name: "i20.pdf", contentType: "application/pdf", storagePath: `users/${as}/documents/d1/i20.pdf`,
  });
}

describe("consent is recorded, versioned, and visible to the student", () => {
  test("a new student has no consent, and the wording is returned with the status", async () => {
    const app = createApp({ store: createDemoStore(), auth: null, demoMode: true });
    const response = await request(app).get("/api/consent").set("x-demo-user", as).expect(200);
    expect(response.body.data).toMatchObject({ documents: false, aiGeneration: false, current: false, version: consentVersion });
    expect(response.body.data.text.documents).toMatch(/reads the documents/);
    expect(response.body.data.text.aiGeneration).toMatch(/Optional/);
  });

  test("a choice needs the current version, and an extra field is refused", async () => {
    const app = createApp({ store: createDemoStore(), auth: null, demoMode: true });
    await request(app).put("/api/consent").set("x-demo-user", as).send({ documents: true, version: "2020-01-01" }).expect(422);
    await request(app).put("/api/consent").set("x-demo-user", as).send({ ...yes, admin: true }).expect(422);
    await request(app).put("/api/consent").set("x-demo-user", as).send({ documents: "yes", version: consentVersion }).expect(422);
  });

  test("AI generation cannot be on without document reading", async () => {
    const app = createApp({ store: createDemoStore(), auth: null, demoMode: true });
    const response = await request(app).put("/api/consent").set("x-demo-user", as)
      .send({ version: consentVersion, documents: false, aiGeneration: true }).expect(200);
    expect(response.body.data).toMatchObject({ documents: false, aiGeneration: false });
  });

  test("the recorded choice is audited without its content", async () => {
    const lines = [];
    const logger = createLogger({ write: (line) => lines.push(JSON.parse(line)) });
    const app = createApp({ store: createDemoStore(), auth: null, demoMode: true, logger, auditLogger: logger.child({ channel: "audit" }) });
    await request(app).put("/api/consent").set("x-demo-user", as).send(yes).expect(200);
    const audit = lines.find((line) => line.event === "audit.consent_changed");
    expect(audit).toMatchObject({ actorUid: as, docConsent: true, aiConsent: false });
  });

  test("the export carries the consent record", async () => {
    const store = createDemoStore({ seedConsent: [as] });
    const app = createApp({ store, auth: null, demoMode: true });
    const response = await request(app).get("/api/account/export").set("x-demo-user", as).expect(200);
    expect(response.body.profile.consent).toMatchObject({ documents: true, version: consentVersion });
  });
});

describe("document reading requires consent", () => {
  test("indexing is refused without consent and the document is not read", async () => {
    const store = createDemoStore();
    const document = await withDocument(store);
    const { assistant, app } = indexingApp(store);
    const response = await request(app).post(`/api/documents/${document.id}/index`).set("x-demo-user", as).expect(403);
    expect(response.body.error.code).toBe("consent_required");
    expect(assistant.indexDocument).not.toHaveBeenCalled();
  });

  test("indexing proceeds once the student has consented", async () => {
    const store = createDemoStore();
    const document = await withDocument(store);
    const { assistant, app } = indexingApp(store);
    await request(app).put("/api/consent").set("x-demo-user", as).send(yes).expect(200);
    await request(app).post(`/api/documents/${document.id}/index`).set("x-demo-user", as).expect(200);
    expect(assistant.indexDocument).toHaveBeenCalledTimes(1);
  });

  test("withdrawing consent stops document reading at once", async () => {
    const store = createDemoStore();
    const document = await withDocument(store);
    const { assistant, app } = indexingApp(store);
    await request(app).put("/api/consent").set("x-demo-user", as).send(yes).expect(200);
    await request(app).put("/api/consent").set("x-demo-user", as).send({ version: consentVersion, documents: false }).expect(200);
    await request(app).post(`/api/documents/${document.id}/index`).set("x-demo-user", as).expect(403);
    expect(assistant.indexDocument).not.toHaveBeenCalled();
  });

  test("a consent recorded for an older wording does not count", async () => {
    const store = createDemoStore();
    await store.profiles.set(as, { consent: { version: "2025-01-01", documents: true, aiGeneration: true } });
    const document = await withDocument(store);
    const { app } = indexingApp(store);
    await request(app).post(`/api/documents/${document.id}/index`).set("x-demo-user", as).expect(403);
  });

  test("the assistant does not read any document text without consent", async () => {
    const store = createDemoStore();
    const list = vi.spyOn(store.ragChunks, "list");
    const assistant = createGeminiAssistant({ bucket: {}, store, fallback: createUnavailableAssistant(), timeoutMs: 1000 });
    const app = createApp({ store, auth: null, demoMode: true, assistant });
    const response = await request(app).post("/api/assistant").set("x-demo-user", as)
      .send({ question: "How long is my travel signature valid?" }).expect(200);
    expect(response.body.data.evidence).toBe("consent_required");
    expect(list).not.toHaveBeenCalled();
  });

  test("a document-scoped question is refused outright without consent", async () => {
    const store = createDemoStore();
    const document = await withDocument(store);
    const app = createApp({ store, auth: null, demoMode: true });
    const response = await request(app).post("/api/assistant").set("x-demo-user", as)
      .send({ question: "How long is my travel signature valid?", documentId: document.id }).expect(403);
    expect(response.body.error.code).toBe("consent_required");
  });
});

describe("AI generation requires its own consent", () => {
  test("with reading consent but no AI consent, the model is never called and passages are shown", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace(as, "doc", [{ index: 0, page: 2, documentName: "I-20.pdf", text: "A travel signature is valid for one year from signing." }]);
    const client = { models: { generateContent: vi.fn(async () => ({ text: "{}" })), embedContent: vi.fn() } };
    const assistant = createGeminiAssistant({ bucket: {}, store, fallback: createUnavailableAssistant(), client, timeoutMs: 1000 });
    const app = createApp({ store, auth: null, demoMode: true, assistant });
    await request(app).put("/api/consent").set("x-demo-user", as).send({ ...yes, aiGeneration: false }).expect(200);

    const response = await request(app).post("/api/assistant").set("x-demo-user", as)
      .send({ question: "How long is the travel signature valid?" }).expect(200);
    expect(client.models.generateContent).not.toHaveBeenCalled();
    expect(response.body.data.evidence).toBe("retrieved");
    expect(response.body.data.notice).toMatch(/AI answer generation is off/);
    expect(response.body.data.documentCitations[0]).toMatchObject({ page: 2 });
  });

  test("with AI consent, the model is called", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace(as, "doc", [{ index: 0, page: 2, documentName: "I-20.pdf", text: "A travel signature is valid for one year from signing." }]);
    const client = { models: { generateContent: vi.fn(async () => ({ text: JSON.stringify({ answer: "One year." }) })), embedContent: vi.fn() } };
    const assistant = createGeminiAssistant({ bucket: {}, store, fallback: createUnavailableAssistant(), client, timeoutMs: 1000 });
    const app = createApp({ store, auth: null, demoMode: true, assistant });
    await request(app).put("/api/consent").set("x-demo-user", as).send({ ...yes, aiGeneration: true }).expect(200);
    const response = await request(app).post("/api/assistant").set("x-demo-user", as)
      .send({ question: "How long is the travel signature valid?" }).expect(200);
    expect(client.models.generateContent).toHaveBeenCalledTimes(1);
    expect(response.body.data.evidence).toBe("grounded");
  });
});

describe("reminders for a rescheduled task", () => {
  test("moving a task's due date earns a new reminder, and the same date never repeats", async () => {
    const store = createDemoStore();
    const task = await store.tasks.create(as, { title: "Submit form", dueDate: "2026-08-01", completed: false });
    const reminders = createReminderService({ store, clock: () => new Date("2026-08-01T12:00:00Z") });
    expect(await reminders.sync(as)).toHaveLength(1);
    expect(await reminders.sync(as)).toHaveLength(0);
    await store.tasks.update(as, task.id, { dueDate: "2026-07-30" });
    expect(await reminders.sync(as)).toHaveLength(1);
  });
});
