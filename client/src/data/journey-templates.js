import { visaCategoryFor } from "../lib/student-profile";

// General checklist templates. They describe common steps for international students and are not personal advice:
// rules differ by school, program and situation, so every item points the student to their designated school official (DSO).
export const journeyStages = [
  { id: "arrival", label: "Arrival", blurb: "Before and just after you reach campus." },
  { id: "enrollment", label: "Enrollment", blurb: "Staying in good standing each term." },
  { id: "travel", label: "Travel", blurb: "Trips outside the United States." },
  { id: "employment", label: "Employment", blurb: "Working while you study." },
  { id: "graduation", label: "Graduation", blurb: "The final term and what comes next." },
  { id: "post-completion", label: "After your program", blurb: "Once the program ends." },
];

// anchor: which profile date a suggested due date counts from; offsetDays is negative for "before".
const general = [
  { id: "gen-arrival-docs", stage: "arrival", title: "Gather passport, visa, and school documents in one folder", priority: "high", anchor: "start", offsetDays: -30 },
  { id: "gen-arrival-address", stage: "arrival", title: "Save your U.S. address and ask your international office when it must be reported", priority: "high", anchor: "start", offsetDays: 7 },
  { id: "gen-arrival-bank", stage: "arrival", title: "Compare student bank accounts and what each needs to open", priority: "medium", anchor: "start", offsetDays: 14 },
  { id: "gen-enroll-insurance", stage: "enrollment", title: "Confirm your health insurance and any school waiver deadline", priority: "high", anchor: "start", offsetDays: 0 },
  { id: "gen-enroll-register", stage: "enrollment", title: "Register for the full course load your school requires", priority: "high", anchor: "start", offsetDays: -7 },
  { id: "gen-enroll-office", stage: "enrollment", title: "Find your international adviser or sponsor contact details", priority: "medium", anchor: "start", offsetDays: 7 },
  { id: "gen-travel-docs", stage: "travel", title: "Check passport validity before any trip abroad", priority: "high" },
  { id: "gen-travel-office", stage: "travel", title: "Tell your international office about travel plans before you book", priority: "medium" },
  { id: "gen-employ-ask", stage: "employment", title: "Ask your international adviser or sponsor what authorization may be needed before accepting work", priority: "high" },
  { id: "gen-grad-plan", stage: "graduation", title: "Meet your international adviser or sponsor about options after the program ends", priority: "high", anchor: "graduation", offsetDays: -120 },
  { id: "gen-grad-address", stage: "graduation", title: "Confirm your mailing address and email for official notices", priority: "medium", anchor: "graduation", offsetDays: -30 },
  { id: "gen-post-tax", stage: "post-completion", title: "Check official guidance on tax filing for international students", priority: "medium", anchor: "graduation", offsetDays: 30 },
  { id: "gen-post-next", stage: "post-completion", title: "Write down your next steps and the official dates that apply to you", priority: "medium", anchor: "graduation", offsetDays: 14 },
];

