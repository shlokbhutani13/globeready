// "What changed, who it may be tagged for, what to ask your DSO", built only from the reviewed record. Nothing here reads the
// student's profile or decides whether an update applies to them.
const visaLabel = (id) => String(id).toUpperCase();
const stageLabels = { "pre-arrival": "before arrival", arriving: "arriving", arrival: "arrival", arrived: "recently arrived", enrolled: "currently enrolled", graduating: "graduating", opt: "practical training (OPT)" };
const stateQuestion = {
  proposed: "This is only a proposal. Is anything about it likely to matter before it is final?",
  scheduled: "It is scheduled for a future date. What should I prepare before then?",
  delayed: "Its start was delayed. What is the current date, and does that change my plans?",
  enjoined: "A court paused it. What is the current status for students at our school?",
};

function section(heading, body) { return { heading, body: Array.isArray(body) ? body : [body] }; }

export function explainNews(item = {}) {
  const changed = (item.detailSections || []).find((entry) => /what changed/iu.test(entry.heading || ""));
  const whatChanged = changed?.body || item.shortSummary || "";

  const tags = [];
  if (item.visaTypes?.length) tags.push(`visa categories ${item.visaTypes.map(visaLabel).join(", ")}`);
  const stages = (item.journeyStages || []).map((stage) => stageLabels[stage] || stage);
  if (stages.length) tags.push(`students who are ${stages.join(", ")}`);
  const who = tags.length
    ? `The reviewed record tags this update for ${tags.join(" and ")}. A tag is not a decision about you. Whether it applies depends on your own record.`
    : "The reviewed record does not list who this is for. Ask your designated school official whether it applies to you.";

  const questions = ["Does this update affect my record, program or Form I-20/DS-2019?"];
  if (stateQuestion[item.legalState]) questions.push(stateQuestion[item.legalState]);
  if (item.effectiveAt) questions.push(`The record gives ${item.effectiveAt} as the effective date. Does that change any of my dates or plans?`);
  if (item.topics?.includes("travel") || item.topics?.includes("travel-entry")) questions.push("Should I do anything before I next travel or re-enter?");
  if (item.topics?.includes("employment")) questions.push("Does this change my work or practical-training options or timing?");
  questions.push("Where can I read the official text, and who at the school should I follow up with?");

  const sections = [];
  if (whatChanged) sections.push(section("What changed", whatChanged));
  sections.push(section("Who it may be tagged for", who));
  sections.push(section("What to ask your DSO", questions));
  return { sections, asks: questions, basis: `Built from the reviewed record${item.verifiedAt ? ` (reviewed ${item.verifiedAt})` : ""}. Informational only; not legal advice.` };
}
