const emptyProfile = {
  fullName: "",
  homeCountry: "",
  university: "",
  program: "",
  programLevel: "other",
  visaCategory: "f-1",
  studentStage: "pre-arrival",
  trainingStatus: "not-reported",
};

export function workspaceDefaults() {
  return { profile: { ...emptyProfile }, tasks: [], documents: [] };
}

export function blankProfile() {
  return { ...emptyProfile };
}
