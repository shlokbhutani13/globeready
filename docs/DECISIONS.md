# GlobeReady zero-cost student companion decisions

Status: approved architecture checkpoint; non-document/non-AI tracks implemented in this release

Research checked: 2026-10-17

Scope: F-1 first, J-1 second, admission through graduation and practical training

This record distinguishes code that exists from code that is active in the live zero-cost build. It does not authorize or provision a service. No account, billing relationship, OAuth scope, consent screen, API key, storage bucket, email provider, or cloud resource is created by this document.

## Current implementation audit

This table comes from the executable code and deployment configuration on `main`, not from product copy or roadmap documents.

| Area | What exists in code | What the live zero-cost build actually does | Important gap |
| --- | --- | --- | --- |
| Document files and storage | The full-production client has Firebase Storage upload/delete code in `client/src/lib/student-data.js`; the server can download an owned file from a private bucket, extract it, split it into chunks, and delete it through `server/src/document-index.js` and `server/src/routes/documents.js`. Storage and Firestore rules constrain files to a user's path. | `client/src/lib/zero-cost-data.js` stores browser-extracted readable text, split into page-labelled chunks, plus bounded metadata in 50 fixed Firestore document slots. The student opts in and chooses each whole file. Original PDFs/images stay on the device. Common labelled passport, visa, USCIS receipt and SEVIS-number patterns are masked before storage. The screen warns that masking can miss unusual formats/OCR and that other personal information remains. Individual deletion, delete-all and account deletion remove these records. | There is no free live original-file backup. The production upload path depends on Cloud Storage and is not active in the zero-cost deployment. Masking is a safety net, not a guarantee; extracted text remains personal data stored in Firestore. |
| Server AI and RAG | `server/src/gemini.js` contains Gemini generation and optional embedding calls. `server/src/document-index.js`, `server/src/rag.js`, and `server/src/document-assistant.js` implement extraction, chunking, lexical/vector ranking, citations, consent checks, timeouts, and fail-closed fallbacks. Embeddings are explicitly off by default in runtime configuration. | The static zero-cost site does not run this server path. `client/src/lib/local-documents/retrieval.js` performs deterministic, local lexical passage retrieval over saved extracted text. It returns quotations/citations, not a generated answer. | Server RAG/AI is implemented but neither provisioned nor part of the live $0 architecture. A free cloud model must not receive student documents because its data terms are incompatible with sensitive records. |
| Reminders and notifications | Tasks support due dates, reminder dates, recurrence and in-app notification records. `server/src/reminders.js` creates due/overdue task notifications when `/api/notifications/sync` is called. Email delivery abstractions exist under `server/src/email/`, and settings store email/digest preferences. | The free build derives reminders while the app is open and shows them in the in-app inbox. It sends neither email nor web push. There is no background scheduler for each student's reminders. | Saving an email preference does not send mail. Push subscription storage, permission UX, VAPID configuration, delivery jobs, bounce handling and scheduled reminder dispatch do not exist in the live path. |
| Student profile | `ProfilePage.jsx`, `student-profile.js`, `workspace-defaults.js`, `zero-cost-data.js`, Firestore rules and relevance code support the canonical program level, visa category, university, student stage and reported training status, alongside the existing dates and topic preferences. Legacy `degreeLevel`, `visaType` and `journeyStage` values are normalized on read; new profile saves are canonical. | These fields save to the user's Firestore profile, are labelled “Reported by you, not verified,” and drive deny-by-default pathway/relevance gating. F-1 receives the deeper CPT/OPT/STEM OPT path; J-1 receives the sponsor/Academic Training path; other categories receive neither. | GlobeReady does not verify status or eligibility. Legacy keys can remain in an older merged Firestore record for compatibility, but canonical values take precedence and new saves no longer write them. |
| News pipeline | `config/news-sources.json` registers six enabled sources plus one disabled State Department source. `refresh-live-news.yml` runs every four hours and manually, fetches with retries/robots checks, sanitizes, filters, de-duplicates by canonical URL/same-source title, conservatively clusters exact cross-source events, preserves prior items on source failure, emits source reports and commits changed artifacts. Federal Register structured metadata supplies publication/effective dates and rule type; bounded deterministic classification covers other sources. | The live static feed is generated without Firebase or paid infrastructure. Reviewed records remain distinct; automatic items say they are not yet reviewed. Freshness reports last success/failure honestly, and the workflow opens one stable GitHub issue after an enabled source has failed for 24 hours and closes it on recovery. | Automatic classification is deliberately conservative and not an editorial/legal conclusion. Disabled sources are reported but do not count as failures; retained stories are identified as retained. |

