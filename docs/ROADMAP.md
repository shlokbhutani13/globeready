# Roadmap

## Current release

- Firebase email/password and Google authentication
- User-scoped profiles, tasks, saved resources, and document metadata
- Firebase Storage upload and deletion behind an explicit deployment switch
- Private PDF and image text extraction, scoped term retrieval, and cited answers
- Deterministic trusted-resource guidance when live AI or relevant document context is unavailable
- Official student resource library
- Responsive desktop and mobile interface
- Ownership rules, request throttling, tests, CI, and deployment documentation

## Next release

- Scheduled source synchronization, once a scheduler is approved (see `docs/RELEASE_READINESS.md`)
- Scheduled deletion of expired source snapshots
- Credentialed synthetic-document tests against the chosen deployment
- Live verification of Google sign-in and the deletion path (`DEPLOYMENT.md`, section 9)
- University-specific onboarding packs
- Calendar export
- Document expiration notifications

## Later

- Email delivery for reminders and digests (preferences are stored; no email is sent at launch)
- Browser push notifications and vector-based retrieval, if they are revisited after launch
- More supported universities and countries
- Accessibility audit against WCAG 2.2 AA
- Shared rate limiting for multi-instance API deployments
- Product analytics with privacy-safe event definitions

GlobeReady will not automate legal eligibility decisions, tax filing, or medical advice.
