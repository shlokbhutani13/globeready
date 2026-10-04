import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createFirebaseAdmin } from "../src/firebase-admin.js";
import { createFirestoreStore } from "../src/firestore-store.js";
import { resolveRuntimeMode } from "../src/runtime-config.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const credentialsPath = resolve(root, ".local/credentials.json");
const env = process.env;

if (resolveRuntimeMode(env).mode !== "local-user") {
  throw new Error("The seed script runs only in LOCAL_USER_MODE=true with the emulator hosts set.");
}

const accounts = [
  { uid: "local-student", email: "student@local.example", displayName: "Local Student" },
  { uid: "local-admin", email: "admin@local.example", displayName: "Local Administrator" },
];

const passwords = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, "utf8")) : {};
const services = createFirebaseAdmin(env);

for (const account of accounts) {
  const password = passwords[account.uid] || randomBytes(12).toString("base64url");
  passwords[account.uid] = password;
  try {
    await services.auth.getUser(account.uid);
    await services.auth.updateUser(account.uid, { password, displayName: account.displayName });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await services.auth.createUser({ uid: account.uid, email: account.email, password, displayName: account.displayName, emailVerified: true });
  }
}

mkdirSync(dirname(credentialsPath), { recursive: true });
writeFileSync(credentialsPath, JSON.stringify(passwords, null, 2), { mode: 0o600 });

const store = createFirestoreStore(services.firestore);
const sampleHash = (label) => (Buffer.from(label).toString("hex") + "0".repeat(64)).slice(0, 64);
const samples = [
  {
    key: "local-sample:visa-status",
    title: "SAMPLE: Example status reminder (development data, not current news)",
    topics: ["status"], visaTypes: ["f-1"], universityIds: [], urgency: "high", legalState: "informational",
    excerpt: "Synthetic sample for local testing. Not a real government notice.",
  },
  {
    key: "local-sample:work-authorization",
    title: "SAMPLE: Example work authorization update (development data, not current news)",
    topics: ["employment"], visaTypes: ["f-1"], universityIds: [], urgency: "medium", legalState: "informational",
    excerpt: "Synthetic sample for local testing. Not a real government notice.",
  },
  {
    key: "local-sample:tax-filing",
    title: "SAMPLE: Example tax filing reminder (development data, not current news)",
    topics: ["taxes-social-security"], visaTypes: ["f-1"], universityIds: [], urgency: "low", legalState: "informational",
    excerpt: "Synthetic sample for local testing. Not a real government notice.",
  },
  {
    key: "local-sample:campus-housing",
    title: "SAMPLE: Example campus housing update (development data, not current news)",
    topics: ["campus-life"], visaTypes: ["f-1"], universityIds: ["example-university"], urgency: "low", legalState: "informational",
    excerpt: "Synthetic sample for local testing. Not a real university notice.",
  },
];

for (const sample of samples) {
  await store.news.upsert(sample.key, {
    sourceId: "local-sample",
    externalId: sample.key,
    title: sample.title,
    publisher: "GlobeReady local sample data",
    canonicalUrl: `https://example.com/globeready-local-sample/${sample.key.split(":")[1]}`,
    contentHash: sampleHash(sample.key),
    sourceVerified: true,
    editorialState: "published-source-only",
    legalState: sample.legalState,
    urgency: sample.urgency,
    topics: sample.topics,
    visaTypes: sample.visaTypes,
    universityIds: sample.universityIds,
    publishedAt: "2026-10-01",
    excerpt: sample.excerpt,
    sourceExcerpt: sample.excerpt,
    normalizedText: sample.excerpt,
    classifierExplanation: "Synthetic local sample.",
  });
}

console.log(`Seeded local-user accounts (${accounts.map((account) => account.email).join(", ")}) and ${samples.length} labeled sample updates.`);
console.log(`Credentials are in ${credentialsPath} (gitignored).`);
