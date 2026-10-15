// Plain-language meanings of terms students meet. These are general explanations, not legal definitions, and they avoid
// numbers and deadlines that depend on a student's category. Your designated school official has the answer for you.
export const glossary = [
  { id: "dso", term: "DSO (designated school official)", short: "DSO", meaning: "The staff member at your school who manages F-1 student records in SEVIS and issues your I-20. Often in the international student office. Your first contact for status questions." },
  { id: "ro", term: "RO or ARO (responsible officer)", short: "RO", meaning: "The J-1 sponsor's staff member who manages exchange visitor records and issues the DS-2019. The J-1 counterpart of a DSO." },
  { id: "i20", term: "Form I-20", short: "I-20", meaning: "The Certificate of Eligibility your school issues for F-1 status. It shows your program, dates and funding, and your DSO signs it for travel.", to: "/rules" },
  { id: "ds2019", term: "Form DS-2019", short: "DS-2019", meaning: "The Certificate of Eligibility your J-1 sponsor issues. It shows your program and dates.", to: "/rules" },
  { id: "sevis", term: "SEVIS", short: "SEVIS", meaning: "The government database where schools and sponsors record information about F, M and J students and exchange visitors. Your DSO or RO updates your record there." },
  { id: "sevp", term: "SEVP (Student and Exchange Visitor Program)", short: "SEVP", meaning: "The part of U.S. Immigration and Customs Enforcement that oversees SEVIS and the schools that may enroll F and M students." },
  { id: "sevis-fee", term: "SEVIS fee (Form I-901)", short: "SEVIS fee", meaning: "A fee paid to fund SEVIS, usually before the visa interview or arrival. The official page shows who pays and the current amount.", to: "/rules" },
  { id: "visa-vs-status", term: "Visa and status", short: "Visa vs status", meaning: "The visa is the stamp in your passport that lets you ask to enter. Status is your permission to stay and what you may do while here, which depends on following the rules of your category. They can end on different dates." },
  { id: "i94", term: "Form I-94", short: "I-94", meaning: "Your electronic arrival and departure record. It shows how you were admitted and until when, if a date applies. Check it after you arrive.", to: "/rules" },
  { id: "ds", term: "Duration of status (D/S)", short: "D/S", meaning: "The former practice of admitting F and J students for as long as they keep up their program, without a fixed end date. A final rule replaces it with fixed admission periods. Read the rule and ask your DSO how it applies to you.", to: "/rules" },
  { id: "admission-period", term: "Admission period", short: "Admit until", meaning: "The period you were authorized to stay when admitted. Check the date on your I-94 and talk to your DSO if anything looks wrong." },
  { id: "opt", term: "OPT (Optional Practical Training)", short: "OPT", meaning: "Temporary work related to your field of study that F-1 students may be able to do before or after finishing a program. It usually needs your DSO's recommendation and work authorization from USCIS." },
  { id: "stem-opt", term: "STEM OPT extension", short: "STEM OPT", meaning: "An extension of OPT for certain STEM degrees. It involves your employer and a training plan, so start with your DSO." },
  { id: "cpt", term: "CPT (Curricular Practical Training)", short: "CPT", meaning: "Off-campus work that is part of your curriculum. Your DSO must authorize it on your I-20 before you start." },
  { id: "ead", term: "EAD (Employment Authorization Document)", short: "EAD", meaning: "The card that shows you have permission to work. For OPT it is requested on Form I-765.", to: "/rules" },
  { id: "i765", term: "Form I-765", short: "I-765", meaning: "The application to USCIS for employment authorization, including OPT.", to: "/rules" },
  { id: "grace-period", term: "Grace period", short: "Grace period", meaning: "A short time after a program or authorized work ends during which some students may remain. Its length depends on your category, so confirm it with your DSO." },
  { id: "change-of-status", term: "Change or extension of status", short: "Change of status", meaning: "A request to USCIS to change to a different category or to extend your stay, often on Form I-539. Ask your DSO before you file." },
  { id: "travel-signature", term: "Travel signature", short: "Travel signature", meaning: "Your DSO's signature on your I-20 that you carry when you re-enter the United States. Ask your DSO how recent it must be." },
  { id: "receipt-notice", term: "Receipt notice (I-797C)", short: "Receipt notice", meaning: "The notice USCIS sends to say it received your application. It carries your receipt number, which you can use to check status on the official site." },
  { id: "rfe", term: "RFE (request for evidence)", short: "RFE", meaning: "A notice asking you to send more documents. The notice states the response deadline. Keep the date and talk to your DSO or a qualified adviser." },
  { id: "uscis", term: "USCIS", short: "USCIS", meaning: "U.S. Citizenship and Immigration Services. It decides applications such as work authorization and extensions." },
  { id: "cbp", term: "CBP", short: "CBP", meaning: "U.S. Customs and Border Protection. Its officers inspect travelers at the border and create your I-94." },
  { id: "ssn", term: "Social Security number (SSN)", short: "SSN", meaning: "A nine-digit number used for work and taxes. Eligibility depends on your work authorization, so check with your DSO and the Social Security Administration first.", to: "/rules" },
  { id: "form-8843", term: "Form 8843", short: "8843", meaning: "A tax form many students and scholars file to explain days they are exempt from counting toward residency for tax. The IRS explains who files.", to: "/rules" },
];

const normalize = (text) => String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "");

export function searchGlossary(query, entries = glossary) {
  const terms = normalize(query).split(/\s+/u).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter((entry) => {
    const haystack = normalize(`${entry.term} ${entry.short} ${entry.meaning}`);
    return terms.every((term) => haystack.includes(term));
  });
}
