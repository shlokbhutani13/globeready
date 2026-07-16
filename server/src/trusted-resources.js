const resources = [
  {
    id: "status",
    keywords: /\b(f-?1|visa|i-20|travel|status|sevis|enrollment)\b/i,
    title: "Maintaining Status",
    organization: "Study in the States",
    url: "https://studyinthestates.dhs.gov/students/maintaining-status",
  },
  {
    id: "employment",
    keywords: /\b(cpt|opt|employment|work|job|internship)\b/i,
    title: "Students and Employment",
    organization: "USCIS",
    url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment",
  },
  {
    id: "ssn",
    keywords: /\b(ssn|social security)\b/i,
    title: "Social Security numbers for noncitizens",
    organization: "Social Security Administration",
    url: "https://www.ssa.gov/pubs/EN-05-10096.pdf",
  },
  {
    id: "banking",
    keywords: /\b(bank|banking|account|debit|credit|transfer)\b/i,
    title: "Bank accounts",
    organization: "Consumer Financial Protection Bureau",
    url: "https://www.consumerfinance.gov/consumer-tools/bank-accounts/",
  },
  {
    id: "health",
    keywords: /\b(health|insurance|doctor|hospital|urgent care|deductible)\b/i,
    title: "Using your health insurance coverage",
    organization: "HealthCare.gov",
    url: "https://www.healthcare.gov/using-marketplace-coverage/",
  },
  {
    id: "tax",
    keywords: /\b(tax|irs|1040|8843|w-2|filing)\b/i,
    title: "Foreign students and exchange visitors",
    organization: "Internal Revenue Service",
    url: "https://www.irs.gov/individuals/international-taxpayers/foreign-students-scholars-teachers-researchers-and-exchange-visitors",
  },
];

export function selectTrustedSources(question = "") {
  const matches = resources.filter((resource) => resource.keywords.test(question));
  const selected = matches.length ? matches : [resources[0]];
  return selected.slice(0, 2).map(({ keywords, id, ...source }) => source);
}

export function classifyQuestion(question = "") {
  return resources.find((resource) => resource.keywords.test(question))?.id || "status";
}
