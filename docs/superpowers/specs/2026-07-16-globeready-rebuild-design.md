# GlobeReady Rebuild Design

## Product goal

GlobeReady is a responsive productivity platform for international students managing university, immigration, financial, health, housing, and arrival responsibilities in the United States.

The first credible release must work as a focused student operations hub. It will not claim to replace an immigration attorney, university international office, financial adviser, doctor, or tax professional.

## Repository consolidation

The public `globeready` repository becomes the canonical project.

Useful application code, student guides, dashboard work, document features, and Firebase integration from `int_students` will move into `globeready`. The migration will preserve authorship through a documented migration note rather than copying the second repository’s Git history.

The `int_students` repository can be deleted only after:

- All useful source files have been reviewed and migrated or intentionally rejected.
- No secret-bearing environment file remains in the canonical repository.
- GlobeReady passes tests and a production build.
- The repaired repository is pushed to GitHub.
- The user explicitly reconfirms permanent deletion.

## First-release scope

### Authentication

Users can sign up and sign in with email/password or Google through Firebase Authentication. Protected screens require a verified Firebase session. The Express API verifies Firebase ID tokens for every user-specific request.

### Dashboard

The dashboard summarizes:

- Upcoming deadlines
- Incomplete tasks
- Recently uploaded documents
- Recommended university and immigration resources
- Profile completeness
- Recent assistant conversations

The dashboard uses real persisted user data. Empty states explain how to add the first task, document, or profile detail.

### Student profile

The profile stores the user’s name, home country, university, degree level, program, start date, expected graduation, visa type, and current journey stage. These fields drive resource and task recommendations.

### Document vault

Users can upload PDF, PNG, and JPEG files for categories including passport, visa, I-20, insurance, lease, admission, employment, tax, and other.

Firebase Storage holds file bytes under user-scoped paths. Firestore stores metadata. Storage rules and API authorization prevent one user from accessing another user’s files.

The interface shows file type, category, upload date, optional expiration date, and analysis status. The first release limits files to 10 MB.

### Document explanations

Users can request a plain-language explanation of an uploaded document. The Express API downloads the authorized file, extracts bounded text where supported, and sends the minimum required content to Gemini.

The result contains:

- Document summary
- Important dates
- Required actions
- Terms to clarify
- Confidence and limitations

The interface states that generated explanations may be incomplete and that users should verify immigration, legal, health, financial, and tax information with an appropriate official source.

Scanned-image OCR beyond Gemini’s supported file input is deferred.

### AI assistant

The assistant answers questions using:

- The user’s profile
- Selected uploaded-document summaries
- Curated GlobeReady resources
- The current conversation

It does not search the open web in the first release. Answers include linked source cards when they rely on curated resources. The assistant refuses to invent deadlines or legal conclusions when the relevant document or trusted resource is unavailable.

### Tasks and deadlines

Users can create, edit, complete, and delete tasks. Each task has a title, category, priority, optional due date, notes, and reminder state.

GlobeReady recommends tasks from the user’s journey stage but does not add them without confirmation. Email, push, and calendar reminders are deferred; the first release provides in-app upcoming and overdue states.

### Guides and saved resources

The application provides maintained guides for:

- Visa basics
- CPT and OPT orientation
- SSN preparation
- Banking setup
- Health insurance and care
- Housing
- Transportation
- Tax preparation
- Arrival and university onboarding

Every guide shows its source, last-reviewed date, and informational disclaimer. Users can save guide links and external resources to their account.

University-specific content uses a small curated dataset for supported universities. Unsupported universities fall back to national guidance and a link to the institution’s international student office.

## Deferred scope

The first release defers:

- Automated legal eligibility decisions
- Automatic tax preparation
- Direct university-system integrations
- Email, SMS, calendar, and push reminders
- Collaborative accounts
- Payment or subscription features
- Open-web retrieval
- Automatic document deletion policies
- Native mobile applications

## Technical architecture

### Client

The existing Vite and React client remains to minimize migration risk. React Router manages protected routes. A feature-oriented structure separates dashboard, documents, tasks, guides, assistant, profile, and authentication.

