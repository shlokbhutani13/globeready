# Architecture

The client separates navigation, reusable interface components, pages, curated guide data, authenticated API access, and Firebase services. Firebase Auth maintains the session. Firestore subscriptions keep the profile, tasks, and document metadata synchronized. Firebase Storage holds files under a user-owned path.

The Express API uses an app factory so tests can inject authentication and storage adapters. Every protected route receives identity from verified Firebase ID tokens. The Firestore adapter stores every collection below `users/{uid}`. The in-memory store keeps demo and test behavior isolated by the same user-scoped interface.

The deterministic assistant keeps demo mode useful without sending data to an AI provider. When Gemini and Firebase Storage are configured, the Gemini adapter answers student questions and explains an authenticated user's uploaded document. It preserves the response shape used by the client: answer or summary, actions, sources, confidence, mode, and disclaimer.

The client and API deploy separately. `client/vercel.json` handles single-page routing for Vercel. The root `Dockerfile` packages the Node API.
