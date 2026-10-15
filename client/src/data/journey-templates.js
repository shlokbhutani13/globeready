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
  { id: "gen-enroll-office", stage: "enrollment", title: "Find your international office hours and your DSO's contact details", priority: "medium", anchor: "start", offsetDays: 7 },
  { id: "gen-travel-docs", stage: "travel", title: "Check passport validity before any trip abroad", priority: "high" },
  { id: "gen-travel-office", stage: "travel", title: "Tell your international office about travel plans before you book", priority: "medium" },
  { id: "gen-employ-ask", stage: "employment", title: "Ask your DSO what work is allowed before accepting any job or internship", priority: "high" },
  { id: "gen-grad-plan", stage: "graduation", title: "Meet your DSO about your options after the program ends", priority: "high", anchor: "graduation", offsetDays: -120 },
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
  { id: "f1-employ-cpt-opt", stage: "employment", title: "Read your school's CPT and OPT pages and ask your DSO about timing", priority: "medium" },
  { id: "f1-grad-opt", stage: "graduation", title: "Ask your DSO about post-completion OPT deadlines and what you need", priority: "high", anchor: "graduation", offsetDays: -150 },
  { id: "f1-post-grace", stage: "post-completion", title: "Ask your DSO about your grace period and what you must do within it", priority: "high", anchor: "graduation", offsetDays: 0 },
];

const j1 = [
  { id: "j1-arrival-ds2019", stage: "arrival", title: "Check that your DS-2019 matches your passport (name, dates, program)", priority: "high", anchor: "start", offsetDays: -45 },
  { id: "j1-arrival-checkin", stage: "arrival", title: "Complete check-in with your program sponsor or responsible officer", priority: "high", anchor: "start", offsetDays: 14 },
  { id: "j1-enroll-insurance", stage: "enrollment", title: "Confirm your J-1 insurance meets your sponsor's requirements", priority: "high", anchor: "start", offsetDays: 0 },
  { id: "j1-travel-signature", stage: "travel", title: "Ask your responsible officer whether your DS-2019 travel validation is current", priority: "high" },
  { id: "j1-employ-ask", stage: "employment", title: "Ask your responsible officer what work needs written authorization", priority: "high" },
  { id: "j1-grad-end", stage: "graduation", title: "Ask your responsible officer about your program end date and grace period", priority: "high", anchor: "graduation", offsetDays: -90 },
];

export function journeyItemsFor(visaType = "") {
  const kind = /j-?1/i.test(visaType) ? "j1" : /f-?1/i.test(visaType) ? "f1" : "general";
  const specific = kind === "j1" ? j1 : kind === "f1" ? f1 : [];
  const order = new Map(journeyStages.map((stage, index) => [stage.id, index]));
  return [...general, ...specific]
    .map((item) => ({ category: "Journey", ...item }))
    .sort((left, right) => order.get(left.stage) - order.get(right.stage));
}

export const journeyDisclaimer = "General guidance for planning only. Requirements depend on your school, program and situation. Confirm each step with your designated school official or the official source.";