## Service feasibility and decisions

### 1. Original document storage

**Firebase Cloud Storage: reject for the strict $0/no-billing product.** Firebase now requires the Blaze pay-as-you-go plan and an attached Cloud Billing account to provision or access Cloud Storage for Firebase, even though qualifying usage can remain inside no-cost allowances. This fails the owner's explicit “$0 with no billing account” condition. The existing production upload code stays dormant and must not be included in a zero-cost live deployment. Sources: [Firebase Storage billing-change FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Cloud Storage web setup](https://firebase.google.com/docs/storage/web/start), and [Firebase pricing](https://firebase.google.com/pricing).

**Google Drive `appDataFolder`: recommended as an optional original-file backup, after a separate privacy/security implementation and owner setup.** The Drive API documents `drive.appdata` as a non-sensitive scope for app-specific data; files are hidden from the normal Drive UI and can only be accessed by the app. Standard API use is currently available at no additional cost, subject to quotas, and stored bytes count against the student's own Drive capacity. This meets the infrastructure-cost goal better than Firebase Storage, but it is not “no setup”: it needs a Google Cloud project/API configuration, OAuth client, consent screen, published privacy disclosures, incremental consent and robust token/error handling. Sources: [app data folder guide](https://developers.google.com/workspace/drive/api/guides/appdata), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes), [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies), and [Drive API limits/pricing](https://developers.google.com/workspace/drive/api/guides/limits).

Decision constraints for a later Drive implementation:

- Drive access is opt-in and requested separately from sign-in; refusing it must not block GlobeReady.
- Request only `drive.appdata`, never broad `drive` or `drive.readonly` access.
- Encrypt each original file in the browser before upload. Store the key only on the student's devices or in a student-controlled recovery export; GlobeReady must not hold a universal decryption key.
- Explain that deleting GlobeReady data and deleting Drive backup files are separate operations, and provide both controls.
- Do not send original files or extracted text to an unpaid LLM service.

Owner-only work, later: configure/verify the OAuth consent screen and owned domain, enable the Drive API, add the exact production origins/redirect URIs, approve the privacy-policy wording, and complete any Google verification Google requests. These actions are not performed here.

### 2. Cloud LLM APIs

**Gemini unpaid quota: technically $0, rejected for personal documents and student-specific prompts.** Google lists free input/output for eligible models, but its Additional Terms say content submitted to unpaid services and generated responses may be used to improve Google products and may be processed by human reviewers; it explicitly says not to submit sensitive, confidential or personal information. The EEA/Switzerland/UK exception in those terms does not make a global student product's privacy posture simple enough to rely on. Sources: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms).

**OpenAI API: privacy-compatible by default, but not a guaranteed $0 production dependency.** OpenAI's API documentation says API data is not used to train models by default, while the pricing page lists metered model prices. A rate-limit “Free” usage tier is not a contractual grant of recurring free inference credits. Therefore it does not satisfy a durable $0 promise. Sources: [OpenAI API data controls](https://platform.openai.com/docs/guides/your-data) and [OpenAI API pricing](https://openai.com/api/pricing/).

**Other provider free tiers: do not adopt as a core dependency.** Promotional limits and data terms can change, and a free quota is not an availability or privacy guarantee. A provider may be evaluated later only against a dated data-processing review, a no-training commitment for API data, deletion/retention terms, geographic availability, and a hard spend cap.

