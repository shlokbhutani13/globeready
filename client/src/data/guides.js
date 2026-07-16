export const guides = [
  ["visa", "Maintain F-1 status", "Visa", "Understand enrollment, travel signatures, address updates, and employment limits.", "U.S. Immigration and Customs Enforcement", "https://studyinthestates.dhs.gov/students/maintaining-status"],
  ["cpt-opt", "CPT and OPT orientation", "Employment", "Prepare questions for your international office before accepting off-campus work.", "USCIS", "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment"],
  ["ssn", "Prepare for an SSN appointment", "Identity", "Review eligibility, supporting documents, office locations, and processing expectations.", "Social Security Administration", "https://www.ssa.gov/pubs/EN-05-10096.pdf"],
  ["banking", "Set up U.S. banking", "Money", "Compare account fees, transfer options, fraud controls, and required documents.", "Consumer Financial Protection Bureau", "https://www.consumerfinance.gov/consumer-tools/bank-accounts/"],
  ["health", "Use health insurance confidently", "Healthcare", "Learn the difference between campus care, urgent care, emergency rooms, deductibles, and networks.", "HealthCare.gov", "https://www.healthcare.gov/using-marketplace-coverage/"],
  ["tax", "International student tax basics", "Tax", "Track forms and deadlines, then use university or IRS resources for filing support.", "Internal Revenue Service", "https://www.irs.gov/individuals/international-taxpayers/foreign-students-scholars-teachers-researchers-and-exchange-visitors"],
].map(([id, title, category, summary, source, url]) => ({
  id, title, category, summary, source, url, reviewed: "July 2026",
}));
