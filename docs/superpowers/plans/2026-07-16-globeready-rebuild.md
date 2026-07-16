# GlobeReady Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate `int_students` into a secure, tested, truthful GlobeReady MVP with authentication, dashboard, document vault, tasks, guides, saved resources, and a bounded AI assistant.

**Architecture:** Keep the Vite/React client and Express service. Firebase Authentication supplies identity, Firestore and Storage persist user-scoped data, and Express verifies Firebase ID tokens before serving AI or document-analysis requests. Missing Firebase or Gemini credentials activate an explicit local demo mode rather than fake production behavior.

**Tech Stack:** React 18, Vite 8, React Router, Firebase Web SDK, Express, Firebase Admin SDK, Gemini SDK, Vitest, Testing Library, Supertest, GitHub Actions.

## Global Constraints

- The public `globeready` repository is canonical.
- No tracked `.env` or `.env.local` files.
- The API never accepts a caller-provided user ID as identity.
- Document uploads accept PDF, PNG, and JPEG files up to 10 MB.
- Every user-owned record and storage path is scoped by Firebase UID.
- Missing `GEMINI_API_KEY` leaves authentication, profile, tasks, guides, and document storage usable.
- Legal, immigration, health, financial, and tax content includes an informational disclaimer.
- README claims must match verified behavior.

---

### Task 1: Consolidate the repository and establish test infrastructure

**Files:**
- Modify: `.gitignore`
- Modify: `client/package.json`
- Modify: `server/package.json`
- Create: `client/src/test/setup.js`
- Create: `server/src/app.js`
- Create: `server/src/index.js`
- Create: `server/tests/health.test.js`
- Delete: `server/server.js`

**Interfaces:**
- Produces: `createApp({ auth, assistant }) -> Express`.
- Produces: root client scripts `test`, `lint`, and `build`.
- Produces: server scripts `test`, `lint`, and `start`.

- [ ] **Step 1: Write the failing health test**

```js
import request from "supertest";
import { createApp } from "../src/app.js";

test("GET /api/health reports demo capability", async () => {
  const response = await request(createApp({ auth: null, assistant: null }))
    .get("/api/health")
    .expect(200);

  expect(response.body).toEqual({
    ok: true,
    mode: "demo",
    services: { auth: false, ai: false },
  });
});
```

- [ ] **Step 2: Run the server test**

Run: `cd server && npm test`

Expected: failure because `src/app.js` does not exist.

- [ ] **Step 3: Implement the app factory and scripts**

Create an Express app with JSON parsing, an allowlisted CORS origin, `GET /api/health`, safe 404 JSON, and a final safe error handler. Move `listen()` into `src/index.js`. Add Vitest and Supertest.

- [ ] **Step 4: Run tests**

Run: `cd server && npm test`

Expected: one passing test.

- [ ] **Step 5: Commit**

```bash
git add .gitignore client/package.json server
git commit -m "chore: consolidate GlobeReady workspace"
```

### Task 2: Add verified identity and demo-safe data services

**Files:**
- Create: `server/src/config.js`
- Create: `server/src/auth.js`
- Create: `server/src/store.js`
- Create: `server/tests/auth.test.js`
- Create: `server/tests/store.test.js`
- Create: `client/src/lib/firebase.js`
- Create: `.env.example`

**Interfaces:**
- Produces: `createAuthMiddleware(adminAuth)`.
- Produces: `createStore({ firestore, storage, demo })`.
- Produces: client exports `auth`, `db`, `storage`, `firebaseConfigured`.

- [ ] **Step 1: Write failing auth and ownership tests**

```js
test("protected routes reject a missing bearer token", async () => {
  await request(app).get("/api/me").expect(401);
});

test("demo store keeps records separated by uid", async () => {
  await store.tasks.create("user-a", { title: "Upload I-20" });
  expect(await store.tasks.list("user-b")).toEqual([]);
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npm test`

Expected: failures for missing auth and store modules.

- [ ] **Step 3: Implement identity and storage adapters**

Use Firebase Admin when server credentials exist. Demo mode accepts only the explicit `x-demo-user` header and never falls back to a shared identity. Implement in-memory profile, task, resource, conversation, and document-metadata adapters with the same interface as Firestore.

- [ ] **Step 4: Add safe environment templates**

Document Firebase client values, Firebase Admin project configuration, allowed origin, and optional Gemini key in `.env.example`. Ignore local environment files.

- [ ] **Step 5: Run tests and commit**

Run: `cd server && npm test`

Expected: all identity and store tests pass.

```bash
git add .env.example client/src/lib server/src server/tests
git commit -m "feat: add verified identity and scoped storage"
```

### Task 3: Build profile, task, document, resource, and assistant APIs

**Files:**
- Create: `server/src/routes/profile.js`
- Create: `server/src/routes/tasks.js`
- Create: `server/src/routes/documents.js`
- Create: `server/src/routes/resources.js`
- Create: `server/src/routes/assistant.js`
- Create: `server/src/assistant.js`
- Create: `server/src/validation.js`
- Create: `server/tests/routes.test.js`

**Interfaces:**
- Produces: `GET/PUT /api/profile`.
- Produces: `GET/POST/PATCH/DELETE /api/tasks`.
- Produces: `GET/POST/DELETE /api/documents`.
- Produces: `GET/POST/DELETE /api/resources`.
- Produces: `POST /api/assistant`.

- [ ] **Step 1: Write failing route tests**

Test profile updates, task lifecycle, user isolation, file type and size validation, resource saving, assistant demo response, Gemini-disabled behavior, and safe error bodies.

