# Architecture

The client separates navigation, reusable interface components, pages, curated guide data, API access, and Firebase initialization.

The Express API uses an app factory so tests can inject authentication and storage adapters. Every protected route receives identity from verified middleware. The in-memory demo store follows the same user-scoped interface expected from a future Firestore adapter.

The current assistant is deterministic and source-backed. A live Gemini adapter must preserve the same response shape: answer, actions, sources, confidence, mode, and disclaimer.
