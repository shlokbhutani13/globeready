// Plain-language privacy notice for the free public beta.
// Every statement here mirrors docs/PRIVACY.md (zero-cost section). If the behaviour changes, change both,
// and the test in __tests__/privacy-page.test.jsx will remind you which claims the page makes.

export const privacyIntro = "This page says what GlobeReady keeps, where it keeps it, and how you can remove it. GlobeReady is an organizer and reader. It is not a lawyer or your school, and it never decides what applies to you. Your designated school official (DSO) is the authority on your record.";

export const privacySections = [
  {
    id: "never",
    title: "What GlobeReady never stores",
    items: [
      "Your original files. PDFs and photos are read inside your browser and the file itself is discarded after the text is extracted.",
      "Images are never sent to a third party. The text-reading tools are served from GlobeReady's own site.",
      "Your immigration case status or records from any agency. GlobeReady does not fetch them. Anything about a case is only what you typed.",
    ],
  },
  {
    id: "account",
    title: "What is saved in your account",
    lead: "Saved in Firestore under your own user ID, and readable only by you:",
    items: [
      "Your profile: university, program and level, visa category, journey stage, dates and chosen topics.",
      "Your privacy choices, tasks, key dates you typed in, private contacts and the cases you track.",
      "Links you save, saved guides, saved news items and checklist progress.",
      "Only while document reading is on: the text extracted from up to 50 documents, with page numbers.",
    ],
  },
  {
    id: "document-text",
    title: "If you turn on document reading",
    lead: "GlobeReady then saves the readable text of the documents you choose. Please read this part carefully.",
    items: [
      "You choose the whole file, not individual passages. Everything readable in it can be saved, including names, dates of birth and addresses.",
      "Before saving, GlobeReady masks common labelled passport, visa, USCIS receipt and SEVIS number patterns. This safety net can miss unusual formats and reading errors. Do not rely on it.",
      "Dates are never taken from documents automatically.",
      "Turning document reading off stops search and blocks new documents. It does not delete text already saved. Use “Delete all saved document text” on the Documents page for that.",
    ],
  },
  {
    id: "browser",
    title: "What stays only in this browser",
    lead: "These are never uploaded. They are not in your account export and are lost if you clear this browser’s data. They are deleted when you delete your account.",
    items: [
      "Display choices, which reminders you read, which news you have seen, saved news searches and snoozed next steps.",
      "The appointment-preparation workspace, the budget planner, the documents checklist and the emergency card.",
      "Settings can download a device-only backup of these. That file can contain sensitive health, insurance, financial and private notes and it is not encrypted, so keep it somewhere safe.",
    ],
  },
  {
    id: "others",
    title: "Who else is involved",
    items: [
      "Firebase, a Google service, hosts sign-in and your saved data. Google sign-in is available.",
      "No AI provider receives your questions or documents. Ask GlobeReady ranks your saved passages inside your browser and quotes them with page numbers.",
      "News collection reads public official sources only. It sends no student data to those sources and cannot read any student records.",
    ],
  },
  {
    id: "news",
    title: "About the news",
    items: [
      "Stories collected automatically from selected official sources are labelled “not yet reviewed by GlobeReady”. Only records a person has reviewed carry the verified treatment.",
      "The feed refreshes about every four hours, covers selected sources only and can be late or incomplete. Always read the original source before acting.",
    ],
  },
  {
    id: "controls",
    title: "Your controls",
    items: [
      "Export everything stored in your account as a JSON file from Settings.",
      "Restore a GlobeReady export in your browser after a preview. It only adds records, skips duplicates and refuses files from another account.",
      "Delete your account from Settings. You confirm your password or Google account first. GlobeReady then deletes your records, your profile and your sign-in identity.",
      "Account deletion does not reach copies that Firebase or Google Cloud may hold under their own retention rules, or the public news items, which contain no student data.",
    ],
  },
];

export const notLegalAdvice = "GlobeReady provides information support, not legal advice. Dates, steps and news shown here are not legal conclusions and may be out of date. Confirm anything that affects your status with your DSO or a qualified immigration attorney.";
