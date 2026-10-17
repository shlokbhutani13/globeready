const programLevelMap = new Map([
  ["undergraduate", "undergraduate"], ["master's", "masters"], ["masters", "masters"],
  ["doctoral", "phd"], ["phd", "phd"], ["non-degree / exchange", "other"], ["other", "other"],
]);
const visaMap = new Map([["f-1", "f-1"], ["f1", "f-1"], ["j-1", "j-1"], ["j1", "j-1"], ["other", "other"]]);
const stageMap = new Map([
  ["pre-arrival", "pre-arrival"], ["preparing for arrival", "pre-arrival"],
  ["arrived", "arrived"], ["newly arrived", "arrived"],
  ["studying", "studying"], ["current student", "studying"], ["preparing for graduation", "studying"],
  ["post-completion", "post-completion"],
]);

const normalized = (value) => String(value || "").trim().toLocaleLowerCase();
export const visaCategoryFor = (profile = {}) => visaMap.get(normalized(profile.visaCategory || profile.visaType)) || "";
export const studentStageFor = (profile = {}) => stageMap.get(normalized(profile.studentStage || profile.journeyStage)) || "";
export const programLevelFor = (profile = {}) => programLevelMap.get(normalized(profile.programLevel || profile.degreeLevel)) || "";

const trainingChoices = Object.freeze({
  "f-1": [
    ["not-reported", "Not reported"], ["not-planning", "Not planning practical training"],
    ["considering-cpt", "Considering CPT"], ["cpt-authorized", "CPT authorized"],
    ["considering-opt", "Considering OPT"], ["opt-pending", "OPT application pending"],
    ["opt-authorized", "OPT authorized"], ["stem-opt-pending", "STEM OPT application pending"],
    ["stem-opt-authorized", "STEM OPT authorized"], ["completed", "Practical training completed"],
  ],
  "j-1": [
    ["not-reported", "Not reported"], ["not-planning", "Not planning Academic Training"],
    ["considering-academic-training", "Considering Academic Training"],
    ["academic-training-authorized", "Academic Training authorized"], ["completed", "Academic Training completed"],
  ],
  other: [["not-reported", "Not reported"], ["not-applicable", "Not applicable"], ["other", "Other"]],
});

export function trainingChoicesFor(visaCategory) {
  return (trainingChoices[visaMap.get(normalized(visaCategory)) || "other"] || trainingChoices.other)
    .map(([id, label]) => ({ id, label }));
}

export function normalizeStudentProfile(profile = {}) {
  const visaCategory = visaCategoryFor(profile) || "other";
  const allowedTraining = new Set(trainingChoicesFor(visaCategory).map((item) => item.id));
  const trainingStatus = allowedTraining.has(profile.trainingStatus) ? profile.trainingStatus : "not-reported";
  return {
    ...profile,
    programLevel: programLevelFor(profile) || "other",
    visaCategory,
    studentStage: studentStageFor(profile) || "pre-arrival",
    trainingStatus,
  };
}

export const profileClaimNotice = "Reported by you, not verified.";
