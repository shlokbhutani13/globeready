// A reviewed library of official immigration rules, regulations, forms and agency guidance for international students.
//
// GlobeReady links to the official page. It does not copy form editions, fees or filing instructions, because those
// change; always confirm on the official page. "listedOn" is the date the entry was added to this library, not a legal
// verification date. Nothing here is legal advice or a conclusion about any individual.

const listedOn = "2026-10-14";

export const rulesLibrary = [
  {
    id: "fixed-admission-final-rule",
    kind: "rule",
    title: "Fixed admission periods for F, J and I categories",
    agency: "U.S. Department of Homeland Security",
    summary: "Final rule that replaces duration-of-status admission with fixed admission periods and sets an extension-of-stay procedure for F, J and I nonimmigrants.",
    sourceUrl: "https://www.federalregister.gov/documents/2026/07/17/2026-14439/establishing-a-fixed-time-period-of-admission-and-an-extension-of-stay-procedure-for-nonimmigrant",
    citation: "Federal Register, 2026-14439 (docket ICEB-2025-0001)",
    publishedAt: "2026-07-17",
    effectiveAt: "2026-09-15",
    status: "current",
    supersedes: ["duration-of-status-admission"],
    newsIds: ["federal-register-2026-14439"],
    visaTypes: ["f-1", "j-1"],
    topics: ["status", "travel-entry", "employment"],
    journeyStages: ["enrolled", "graduating", "opt", "arrived"],
    keywords: ["admission period", "extension of stay", "d/s", "duration of status", "i-94"],
    listedOn,
  },
  {
    id: "duration-of-status-admission",
    kind: "rule",
    title: "Duration-of-status admission (replaced)",
    agency: "U.S. Department of Homeland Security",
    summary: "The long-standing practice of admitting F and J students for the \"duration of status\" rather than a fixed date. The final rule above replaces it. Read the rule for how the change applies to people already in the United States.",
    sourceUrl: "https://www.federalregister.gov/documents/2026/07/17/2026-14439/establishing-a-fixed-time-period-of-admission-and-an-extension-of-stay-procedure-for-nonimmigrant",
    citation: "Replaced by Federal Register 2026-14439",
    publishedAt: null,
    effectiveAt: "2026-09-15",
    status: "superseded",
    supersededBy: "fixed-admission-final-rule",
    newsIds: ["federal-register-2026-14439"],
    visaTypes: ["f-1", "j-1"],
    topics: ["status", "travel-entry"],
    journeyStages: ["enrolled", "arrived"],
    keywords: ["d/s", "duration of status"],
    listedOn,
  },
  {
    id: "cfr-8-214-2-f",
    kind: "regulation",
    title: "8 CFR 214.2(f): F-1 student regulations",
    agency: "Electronic Code of Federal Regulations",
    summary: "The federal regulation that governs F-1 admission, maintenance of status, transfers, program changes, on-campus work, CPT and OPT. Parts of it are changed by newer rules, so read the current text.",
    sourceUrl: "https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-214/section-214.2",
    citation: "8 CFR 214.2",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1"],
    topics: ["status", "employment", "travel-entry"],
    journeyStages: ["pre-arrival", "arrived", "enrolled", "graduating", "opt"],
    keywords: ["cpt", "opt", "regulation", "status"],
    listedOn,
  },
  {
    id: "cfr-22-62",
    kind: "regulation",
    title: "22 CFR Part 62: Exchange Visitor Program",
    agency: "Electronic Code of Federal Regulations",
    summary: "The Department of State regulations for J-1 exchange visitors, including sponsor responsibilities, program categories, employment, and the two-year home-residence requirement.",
    sourceUrl: "https://www.ecfr.gov/current/title-22/chapter-I/subchapter-G/part-62",
    citation: "22 CFR Part 62",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["j-1"],
    topics: ["status", "employment"],
    journeyStages: ["pre-arrival", "arrived", "enrolled", "graduating"],
    keywords: ["j-1", "exchange visitor", "sponsor"],
    listedOn,
  },
  {
    id: "maintaining-f1-status",
    kind: "guidance",
    title: "Maintaining F-1 status",
    agency: "Study in the States (DHS)",
    summary: "Official guidance on enrollment, address reporting, travel, and employment limits for F-1 students.",
    sourceUrl: "https://studyinthestates.dhs.gov/students/maintaining-status",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1"],
    topics: ["status", "campus-life"],
    journeyStages: ["arrived", "enrolled"],
    keywords: ["enrollment", "address", "travel signature"],
    listedOn,
  },
  {
    id: "students-and-employment",
    kind: "guidance",
    title: "Students and employment",
    agency: "U.S. Citizenship and Immigration Services",
    summary: "USCIS overview of on-campus work, curricular and optional practical training, and related employment authorization.",
    sourceUrl: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1", "j-1"],
    topics: ["employment"],
    journeyStages: ["enrolled", "graduating", "opt"],
    keywords: ["cpt", "opt", "stem opt", "work authorization"],
    listedOn,
  },
  {
    id: "student-visa-state-dept",
    kind: "guidance",
    title: "Student visa (F and M)",
    agency: "U.S. Department of State",
    summary: "How to apply for a student visa abroad, including the visa interview, required forms, and what to bring.",
    sourceUrl: "https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1"],
    topics: ["travel-entry", "forms-fees"],
    journeyStages: ["pre-arrival"],
    keywords: ["visa interview", "ds-160", "sevis fee"],
    listedOn,
  },
  {
    id: "exchange-visitor-state-dept",
    kind: "guidance",
    title: "Exchange visitor visa (J)",
    agency: "U.S. Department of State",
    summary: "How J-1 exchange visitors apply for a visa, what a sponsor provides, and where to find program information.",
    sourceUrl: "https://travel.state.gov/content/travel/en/us-visas/study/exchange-visitor-visa.html",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["j-1"],
    topics: ["travel-entry", "forms-fees"],
    journeyStages: ["pre-arrival"],
    keywords: ["ds-2019", "j-1 visa"],
    listedOn,
  },
  {
    id: "form-i-20-sevp",
    kind: "form",
    title: "Form I-20: Certificate of Eligibility (F-1)",
    agency: "Student and Exchange Visitor Program (ICE)",
    summary: "Issued by your school's designated school official. It carries your program dates and travel signatures. SEVP explains how it is used; your school answers questions about your own I-20.",
    sourceUrl: "https://www.ice.gov/sevis",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1"],
    topics: ["status", "travel-entry", "forms-fees"],
    journeyStages: ["pre-arrival", "arrived", "enrolled", "graduating", "opt"],
    keywords: ["i-20", "sevis", "dso", "program end date"],
    listedOn,
  },
  {
    id: "form-ds-2019",
    kind: "form",
    title: "Form DS-2019: Certificate of Eligibility (J-1)",
    agency: "U.S. Department of State, Exchange Visitor Program",
    summary: "Issued by your J-1 program sponsor. The official J-1 site explains sponsors, program categories and responsible officers.",
    sourceUrl: "https://j1visa.state.gov/",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["j-1"],
    topics: ["status", "travel-entry", "forms-fees"],
    journeyStages: ["pre-arrival", "arrived", "enrolled", "graduating"],
    keywords: ["ds-2019", "sponsor", "responsible officer"],
    listedOn,
  },
  {
    id: "form-i-901-sevis-fee",
    kind: "form",
    title: "Form I-901: SEVIS fee",
    agency: "Student and Exchange Visitor Program (ICE)",
    summary: "The SEVIS I-901 fee is paid before a visa interview or entry. ICE publishes who pays and how; check the official page for the current amount.",
    sourceUrl: "https://www.ice.gov/sevis/i901",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1", "j-1"],
    topics: ["forms-fees", "travel-entry"],
    journeyStages: ["pre-arrival"],
    keywords: ["i-901", "sevis fee", "fee"],
    listedOn,
  },
  {
    id: "form-ds-160",
    kind: "form",
    title: "Form DS-160: Online Nonimmigrant Visa Application",
    agency: "U.S. Department of State",
    summary: "The online application for most nonimmigrant visas, including F-1 and J-1. Complete it before your visa interview.",
    sourceUrl: "https://ceac.state.gov/genniv/",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1", "j-1"],
    topics: ["forms-fees", "travel-entry"],
    journeyStages: ["pre-arrival"],
    keywords: ["ds-160", "visa application"],
    listedOn,
  },
  {
    id: "form-i-94",
    kind: "form",
    title: "Form I-94: Arrival/Departure Record",
    agency: "U.S. Customs and Border Protection",
    summary: "Your electronic arrival record. Retrieve and check it after you enter the United States, and share concerns with your school official.",
    sourceUrl: "https://i94.cbp.dhs.gov/",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1", "j-1"],
    topics: ["status", "travel-entry"],
    journeyStages: ["arrived", "enrolled", "pre-arrival"],
    keywords: ["i-94", "admit until", "arrival record"],
    listedOn,
  },
  {
    id: "form-i-765",
    kind: "form",
    title: "Form I-765: Application for Employment Authorization",
    agency: "U.S. Citizenship and Immigration Services",
    summary: "Used to request employment authorization, including post-completion and STEM OPT. USCIS lists the current edition, fee and filing location.",
    sourceUrl: "https://www.uscis.gov/i-765",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1"],
    topics: ["employment", "forms-fees"],
    journeyStages: ["graduating", "opt", "enrolled"],
    keywords: ["i-765", "ead", "opt", "stem opt", "employment authorization"],
    listedOn,
  },
  {
    id: "form-i-539",
    kind: "form",
    title: "Form I-539: Application to Extend/Change Nonimmigrant Status",
    agency: "U.S. Citizenship and Immigration Services",
    summary: "Used to request an extension of stay or change of status for many nonimmigrants. Ask your school official how it applies to your situation.",
    sourceUrl: "https://www.uscis.gov/i-539",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1", "j-1"],
    topics: ["status", "forms-fees"],
    journeyStages: ["enrolled", "graduating"],
    keywords: ["i-539", "extension of stay", "change of status"],
    listedOn,
  },
  {
    id: "form-ss-5",
    kind: "form",
    title: "Form SS-5: Application for a Social Security Card",
    agency: "Social Security Administration",
    summary: "Used to request a Social Security number or replacement card. Eligibility depends on work authorization, so check the SSA page and ask your school official first.",
    sourceUrl: "https://www.ssa.gov/forms/ss-5.pdf",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1", "j-1"],
    topics: ["taxes-social-security", "employment"],
    journeyStages: ["arrived", "enrolled", "opt"],
    keywords: ["ssn", "ss-5", "social security number"],
    listedOn,
  },
  {
    id: "form-8843",
    kind: "form",
    title: "Form 8843: Statement for Exempt Individuals",
    agency: "Internal Revenue Service",
    summary: "A tax form many students and scholars file to explain days they are exempt from the substantial presence test. The IRS explains who files and when; your university may offer tax help.",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-form-8843",
    publishedAt: null,
    effectiveAt: null,
    status: "reference",
    visaTypes: ["f-1", "j-1"],
    topics: ["taxes-social-security"],
    journeyStages: ["enrolled", "arrived", "opt"],
    keywords: ["8843", "tax", "substantial presence"],
    listedOn,
  },
];