The interface uses an Apple-inspired visual system: neutral surfaces, restrained color, clear hierarchy, generous whitespace, strong typography, subtle motion, and explicit focus states. It must remain usable at 375 px, 768 px, 1024 px, and 1440 px widths.

### Firebase

Firebase Authentication manages identity. Firestore stores profiles, tasks, resources, conversations, document metadata, and analysis results. Firebase Storage stores documents.

All collections and storage objects are scoped by Firebase user ID. Security rules enforce ownership independently of client code.

### Express API

The Express service owns:

- Firebase ID-token verification
- Document metadata and signed access orchestration
- Gemini requests
- Prompt and output validation
- Rate limiting
- Structured error handling
- Health checks

The API will not accept a caller-provided user ID as proof of identity. The existing `default-user-123` fallback will be removed.

### Gemini

Gemini remains optional. When `GEMINI_API_KEY` is absent, the app shows document storage, tasks, guides, and a clearly labeled deterministic assistant demo. Live AI failures do not block access to stored documents or tasks.

## Data model

### `users/{uid}`

- `fullName`
- `email`
- `homeCountry`
- `university`
- `degreeLevel`
- `program`
- `startDate`
- `graduationDate`
- `visaType`
- `journeyStage`
- `createdAt`
- `updatedAt`

### `users/{uid}/documents/{documentId}`

- `name`
- `category`
- `contentType`
- `size`
- `storagePath`
- `uploadedAt`
- `expiresAt`
- `analysisStatus`
- `analysis`

### `users/{uid}/tasks/{taskId}`

- `title`
- `category`
- `priority`
- `dueDate`
- `notes`
- `completed`
- `source`
- `createdAt`
- `updatedAt`

### `users/{uid}/savedResources/{resourceId}`

- `title`
- `url`
- `category`
- `source`
- `savedAt`

### `users/{uid}/conversations/{conversationId}`

- `title`
- `createdAt`
- `updatedAt`

Messages live in a nested `messages` collection with role, content, sources, and timestamps.

## Security and privacy

- Remove `client/.env.local` from Git and repository history.
- Store Firebase client values in an ignored local environment file and provide `.env.example`.
- Restrict Firebase API keys by domain and API in Google Cloud.
- Validate Firebase ID tokens on every protected API route.
- Enforce Firestore and Storage ownership rules.
- Reject unsupported file types, oversized files, and suspicious filenames.
- Never log document content, ID tokens, or AI credentials.
- Limit assistant and document-analysis request size and frequency.
- Use CORS allowlists rather than unrestricted CORS.
- Provide a privacy notice explaining Firebase and Gemini data processing.
- Do not store passport, visa, or identity documents in demo fixtures.

## Error handling

Authentication failures return a sign-in prompt without exposing backend details. Upload errors preserve the selected file when safe. AI failures show a retry action and leave the document stored. Network failures keep unsaved form content. Unsupported universities and questions fall back to curated national resources.

Server error responses use stable codes and safe messages. Detailed diagnostics remain server-side and exclude personal data.

## Testing

### Client

- Authentication guard tests
- Dashboard empty and populated states
- Document validation and upload states
- Task create, complete, edit, and delete flows
- Guide filtering and saved resources
- Assistant source and disclaimer rendering
- Responsive smoke tests

### Server

- Firebase token verification
- Ownership enforcement
- Upload validation
- Gemini-disabled fallback
- Prompt input limits
- Safe error responses
- Health endpoint

### Integration

- Sign in, create profile, upload document metadata, create task, and view dashboard
- Attempted cross-user document access fails
- Missing Gemini key leaves non-AI features working

## Repository presentation

The repaired public repository will include:

- A factual README with screenshots
- Architecture diagram
- Local setup
- Environment-variable reference
- Firebase rules and deployment instructions
- Supported and deferred features
- Privacy and AI limitations
- Contribution attribution
- MIT license
- Repository topics
- GitHub Actions for client tests, server tests, lint, and production build

## Success criteria

- Client production build passes.
- Server tests and syntax checks pass.
- No tracked local environment file remains.
- Protected API routes reject missing or invalid Firebase tokens.
- A user can authenticate, complete a profile, upload a document, create a task, save a resource, and receive a document explanation or transparent offline fallback.
- The mobile and desktop interfaces remain usable.
- README claims match verified behavior.
