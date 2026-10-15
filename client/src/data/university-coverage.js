// Universities whose official office pages GlobeReady has reviewed. It is empty in this beta on purpose: until an
// entry is reviewed, the University page says so plainly and offers links generated from the website the student
// entered, which are labelled as unreviewed. Add an entry only after checking each link on the university's own site.
//
//   { id: "example-university", name: "Example University", domain: "example.edu", reviewedOn: "2026-10-14",
//     offices: [{ id: "international", label: "International Student Services", url: "https://international.example.edu/" }] }
// Off-domain official systems also require a short allowedExternalReason. Run `npm run university:validate`
// in server before publishing any registry change.
export const reviewedUniversities = [];
