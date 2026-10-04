import "dotenv/config";

import { createApp } from "./app.js";
import { createAssistant } from "./assistant.js";
import { createFirebaseAdmin } from "./firebase-admin.js";
import { createFirestoreStore } from "./firestore-store.js";
import { createGeminiAssistant } from "./gemini.js";
import { createLocalOcr } from "./ocr.js";
import { createFeedAdapter } from "./news/adapters/feed.js";
import { createIndexPageAdapter } from "./news/adapters/index-page.js";
import { createUniversitySitemapAdapter } from "./news/adapters/university-sitemap.js";
import { fetchSource } from "./news/fetch-source.js";
import { createSnapshotReader } from "./news/snapshots.js";
import { createNewsSync } from "./news/sync-news.js";
import { createDemoStore } from "./store.js";

const port = Number(process.env.PORT || 5051);
const firebase = createFirebaseAdmin();
const fallback = createAssistant();
const store = firebase?.firestore ? createFirestoreStore(firebase.firestore) : createDemoStore();
const assistant = createGeminiAssistant({
  apiKey: process.env.GEMINI_API_KEY,
  bucket: firebase?.bucket,
  store,
  fallback,
  ocr: process.env.DOCUMENT_OCR_ENABLED === "false" ? null : createLocalOcr(),
});
const snapshotStore = firebase?.bucket ? createSnapshotReader({ bucket: firebase.bucket }) : null;
const newsSync = createNewsSync({
  store,
  fetchSource,
  adapters: {
    feed: createFeedAdapter(),
    "index-page": createIndexPageAdapter(),
    "university-sitemap": createUniversitySitemapAdapter(),
  },
});
const app = createApp({
  auth: firebase?.auth || null,
  store,
  assistant,
  newsSync,
  snapshotStore,
  account: {
    deleteStoragePrefix: (uid) => (firebase?.bucket
      ? firebase.bucket.deleteFiles({ prefix: `users/${uid}/` })
      : Promise.resolve()),
    deleteAuthUser: firebase ? (uid) => firebase.auth.deleteUser(uid) : null,
  },
});

app.listen(port, () => {
  console.log(`GlobeReady API listening on http://localhost:${port}`);
});
