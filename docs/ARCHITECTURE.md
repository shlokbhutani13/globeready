# Architecture

The client separates navigation, reusable interface components, pages, curated guide data, authenticated API access, and Firebase services. Firebase Auth maintains the session. Firestore subscriptions keep the profile, tasks, and document metadata synchronized. Firebase Storage holds files under a user-owned path.

The Express API uses an app factory so tests can inject authentication and storage adapters. Every protected route receives identity from verified Firebase ID tokens. The Firestore adapter stores every collection below `users/{uid}`. The in-memory store keeps demo and test behavior isolated by the same user-scoped interface.

The deterministic assistant keeps demo mode useful without sending data to an AI provider. When Gemini, Firebase Storage, and Firestore are configured, the API extracts text from an authenticated user's PDF, splits it into bounded overlapping chunks, creates Gemini embeddings, and stores those chunks under `users/{uid}/ragChunks`. A question is embedded and compared only with that user's chunks; the top matches become untrusted context for a Gemini answer. The client receives the answer alongside document name, page (when available), and excerpt citations. If no chunks are retrieved, the assistant falls back to trusted-resource guidance rather than claiming a document-grounded answer.

Document text is treated as untrusted data, never as instructions. Only PDFs are indexed in the current RAG pipeline; PNG and JPEG files may remain in the document vault but are not used for document chat. Client security rules deny direct access to the `ragChunks` collection, so only the Firebase Admin-backed API can manage retrieval records.

The client and API deploy separately. `firebase.json` and `client/vercel.json` provide single-page routing for Firebase Hosting and Vercel. The root `Dockerfile` packages the Node API.