Recommendation: keep cloud generation off in the strict $0 release. Preserve the existing deterministic cited passage search. If paid AI is considered later, use an explicitly paid/no-training service, data minimization, per-feature consent, provider isolation, retention controls and a non-AI fallback. That is a separate release and approval.

Owner-only work, later: choose a paid provider/data-processing posture, approve legal/privacy text, create the provider account and key through the secret manager, and set a hard budget. None is needed for the present companion work.

### 3. On-device browser models

**Recommended only as an optional enhancement, never as the legal/status authority.** Chrome's built-in AI runs locally after a model download and says no data is sent to Google or third parties, but its foundation-model APIs are desktop-only and have substantial hardware/storage requirements. WebLLM and Transformers.js can also run models locally with WebGPU, but support and performance vary, model downloads are large, and every chosen model has its own license. Sources: [Chrome built-in AI requirements](https://developer.chrome.com/docs/ai/get-started), [WebLLM documentation](https://webllm.mlc.ai/docs/), [Transformers.js](https://huggingface.co/docs/transformers.js/index), and [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu).

Recommended first on-device uses are low-risk and bounded: semantic search over locally held passages, classifying a student's own note, or rewriting text the student can verify. Do not use it to infer status, eligibility, deadlines, document validity or required legal action. Feature-detect it, show model-download size before consent, run it in a worker, and retain the deterministic search fallback.

Owner-only work, later: approve the exact model and license, download/consent UX, supported-browser policy and privacy wording. No account is inherently required for a self-hosted open model, but model hosting bandwidth and the model license must be reviewed.

### 4. Web push

