import "dotenv/config";

import { createApp } from "./app.js";
import { createAssistant } from "./assistant.js";
import { createFirebaseAdmin } from "./firebase-admin.js";
import { createFirestoreStore } from "./firestore-store.js";
import { createGeminiAssistant } from "./gemini.js";

const port = Number(process.env.PORT || 5051);
const firebase = createFirebaseAdmin();
const fallback = createAssistant();
const store = firebase?.firestore ? createFirestoreStore(firebase.firestore) : undefined;
const assistant = createGeminiAssistant({
  apiKey: process.env.GEMINI_API_KEY,
  bucket: firebase?.bucket,
  store,
  fallback,
});
const app = createApp({
  auth: firebase?.auth || null,
  store,
  assistant,
});

app.listen(port, () => {
  console.log(`GlobeReady API listening on http://localhost:${port}`);
});