const f1 = [
  { id: "f1-arrival-sevis", stage: "arrival", title: "Confirm your SEVIS I-901 fee is paid and keep the receipt", priority: "high", anchor: "start", offsetDays: -45 },
  { id: "f1-arrival-i20", stage: "arrival", title: "Check that your I-20 matches your passport (name, dates, program)", priority: "high", anchor: "start", offsetDays: -45 },
  { id: "f1-arrival-checkin", stage: "arrival", title: "Complete check-in with your DSO by the date your school gives you", priority: "high", anchor: "start", offsetDays: 14 },
  { id: "f1-enroll-address", stage: "enrollment", title: "Report any address change to your DSO within the time they require", priority: "high" },
  { id: "f1-travel-signature", stage: "travel", title: "Ask your DSO whether your I-20 travel signature is current before you travel", priority: "high" },
  { id: "f1-employ-oncampus", stage: "employment", title: "Ask your DSO to explain the limits on F-1 on-campus employment before starting work", priority: "high" },
  { id: "f1-employ-cpt-curricular", stage: "employment", title: "Confirm with your DSO how an internship is integral to your curriculum before discussing CPT", priority: "high" },
  { id: "f1-employ-cpt-authorization", stage: "employment", title: "Do not begin CPT until your DSO has confirmed the authorization and dates on your I-20", priority: "high" },
  { id: "f1-employ-cpt-history", stage: "employment", title: "Keep your CPT I-20s and a record of full-time and part-time CPT dates", priority: "medium" },
  { id: "f1-grad-opt-plan", stage: "graduation", title: "Ask your DSO when your post-completion OPT recommendation and USCIS filing window may open", priority: "high", anchor: "graduation", offsetDays: -150 },
  { id: "f1-grad-opt-i20", stage: "graduation", title: "Review the OPT-recommended I-20 and filing instructions with your DSO before filing", priority: "high", anchor: "graduation", offsetDays: -120 },
  { id: "f1-grad-opt-receipt", stage: "graduation", title: "Track the USCIS receipt and case notices for your OPT application", priority: "high", anchor: "graduation", offsetDays: -90 },
  { id: "f1-post-opt-reporting", stage: "post-completion", title: "Ask your DSO what employment and address changes you must report during OPT", priority: "high" },
  { id: "f1-post-stem-check", stage: "post-completion", title: "If your degree and employer may support STEM OPT, ask your DSO to review the official requirements and timing", priority: "medium" },
  { id: "f1-post-stem-reporting", stage: "post-completion", title: "If on STEM OPT, keep employer, evaluation and reporting dates from your DSO's instructions", priority: "high" },
  { id: "f1-post-grace", stage: "post-completion", title: "Ask your DSO about your grace period and what you must do within it", priority: "high", anchor: "graduation", offsetDays: 0 },
];

const j1 = [
  { id: "j1-arrival-ds2019", stage: "arrival", title: "Check that your DS-2019 matches your passport (name, dates, program)", priority: "high", anchor: "start", offsetDays: -45 },
  { id: "j1-arrival-checkin", stage: "arrival", title: "Complete check-in with your program sponsor or responsible officer", priority: "high", anchor: "start", offsetDays: 14 },
  { id: "j1-enroll-insurance", stage: "enrollment", title: "Confirm your J-1 insurance meets your sponsor's requirements", priority: "high", anchor: "start", offsetDays: 0 },
  { id: "j1-travel-signature", stage: "travel", title: "Ask your responsible officer whether your DS-2019 travel validation is current", priority: "high" },
  { id: "j1-employ-ask", stage: "employment", title: "Ask your responsible officer what work needs written authorization", priority: "high" },
  { id: "j1-employ-at", stage: "employment", title: "Ask your responsible officer whether Academic Training fits your program and what written authorization is required", priority: "high" },
  { id: "j1-grad-at", stage: "graduation", title: "Discuss Academic Training timing with your responsible officer before your program end date", priority: "high", anchor: "graduation", offsetDays: -90 },
  { id: "j1-grad-end", stage: "graduation", title: "Ask your responsible officer about your program end date and grace period", priority: "high", anchor: "graduation", offsetDays: -90 },
];

export function journeyItemsFor(profileOrVisa = "") {
  const profile = typeof profileOrVisa === "object" ? profileOrVisa : { visaType: profileOrVisa };
  const kind = visaCategoryFor(profile) === "j-1" ? "j1" : visaCategoryFor(profile) === "f-1" ? "f1" : "general";
  const specific = kind === "j1" ? j1 : kind === "f1" ? f1 : [];
  const order = new Map(journeyStages.map((stage, index) => [stage.id, index]));
  return [...general, ...specific]
    .map((item) => ({ category: "Journey", ...item }))
    .sort((left, right) => order.get(left.stage) - order.get(right.stage));
}

export const journeyDisclaimer = "General guidance for planning only. Requirements depend on your school, program and situation. Confirm each step with your designated school official or the official source.";
