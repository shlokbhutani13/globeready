import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(process.cwd(), "..");

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

describe("Firebase ownership rules", () => {
  test("Firestore rules require the authenticated uid", async () => {
    const rules = await readFile(resolve(root, "firestore.rules"), "utf8");
    expect(rules).toContain("request.auth.uid == uid");
  });

  test("Firestore rules reserve RAG chunks for the trusted server", async () => {
    const rules = await readFile(resolve(root, "firestore.rules"), "utf8");
    expect(rules).toMatch(/match \/ragChunks\/\{document=\*\*\}[\s\S]*allow read, write:\s*if false/u);
  });

  test("Firestore exposes only published public news documents", async () => {
    const rules = await readFile(resolve(root, "firestore.rules"), "utf8");
    expect(rules).toMatch(/match \/newsItems\/\{newsItemId\}/u);
    expect(rules).toMatch(/resource\.data\.editorialState\s+in\s+\['published-source-only',\s*'approved'\]/u);
    expect(rules).toMatch(/allow write:\s*if false/u);
  });

  test("Firestore denies provenance, review, source-state, run, and lease collections", async () => {
    const rules = await readFile(resolve(root, "firestore.rules"), "utf8");
    for (const path of ["newsItemState", "reviewQueue", "newsSources", "newsRuns", "newsLeases"]) {
      expect(rules).toContain(`match /${path}/{document=**}`);
    }
    expect(rules).toMatch(/match \/newsItems\/\{newsItemId\}[\s\S]*?match \/\{document=\*\*\}[\s\S]*?allow read, write:\s*if false/u);
  });

  test("Firestore grants only explicit user-owned news and conversation paths", async () => {
    const rules = await readFile(resolve(root, "firestore.rules"), "utf8");
    for (const path of ["newsPreferences", "savedNews", "notifications", "conversations", "pushSubscriptions"]) {
      expect(rules).toContain(`match /${path}/`);
    }
    expect(rules).not.toContain("match /{collection}/{document=**}");
  });

  test("declares the required news and RAG vector indexes", async () => {
    const contents = await readOptional(resolve(root, "firestore.indexes.json"));
    const indexes = contents ? JSON.parse(contents).indexes : [];
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collectionGroup: "newsItems",
        queryScope: "COLLECTION",
        fields: [
          { fieldPath: "editorialState", order: "ASCENDING" },
          { fieldPath: "publishedAt", order: "DESCENDING" },
        ],
      }),
      expect.objectContaining({
        collectionGroup: "newsItems",
        fields: [
          { fieldPath: "editorialState", order: "ASCENDING" },
          { fieldPath: "urgency", order: "DESCENDING" },
          { fieldPath: "publishedAt", order: "DESCENDING" },
        ],
      }),
      expect.objectContaining({
        collectionGroup: "newsItems",
        fields: [
          { fieldPath: "topics", arrayConfig: "CONTAINS" },
          { fieldPath: "publishedAt", order: "DESCENDING" },
        ],
      }),
      expect.objectContaining({
        collectionGroup: "newsItems",
        fields: [
          { fieldPath: "universityIds", arrayConfig: "CONTAINS" },
          { fieldPath: "publishedAt", order: "DESCENDING" },
        ],
      }),
      expect.objectContaining({
        collectionGroup: "ragChunks",
        fields: expect.arrayContaining([
          { fieldPath: "documentId", order: "ASCENDING" },
          { fieldPath: "embedding", vectorConfig: { dimension: 3072, flat: {} } },
        ]),
      }),
    ]));
  });

  test("Firebase config loads the Firestore index manifest", async () => {
    const config = JSON.parse(await readFile(resolve(root, "firebase.json"), "utf8"));
    expect(config.firestore).toMatchObject({
      rules: "firestore.rules",
      indexes: "firestore.indexes.json",
    });
  });

  test("Storage rules require the authenticated uid", async () => {
    const rules = await readFile(resolve(root, "storage.rules"), "utf8");
    expect(rules).toContain("request.auth.uid == uid");
    expect(rules).toContain("10 * 1024 * 1024");
  });
});