- [ ] **Step 2: Run tests**

Run: `cd server && npm test`

Expected: route tests fail with 404 responses.

- [ ] **Step 3: Implement validated route modules**

Use stable JSON shapes `{ data, error }`. Validate every field, enforce ownership through `req.user.uid`, and cap assistant input at 2,000 characters. Demo document uploads store metadata only and state that file bytes are not persisted.

- [ ] **Step 4: Implement the assistant**

Build responses from curated resource cards and the user profile. When Gemini is available, request structured JSON with summary, actions, sources, confidence, and disclaimer. When unavailable, return deterministic guidance and label it `demo`.

- [ ] **Step 5: Run tests and commit**

Run: `cd server && npm test`

Expected: all server tests pass.

```bash
git add server/src server/tests
git commit -m "feat: add GlobeReady application APIs"
```

### Task 4: Rebuild the premium responsive client

**Files:**
- Replace: `client/src/App.jsx`
- Replace: `client/src/index.css`
- Modify: `client/src/main.jsx`
- Create: `client/src/lib/api.js`
- Create: `client/src/data/guides.js`
- Create: `client/src/components/AppShell.jsx`
- Create: `client/src/components/MetricCard.jsx`
- Create: `client/src/components/Disclaimer.jsx`
- Create: `client/src/pages/LoginPage.jsx`
- Create: `client/src/pages/DashboardPage.jsx`
- Create: `client/src/pages/DocumentsPage.jsx`
- Create: `client/src/pages/TasksPage.jsx`
- Create: `client/src/pages/GuidesPage.jsx`
- Create: `client/src/pages/AssistantPage.jsx`
- Create: `client/src/pages/ProfilePage.jsx`
- Create: `client/src/__tests__/dashboard.test.jsx`
- Create: `client/src/__tests__/documents.test.jsx`

**Interfaces:**
- Consumes: the APIs from Task 3.
- Produces: routes `/login`, `/`, `/documents`, `/tasks`, `/guides`, `/assistant`, and `/profile`.

- [ ] **Step 1: Write failing client tests**

```jsx
test("dashboard identifies upcoming and overdue work", async () => {
  render(<DashboardPage profile={profile} tasks={tasks} documents={documents} />);
  expect(screen.getByText("Upcoming deadlines")).toBeInTheDocument();
  expect(screen.getByText("Overdue")).toBeInTheDocument();
});
```

Test document validation, disclaimers, guide sources, task completion, and mobile navigation labels.

- [ ] **Step 2: Run tests**

Run: `cd client && npm test`

Expected: missing page and component imports fail.

- [ ] **Step 3: Implement the application shell and data client**

Create a neutral Apple-inspired interface with a desktop sidebar, mobile bottom navigation, 44 px controls, visible focus states, reduced-motion support, and high-contrast semantic colors.

- [ ] **Step 4: Implement the feature pages**

Use API-backed data in configured mode and seeded per-user demo data in local demo mode. Show explicit states for loading, empty, error, demo, and AI unavailable.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd client
npm test
npm run build
```

Expected: all client tests pass and Vite build exits zero.

```bash
git add client
git commit -m "feat: rebuild GlobeReady student workspace"
```

### Task 5: Add Firebase rules, CI, and truthful repository documentation

**Files:**
- Create: `firebase.json`
- Create: `firestore.rules`
- Create: `storage.rules`
- Create: `.github/workflows/ci.yml`
- Replace: `README.md`
- Replace: `DEPLOYMENT.md`
- Create: `LICENSE`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/PRIVACY.md`
- Create: `docs/MIGRATION.md`

**Interfaces:**
- Produces: reproducible setup and deployment instructions.
- Produces: CI checks for client tests/build and server tests.
- Produces: documented ownership rules for Firestore and Storage.

- [ ] **Step 1: Write Firebase emulator rule tests or static rule assertions**

Verify every user collection path and storage path includes `{uid}` and denies access when `request.auth.uid != uid`.

- [ ] **Step 2: Add CI**

Install exact dependencies through `npm ci`, run server tests, client tests, and the client production build on pushes and pull requests.

- [ ] **Step 3: Write repository documentation**

State current features, demo limitations, Gemini behavior, security model, contribution attribution, environment setup, architecture, privacy, and migration from `int_students`.

- [ ] **Step 4: Run full verification**

Run:

```bash
cd server && npm ci && npm test
cd ../client && npm ci && npm test && npm run build
```

Expected: every command exits zero.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "docs: prepare GlobeReady for public release"
```

### Task 6: Publish and verify GitHub presentation

**Files:**
- No additional source files.

**Interfaces:**
- Produces: updated `main` branch on `shlokbhutani13/globeready`.
- Produces: repository description, homepage, and topics matching the verified product.

- [ ] **Step 1: Verify repository status and commit history**

Run: `git status --short && git log --oneline -8`

Expected: clean status and focused migration commits.

- [ ] **Step 2: Push the verified branch**

Run: `git push origin HEAD:main`

Expected: push succeeds without force.

- [ ] **Step 3: Update repository metadata**

Set a factual description and topics: `international-students`, `react`, `firebase`, `express`, `gemini`, `productivity`, and `document-management`.

- [ ] **Step 4: Verify remote state**

Run: `gh repo view shlokbhutani13/globeready --json description,repositoryTopics,defaultBranchRef,url`

Expected: metadata and default branch match the release.

- [ ] **Step 5: Stop before deletion**

Present the migrated-file checklist and request explicit confirmation before deleting `shlokbhutani13/int_students`.