export const rulesFilters = {
  kinds: [
    { id: "rule", label: "Rules" },
    { id: "regulation", label: "Regulations" },
    { id: "form", label: "Forms" },
    { id: "guidance", label: "Agency guidance" },
  ],
  statuses: [
    { id: "current", label: "Current rule" },
    { id: "reference", label: "Ongoing reference" },
    { id: "superseded", label: "Superseded" },
  ],
  visas: [{ id: "f-1", label: "F-1" }, { id: "j-1", label: "J-1" }],
  topics: [
    { id: "status", label: "Status" },
    { id: "employment", label: "Employment" },
    { id: "travel-entry", label: "Travel and entry" },
    { id: "forms-fees", label: "Forms and fees" },
    { id: "taxes-social-security", label: "Taxes and Social Security" },
    { id: "campus-life", label: "Campus life" },
  ],
};

const normalize = (text) => String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "");

export function filterRules(entries = rulesLibrary, { query = "", kind = "", status = "", visa = "", topic = "", hideSuperseded = false } = {}) {
  const terms = normalize(query).split(/\s+/u).filter(Boolean);
  return entries.filter((entry) => {
    if (kind && entry.kind !== kind) return false;
    if (status && entry.status !== status) return false;
    if (visa && !(entry.visaTypes || []).includes(visa)) return false;
    if (topic && !(entry.topics || []).includes(topic)) return false;
    if (hideSuperseded && entry.status === "superseded") return false;
    if (!terms.length) return true;
    const haystack = normalize([entry.title, entry.agency, entry.summary, entry.citation, ...(entry.keywords || [])].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}

export function effectiveLabel(entry) {
  if (!entry) return "";
  if (entry.effectiveAt) return `Effective ${entry.effectiveAt}`;
  return "Ongoing reference page with no single effective date";
}

const byId = (id) => rulesLibrary.find((entry) => entry.id === id);

// The older entry first, then what replaced it (and so on).
export function supersessionChain(id) {
  let current = byId(id);
  if (!current) return [];
  while (current.supersedes?.length && byId(current.supersedes[0])) current = byId(current.supersedes[0]);
  const chain = [current];
  while (current.supersededBy && byId(current.supersededBy)) {
    current = byId(current.supersededBy);
    chain.push(current);
  }
  return chain.length > 1 ? chain : [];
}

export function rulesForNews(newsId) {
  return rulesLibrary.filter((entry) => (entry.newsIds || []).includes(newsId));
}

export function relatedRules(id, limit = 3) {
  const entry = byId(id);
  if (!entry) return [];
  return rulesLibrary
    .filter((other) => other.id !== id && other.status !== "superseded")
    .map((other) => ({ other, score: (other.topics || []).filter((topic) => (entry.topics || []).includes(topic)).length + (other.kind === entry.kind ? 0.5 : 0) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ other }) => other);
}
