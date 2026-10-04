import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { beforeAll, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createAssistant } from "../src/assistant.js";
import { createDocumentAssistant } from "../src/document-assistant.js";
import { createDocumentIndexer } from "../src/document-index.js";
import { createLocalOcr } from "../src/ocr.js";
import { sanitizeModelAnswer } from "../src/gemini.js";
import { createDemoStore } from "../src/store.js";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/documents/${name}`, import.meta.url));
const fixtureBytes = (name) => new Uint8Array(readFileSync(fixture(name)));

function fakeBucket() {
  const files = new Map();
  return {
    files,
    put(path, bytes, contentType, size) {
      files.set(path, { bytes, contentType, size: size ?? bytes.byteLength });
    },
    file(path) {
      return {
        async getMetadata() {
          const entry = files.get(path);
          return [{ size: String(entry.size), contentType: entry.contentType }];
        },
        async download() {
          return [Buffer.from(files.get(path).bytes)];
        },
      };
    },
  };
}

describe("launch journeys across the real API, storage pipeline, and assistant", () => {
  const store = createDemoStore();
  const bucket = fakeBucket();
  const indexer = createDocumentIndexer({ store, bucket, ocr: createLocalOcr() });
  const documentAssistant = createDocumentAssistant({
    fallback: createAssistant(),
    store,
    generateAnswer: async ({ chunks }) => sanitizeModelAnswer({
      answer: `From ${chunks[0].documentName}: ${chunks[0].text.slice(0, 120)}`,
      confidence: "medium",
    }),
  });
  const assistant = {
    mode: "live",
    async indexDocument({ uid, document }) {
      const { chunkCount } = await indexer.index({ uid, document });
      return { summary: `${document.name} is indexed`, chunkCount, mode: "live" };
    },
    answer: (input) => documentAssistant.answer(input),
    analyzeDocument: async ({ document }) => createAssistant().analyzeDocument({ document }),
  };
  const app = createApp({ store, auth: null, assistant, adminUids: ["admin-1"] });
  const as = (method, path, uid = "student-a") => request(app)[method](path).set("x-demo-user", uid);

  const ids = {};

  beforeAll(async () => {
    const record = async (uid, label, name, fixtureName, contentType, size) => {
      const path = `users/${uid}/documents/${label}/${name}`;
      const created = await store.documents.create(uid, { name, storagePath: path, contentType, analysisStatus: "not_requested" });
      bucket.put(path, fixtureBytes(fixtureName), contentType, size);
      ids[label] = created.id;
      return created;
    };
    await record("student-a", "i20", "I-20.pdf", "multipage.pdf", "application/pdf");
    await record("student-a", "scan", "scan.pdf", "scanned.pdf", "application/pdf");
    await record("student-a", "passport", "passport.png", "passport.png", "image/png");
    await record("student-a", "injected", "notes.pdf", "injection.pdf", "application/pdf");
    await record("student-a", "html", "page.html", "multipage.pdf", "text/html");
    await record("student-a", "huge", "huge.pdf", "multipage.pdf", "application/pdf", 11 * 1024 * 1024);
    await record("student-b", "lease", "lease.pdf", "multipage.pdf", "application/pdf");
  }, 120_000);

  describe("1. authentication and forged identity", () => {
    test("rejects a request with no identity", async () => {
      await request(app).get("/api/profile").expect(401);
    });

    test("ignores a claimed user header and acts only as the verified demo identity", async () => {
      await as("get", "/api/tasks", "student-b").set("x-user-id", "student-a").expect(200);
      expect(await store.tasks.list("student-a")).toEqual([]);
    });
  });

  describe("2. profile, university, and preferences", () => {
    test("saves a profile with a university ID and an official .edu domain that stays pending", async () => {
      await as("put", "/api/profile").send({
        fullName: "Maya Singh", university: "UNC Chapel Hill", universityId: "unc-chapel-hill",
        officialUniversityDomain: "unc.edu", timeZone: "America/New_York",
      }).expect(200);

      const coverage = await as("get", "/api/news/university-coverage?universityId=unc-chapel-hill").expect(200);
      expect(coverage.body.data.state).toBe("verification-pending");
    });

    test("rejects a look-alike domain a student might try to pass off as their university", async () => {
      await as("put", "/api/profile", "student-b").send({
        universityId: "unc-chapel-hill", officialUniversityDomain: "unc.edu.attacker.example",
      }).expect(422);
      await as("put", "/api/profile", "student-b").send({
        universityId: "unc-chapel-hill", officialUniversityDomain: "localhost",
      }).expect(422);
    });

    test("saves topic preferences and rejects an unknown topic", async () => {
      await as("put", "/api/news/preferences").send({ topics: ["status", "employment"] }).expect(200);
      await as("put", "/api/news/preferences").send({ topics: ["not-a-topic"] }).expect(422);
      const prefs = await as("get", "/api/news/preferences").expect(200);
      expect(prefs.body.data.topics).toEqual(["status", "employment"]);
    });
  });

  describe("3. updates feed, save, and source freshness", () => {
    test("shows only publishable items, saves and unsaves them per student, and reports freshness", async () => {
      const { item } = await store.news.upsert("source:journey", {
        sourceId: "federal-register", title: "Student status notice", publisher: "Federal Register",
        canonicalUrl: "https://www.federalregister.gov/documents/1", contentHash: "b".repeat(64),
        sourceVerified: true, editorialState: "published-source-only", legalState: "final", urgency: "high",
        topics: ["status"], visaTypes: ["f-1"], universityIds: [], publishedAt: "2026-09-12",
        normalizedText: "private text that must never be public", classifierExplanation: "private reasoning",
      });

      const feed = await as("get", "/api/news").expect(200);
      expect(feed.body.data.items.map((entry) => entry.id)).toContain(item.id);
      expect(JSON.stringify(feed.body)).not.toMatch(/private text|classifierExplanation|contentHash/);
      expect(feed.body.data.sourceHealth).toHaveProperty("state");

      await as("post", `/api/news/${item.id}/save`).expect(201);
      await as("delete", `/api/news/${item.id}/save`, "student-b").expect(404);
      await as("delete", `/api/news/${item.id}/save`).expect(204);
    });

    test("tells the student when a verified source's last check failed", async () => {
      await store.newsSources.upsert("uni-delayed", {
        publisher: "Campus ISSS", universityId: "uni-delayed", verified: true, enabled: true,
        consecutiveFailures: 2, lastCheckedAt: "2026-10-01T00:00:00Z",
      });
      const feed = await as("get", "/api/news", "student-b").expect(200);
      expect(feed.body.data.sourceHealth.state).toBe("delayed");
    });
  });

  describe("4. tasks, deadlines, and reminders", () => {
    test("creates, edits, and completes a task, and reminds once for an overdue task only", async () => {
      const created = await as("post", "/api/tasks").send({ title: "Pay SEVIS fee", dueDate: "2000-01-01", priority: "high" }).expect(201);
      const taskId = created.body.data.id;

      const first = await as("post", "/api/notifications/sync").expect(200);
      expect(first.body.data.map((entry) => entry.taskId)).toContain(taskId);
      const second = await as("post", "/api/notifications/sync").expect(200);
      expect(second.body.data).toHaveLength(0);

      await as("patch", `/api/tasks/${taskId}`, "student-b").send({ completed: true }).expect(404);
      await as("patch", `/api/tasks/${taskId}`).send({ completed: true }).expect(200);
    });

    test("never reminds a student about another student's task", async () => {
      await as("post", "/api/tasks", "student-b").send({ title: "B overdue", dueDate: "2000-01-01" }).expect(201);
      await as("post", "/api/notifications/sync").expect(200);
      const aNotifications = await store.notifications.list("student-a");
      expect(aNotifications.every((entry) => entry.title.indexOf("B overdue") === -1)).toBe(true);
    });
  });

  describe("5. document upload, extraction, and retry", () => {
    test("indexes a multi-page PDF with page references", async () => {
      const response = await as("post", `/api/documents/${ids.i20}/index`).expect(200);
      expect(response.body.data.chunkCount).toBeGreaterThan(0);
      const chunks = await store.ragChunks.list("student-a", { documentId: ids.i20 });
      expect(new Set(chunks.map((chunk) => chunk.page))).toEqual(new Set([1, 2, 3]));
    });

    test("another student cannot index or read this student's document", async () => {
      await as("post", `/api/documents/${ids.i20}/index`, "student-b").expect(404);
      await as("post", `/api/documents/${ids.lease}/index`, "student-a").expect(404);
    });

    test("a scanned PDF is kept, marked failed with a safe reason, and can be retried", async () => {
      const failed = await as("post", `/api/documents/${ids.scan}/index`).expect(422);
      expect(failed.body.error.code).toBe("no_readable_text");
      const docs = (await as("get", "/api/documents").expect(200)).body.data;
      const scan = docs.find((doc) => doc.id === ids.scan);
      expect(scan.analysisStatus).toBe("index_failed");
      expect(scan.analysisError.code).toBe("no_readable_text");
      await as("post", `/api/documents/${ids.scan}/index`).expect(422);
    });

    test("a PNG photo of a document is read through local OCR", async () => {
      const response = await as("post", `/api/documents/${ids.passport}/index`).expect(200);
      expect(response.body.data.chunkCount).toBeGreaterThan(0);
    }, 60_000);

    test("refuses an unsupported stored type and an oversized stored object", async () => {
      const html = await as("post", `/api/documents/${ids.html}/index`).expect(422);
      expect(html.body.error.code).toBe("unsupported_document_type");
      const huge = await as("post", `/api/documents/${ids.huge}/index`).expect(422);
      expect(huge.body.error.code).toBe("document_too_large");
    });
  });

  describe("6. grounded assistant, citations, and conversations", () => {
    let conversationId;

    test("answers a document question with a citation to the real page", async () => {
      const response = await as("post", "/api/assistant").send({
        question: "How long is my travel signature?", documentId: ids.i20,
      }).expect(200);
      expect(response.body.data.evidence).toBe("grounded");
      expect(response.body.data.documentCitations[0]).toMatchObject({ documentName: "I-20.pdf", page: 2 });
      conversationId = response.body.data.conversationId;
    });

    test("states insufficient evidence instead of inventing an answer", async () => {
      const response = await as("post", "/api/assistant").send({
        question: "When does my lease end?", documentId: ids.i20, conversationId,
      }).expect(200);
      expect(response.body.data.evidence).toBe("insufficient");
      expect(response.body.data.documentCitations).toEqual([]);
    });

    test("routes a deportation question to an attorney without a legal conclusion", async () => {
      const response = await as("post", "/api/assistant").send({
        question: "Can I be deported after overstaying my visa?", conversationId,
      }).expect(200);
      expect(response.body.data.referral.message).toMatch(/attorney/i);
    });

    test("treats instruction-like text inside an uploaded PDF as document content, not as an instruction", async () => {
      await as("post", `/api/documents/${ids.injected}/index`).expect(200);
      const response = await as("post", "/api/assistant").send({
        question: "What does my notes document say about the travel signature?", documentId: ids.injected,
      }).expect(200);
      expect(response.body.data.documentCitations[0]).toMatchObject({ documentName: "notes.pdf", page: 1 });
      expect(response.body.data.documentCitations[0].page).not.toBe(99);
    });

    test("a student cannot use another student's document ID to retrieve content", async () => {
      const response = await as("post", "/api/assistant", "student-b").send({
        question: "How long is my travel signature?", documentId: ids.i20,
      }).expect(200);
      expect(response.body.data.evidence).toBe("insufficient");
      expect(response.body.data.documentCitations).toEqual([]);
    });

    test("keeps conversation history per student and hides it from everyone else", async () => {
      const mine = await as("get", `/api/assistant/conversations/${conversationId}/messages`).expect(200);
      expect(mine.body.data.some((message) => message.documentCitations?.length > 0)).toBe(true);
      await as("get", `/api/assistant/conversations/${conversationId}/messages`, "student-b").expect(404);
      await as("post", "/api/assistant", "student-b").send({ question: "Follow up on that", conversationId }).expect(404);
      const bobConversations = (await as("get", "/api/assistant/conversations", "student-b").expect(200)).body.data;
      expect(bobConversations.map((conversation) => conversation.id)).not.toContain(conversationId);
    });
  });

  describe("7. export and deletion", () => {
    test("exports only the requesting student's data, including their own extracted text", async () => {
      const response = await as("get", "/api/account/export").expect(200);
      const text = JSON.stringify(response.body);
      expect(text).toContain("travel signature valid until May 2031");
      expect(text).not.toContain("lease.pdf");
      expect(text).not.toMatch(/embedding|storagePath/);
    });

    test("deleting one student removes their data and leaves another student's data untouched", async () => {
      await as("delete", "/api/account").send({ confirmation: "DELETE MY ACCOUNT" }).expect(200);
      expect(await store.documents.list("student-a")).toEqual([]);
      expect(await store.ragChunks.list("student-a")).toEqual([]);
      expect(await store.conversations.list("student-a")).toEqual([]);
      expect(await store.documents.list("student-b")).toHaveLength(1);
    });
  });

  describe("8. administrative review", () => {
    test("a student cannot reach the review queue, and an administrator can", async () => {
      await as("get", "/api/admin/news/review", "student-b").expect(403);
      await as("patch", "/api/admin/news/review/nonexistent", "student-b").send({ decision: "approve" }).expect(403);
      await as("get", "/api/admin/news/review", "admin-1").expect(200);
    });
  });
});
