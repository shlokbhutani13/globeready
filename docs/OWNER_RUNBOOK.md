# Owner runbook: what only the owner can do

Everything here needs your accounts, your decisions or a person's judgement. None of it is done by the code in this repository, and none of it should be done by pasting passwords, tokens or codes into a chat.

## 1. Publish a privacy contact
The `/privacy` page says contact details are not published until `VITE_PRIVACY_CONTACT` is set to an email address you read. Add it as a repository variable used by the deploy workflow's build step, then redeploy. Until then the page tells people to use Settings to export or delete their data.

## 2. Apply and deploy these changes
Work arrives as a patch file. Apply it on a fresh branch from `main` with `git am`, open a pull request, let the verify job pass, and approve the `globeready-live` deployment yourself. Check `/privacy` and Ask GlobeReady on the live site afterwards, on a phone and on a desktop.

## 3. Review by people
- Have a designated school official (DSO) or an immigration attorney read the F-1 and J-1 content, the Ask GlobeReady refusals and the privacy page. GlobeReady is information only and must stay that way.
- Review the automatically collected news candidates. Only records you review may be labelled verified; everything else stays "not yet reviewed by GlobeReady".
- Run a small pilot with real students and write down where they get stuck before adding features.

## 4. Features that need your consent or a domain
| Feature | Why it is not built | What you would do |
| --- | --- | --- |
| Cloud document vault | Needs an OAuth consent screen in your Google project. Firebase Storage needs billing. | Create the consent screen, use the Drive `appDataFolder` scope, then ask for the vault to be built. |
| Generated AI answers | Needs a server, and free model tiers may train on submitted content. | Decide on a paid or privacy-safe provider first. Never send student documents to an unpaid tier. |
| Email reminders | Needs a domain you own and verify with the email provider. | Buy and verify a domain, then create the sender. |
| Web push | Free, but needs a sender configured in Firebase. | Enable Cloud Messaging and share the public key variable name only. |

## 5. Housekeeping
- Remove unused entries from Firebase Authentication, Authorized domains.
- Resolve the `source-map-js` dependency alert when a fixed release is available.
- Keep billing disabled. The deploy workflow is gated to refuse anything that would add cost.

## 6. Turn on push reminders and the Google Drive vault
Both features are built and stay hidden until you set public values. None of these steps involves a password or private key in chat.

**Push reminders**
1. Firebase console, project `globe-ready`: Project settings, Cloud Messaging, Web Push certificates, Generate key pair. Copy the public key.
2. GitHub, Settings, Secrets and variables, Actions, Variables: add `VITE_FCM_VAPID_KEY` with that public key.
3. Google Cloud, IAM: give `globeready-hosting-preview@globe-ready.iam.gserviceaccount.com` the roles **Cloud Datastore User** and **Firebase Cloud Messaging API Admin**. Enable the **Firebase Cloud Messaging API** in APIs & Services.
4. Add the variable `PUSH_REMINDERS_ENABLED` = `true`. The daily job then runs. Until you do, it is skipped.
5. Redeploy live. Sign in, open Settings, and turn on push reminders on a test device. On iPhone, add the app to the Home Screen first.

**Google Drive vault**
1. Google Cloud, APIs & Services: enable the **Google Drive API**. Set up the **OAuth consent screen** (External, app name GlobeReady, your contact email) with only the scope `.../auth/drive.appdata`, then publish it.
2. Credentials, Create credentials, OAuth client ID, Web application, authorized JavaScript origin `https://globe-ready.web.app`.
3. GitHub variable `VITE_GOOGLE_CLIENT_ID` = the client ID (public, not the secret).
4. Redeploy live. Settings then shows the Drive vault section.
