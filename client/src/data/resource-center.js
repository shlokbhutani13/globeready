// Official and well-known public-service resources for common student safety and life questions. Links go to the
// organisation that runs the service. Phone numbers are U.S. numbers; the page says so.
// This list is short on purpose and is not exhaustive. Campus-specific offices belong in the student's own Contacts.

export const resourceCategories = [
  { id: "emergency", label: "Emergency and crisis", blurb: "If someone is in immediate danger, call 911 first." },
  { id: "scams", label: "Scams and fraud", blurb: "Scammers target international students. Slow down, verify, and report." },
  { id: "health", label: "Health", blurb: "Care, mental health support and finding a clinic." },
  { id: "tax", label: "Tax and Social Security", blurb: "Official guidance on taxes, forms and Social Security numbers." },
  { id: "housing", label: "Housing", blurb: "Renting safely and knowing your rights as a tenant." },
  { id: "travel", label: "Travel and entry", blurb: "Official travel and border resources." },
  { id: "campus-safety", label: "Campus safety", blurb: "Safety, reporting and support services." },
];

export const resourceCenter = [
  { id: "call-911", category: "emergency", title: "Emergency services (911)", summary: "For fire, medical emergencies and crimes in progress anywhere in the United States.", phone: "911", agency: "U.S. emergency services" },
  { id: "lifeline-988", category: "emergency", title: "988 Suicide & Crisis Lifeline", summary: "Free, confidential support by call or text for anyone in emotional distress or crisis.", phone: "988", url: "https://988lifeline.org/", agency: "988 Lifeline (SAMHSA)" },
  { id: "ready-gov", category: "emergency", title: "Prepare for disasters", summary: "Official guidance for emergency kits, alerts and evacuation plans.", url: "https://www.ready.gov/", agency: "FEMA" },
  { id: "campus-contacts", category: "emergency", title: "Your campus emergency and safety numbers", summary: "Your university has its own emergency line. Save it in your private Contacts so you can find it fast.", internal: "/contacts", agency: "Your university" },

  { id: "ftc-report-fraud", category: "scams", title: "Report fraud to the FTC", summary: "Report scams, including fake job offers, rental scams and impersonation calls.", url: "https://reportfraud.ftc.gov/", agency: "Federal Trade Commission" },
  { id: "uscis-scams", category: "scams", title: "Avoid immigration scams", summary: "How to spot fake USCIS contacts and unauthorized immigration help, and where to report them.", url: "https://www.uscis.gov/scams-fraud-and-misuse", agency: "U.S. Citizenship and Immigration Services" },
  { id: "ic3", category: "scams", title: "Report internet crime", summary: "File a complaint about online fraud and cybercrime.", url: "https://www.ic3.gov/", agency: "FBI Internet Crime Complaint Center" },
  { id: "eoir-legal-help", category: "scams", title: "Find authorized legal help", summary: "A list of recognized organizations and accredited representatives, to avoid people who only claim they can help.", url: "https://www.justice.gov/eoir/find-legal-help", agency: "U.S. Department of Justice" },

  { id: "samhsa-helpline", category: "health", title: "Mental health and substance use helpline", summary: "Free, confidential, 24/7 treatment referral and information.", phone: "1-800-662-4357", url: "https://www.samhsa.gov/find-help/national-helpline", agency: "SAMHSA" },
  { id: "find-health-center", category: "health", title: "Find a community health center", summary: "Search for a health center near you that provides care regardless of ability to pay.", url: "https://findahealthcenter.hrsa.gov/", agency: "HRSA" },
  { id: "cdc-vaccines", category: "health", title: "Vaccines and immunization", summary: "Official vaccine information. Check your university's immunization requirements as well.", url: "https://www.cdc.gov/vaccines/", agency: "Centers for Disease Control and Prevention" },
  { id: "school-insurance", category: "health", title: "Your health insurance and campus clinic", summary: "Save your insurer and campus health center in your private Contacts.", internal: "/contacts", agency: "Your university and insurer" },

  { id: "irs-foreign-students", category: "tax", title: "Tax guidance for students and scholars", summary: "IRS overview for foreign students, scholars, teachers and researchers.", url: "https://www.irs.gov/individuals/international-taxpayers/foreign-students-scholars-teachers-researchers-and-exchange-visitors", agency: "Internal Revenue Service" },
  { id: "irs-nonresident", category: "tax", title: "Taxation of nonresident aliens", summary: "How the IRS taxes nonresident aliens, with links to forms and publications.", url: "https://www.irs.gov/individuals/international-taxpayers/taxation-of-nonresident-aliens", agency: "Internal Revenue Service" },
  { id: "irs-scam-alerts", category: "tax", title: "Tax scam alerts", summary: "Current warnings about phone, email and text scams that pretend to be the IRS.", url: "https://www.irs.gov/newsroom/tax-scams-consumer-alerts", agency: "Internal Revenue Service" },
  { id: "ssa-number", category: "tax", title: "Social Security numbers", summary: "Who can apply for a Social Security number and how.", url: "https://www.ssa.gov/ssnumber/", agency: "Social Security Administration" },

  { id: "hud-renters", category: "housing", title: "Information for renters", summary: "Tenant rights, fair housing and where to get help with a landlord problem.", url: "https://www.hud.gov/topics/information_for_renters", agency: "U.S. Dept. of Housing and Urban Development" },
  { id: "ftc-rental-scams", category: "housing", title: "Rental listing scams", summary: "Signs of a fake listing, such as a deposit requested before you can see the place.", url: "https://consumer.ftc.gov/articles/rental-listing-scams", agency: "Federal Trade Commission" },

  { id: "state-travel", category: "travel", title: "Visa and travel information", summary: "Official U.S. visa information, including student and exchange visitor visas.", url: "https://travel.state.gov/", agency: "U.S. Department of State" },
  { id: "i94-lookup", category: "travel", title: "Get your I-94 arrival record", summary: "Retrieve your most recent electronic arrival/departure record.", url: "https://i94.cbp.dhs.gov/", agency: "U.S. Customs and Border Protection" },
  { id: "cbp-travel", category: "travel", title: "Arriving in the United States", summary: "What to expect at the border and what you may bring with you.", url: "https://www.cbp.gov/travel", agency: "U.S. Customs and Border Protection" },
  { id: "study-in-the-states", category: "travel", title: "Study in the States", summary: "Official student guidance on travel, status and employment.", url: "https://studyinthestates.dhs.gov/", agency: "Department of Homeland Security" },

  { id: "clery-act", category: "campus-safety", title: "Campus safety and the Clery Act", summary: "What universities must publish about campus crime and safety.", url: "https://www.ed.gov/laws-and-policy/higher-education-laws-and-policy/higher-education-policy/campus-safety-and-security", agency: "U.S. Department of Education" },
  { id: "dv-hotline", category: "campus-safety", title: "National Domestic Violence Hotline", summary: "Free, confidential 24/7 support by phone, chat or text.", phone: "1-800-799-7233", url: "https://www.thehotline.org/", agency: "The National Domestic Violence Hotline" },
  { id: "rainn", category: "campus-safety", title: "Sexual assault support", summary: "Free, confidential 24/7 support from the national sexual assault hotline.", phone: "1-800-656-4673", url: "https://www.rainn.org/", agency: "RAINN" },
  { id: "fbi-tips", category: "campus-safety", title: "Report a crime or threat to the FBI", summary: "Submit a tip about a crime or threat. For emergencies, call 911 instead.", url: "https://tips.fbi.gov/", agency: "Federal Bureau of Investigation" },
];

export const scamTips = [
  "Be suspicious of anyone who demands payment by gift card, cryptocurrency, wire transfer or cash app.",
  "Government agencies do not threaten arrest or deportation by phone, text or email to collect a payment.",
  "Do not pay a deposit or rent for a place you have not seen or a lease you have not read.",
  "Check immigration forms and fees only on the official agency website, not through a search ad or a message.",
  "Never share your passport, I-20 or Social Security number with someone who contacted you first.",
  "If it feels rushed or secret, pause and ask your international office before you act.",
];

export function resourcesIn(category) {
  return resourceCenter.filter((entry) => entry.category === category);
}

const normalize = (text) => String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "");

export function searchResources(query) {
  const terms = normalize(query).split(/[^a-z0-9]+/u).filter((term) => term.length > 1);
  if (!terms.length) return [];
  return resourceCenter.filter((entry) => {
    const haystack = normalize([entry.title, entry.summary, entry.agency, resourceCategories.find((category) => category.id === entry.category)?.label].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}