**Feasible at $0, with operational limits.** Firebase lists Cloud Messaging as a no-cost product and supports web clients through service workers, HTTPS and VAPID credentials. The current app already has a service-worker registration but not push subscriptions or delivery. Sources: [Firebase pricing](https://firebase.google.com/pricing) and [FCM web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started).

Recommendation: implement opt-in web push only after reminder semantics are stable. Store the minimum subscription/token data, allow one-click revocation, expire invalid tokens, never place sensitive immigration details in notification bodies, and keep in-app reminders as the source of truth. Delivery still needs a trusted scheduled sender; GitHub Actions may be acceptable for a small beta if secrets and concurrency are handled safely, but it is not a high-reliability scheduler.

Owner-only work, later: generate/approve VAPID credentials in the existing Firebase project, approve permission copy and privacy disclosures, and add the secret without pasting it into chat. Do not enable this during the current decision checkpoint.

### 5. Reminder email

**Not available for arbitrary students without a verified sending domain.** Resend currently advertises a free-forever plan with 3,000 emails/month and 100/day and up to three verified domains. Its testing sender is for tests/self-delivery; production delivery to users requires a sender on a verified domain. It also requires an account/API key, and limits or terms may change. Sources: [Resend pricing](https://resend.com/pricing), [Resend's testing-domain guidance](https://resend.com/changelog/v0-integration), and [free-plan verified domains](https://resend.com/changelog/three-domains-on-the-free-tier).

Recommendation: reminders remain **in-app plus optional web push only** for the no-domain release. Email stays deferred until the owner controls and verifies a sending domain. If enabled later, use email only for generic opt-in nudges such as “You have a GlobeReady reminder”; put the actual task/date behind sign-in. Enforce provider limits locally, suppress bounced/complaining addresses, expose unsubscribe controls, and fail back to the in-app inbox. Do not promise guaranteed delivery.

Owner-only work, later: create the provider account, verify a sending domain, approve sender identity and email/privacy copy, and save the API key as an encrypted repository secret. No provider is enabled by this decision.

## Approved product design for the next implementation phase

The next non-document, non-AI release should be split into two independently reviewable tracks so it can be deployed without accidentally activating dormant upload/AI code.

### Track A: student profile and visa-aware pathways

Canonical stored fields:

| Field | Values |
| --- | --- |
| `programLevel` | `undergraduate`, `masters`, `phd`, `other` |
| `visaCategory` | `f-1`, `j-1`, `other` |
| `university` | student-entered bounded text |
| `studentStage` | `pre-arrival`, `arrived`, `studying`, `post-completion` |
| `trainingStatus` | a visa-aware enum selected by the student; F-1 offers CPT/OPT/STEM OPT states, J-1 offers Academic Training states, and other offers `not-applicable`/`other` |

All five fields must appear next to the persistent statement **“Reported by you, not verified.”** Existing `degreeLevel`, `visaType` and `journeyStage` values need a deterministic compatibility migration on read and canonical writes going forward. No migration may silently claim a training status; its default is `not-reported`.

Guidance gating is deny-by-default:

- F-1 shows the detailed F-1 route from admission/I-20 and entry through enrollment, CPT, OPT, STEM OPT where relevant, completion and departure/transfer prompts.
- J-1 shows a smaller accurate route based on sponsor/RO or ARO, DS-2019, program participation and Academic Training. It never substitutes DSO/CPT/OPT language.
- Other shows general arrival, study and campus-life tools, plus a referral to the appropriate sponsor/adviser. It shows neither CPT/OPT nor Academic Training eligibility guidance.
- Switching visa category immediately removes inapplicable suggestions from navigation, journey, next steps, search recommendations and profile-derived news relevance. Stored user tasks are not deleted; they are labelled as user-created and remain editable.
- The UI never infers eligibility or a legal deadline from these fields.

### Track B: news hardening

Automatic records gain these normalized fields without changing reviewed-record safeguards:

- `updateType`: `proposed-rule`, `final-rule`, `announcement`, `court-development`, or `guidance`;
- `publishedAt`: source publication date;
- `effectiveAt`: effective date only when explicitly stated in structured source data or a conservative, source-specific parser; otherwise `null`;
- `clusterId`: stable hash for a normalized event key;
- `relatedStoryIds`: other stories in that event cluster.

Classification must be deterministic and evidence-preserving. Federal Register document metadata is authoritative for proposed/final rule types and effective dates. Other source parsers use explicit labels and bounded patterns; ambiguous items become `announcement` or `guidance`, never a rule status invented from an excerpt. A reviewed editor can override automatic classification through the existing review flow.

Clustering must not delete coverage. The main feed shows one representative with “Also reported by …”; every story remains reachable in the cluster detail/source filter. Cluster keys may use exact canonical identifiers, Federal Register document number, normalized title tokens and strongly matching dates. Loose semantic similarity alone cannot merge events.

The source registry remains allowlist-based. A new source is enabled only after recording its official status, robots result, terms/copyright limits, parser fixture and live fetch result. Failure state persists across runs in the generated operational artifact. A GitHub issue is created only when an enabled source has had no successful refresh for more than 24 hours; it uses a stable source label to avoid duplicates and closes (or comments as recovered) after recovery. Disabled sources are never failures. The workflow needs `issues: write` in addition to `contents: write`, scoped only to this scheduled/manual workflow.

Freshness wording separately reports:

- when the feed artifact was generated;
- how many enabled sources were reachable;
- how many produced relevant stories;
- which source is failing and since when;
- retained stories, clearly identified as retained from the last successful fetch.

Every automatic item remains **“From official source — not yet reviewed by GlobeReady”** and informational only. No automatic classification creates personalized eligibility, a deadline, or a legal conclusion.

## Release boundary

Profile/pathway and news-hardening changes may proceed through tests, PR, merge, feed refresh and live deployment after implementation review because they do not activate document uploads or AI. Any change to these files or capabilities is excluded from that release and requires a separate explicit approval: Firebase Storage configuration/rules, `student-data.js` uploads, server document extraction/indexing, Gemini/provider calls, embeddings, on-device generation, Drive backup, push delivery or email delivery.
