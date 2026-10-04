const referrals = [
  {
    pattern: /\b(lawyer|attorney|deport\w*|removal|asylum|overstay\w*|denied|denial|court|criminal|violat\w*)\b/i,
    message: "This question involves legal consequences. Speak with a licensed immigration attorney, and contact your Designated School Official (DSO) for guidance on your record.",
  },
  {
    pattern: /\b(tax|taxes|irs|1040|8843|w-2|filing|refund)\b/i,
    message: "This question involves tax obligations. Confirm the requirements with a qualified tax professional or your university's international tax office.",
  },
  {
    pattern: /\b(doctor|medical|symptom\w*|pain|prescription|hospital|injur\w*|sick|emergency)\b/i,
    message: "This question involves health. Contact a doctor or your campus health center; for an emergency, call 911.",
  },
  {
    pattern: /\b(status|sevis|i-20|reinstat\w*|unauthori[sz]ed|cpt|opt|travel signature)\b/i,
    message: "This question involves your immigration status. Confirm it with your Designated School Official (DSO), who can check your SEVIS record.",
  },
];

export function referralFor(question = "") {
  const match = referrals.find(({ pattern }) => pattern.test(question));
  return match ? { message: match.message } : null;
}
