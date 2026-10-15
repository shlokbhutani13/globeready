const emptyProfile = {
  fullName: "",
  homeCountry: "",
  university: "",
  program: "",
  visaType: "F-1",
  journeyStage: "Preparing for arrival",
};

export function workspaceDefaults() {
  return { profile: { ...emptyProfile }, tasks: [], documents: [] };
}

export function blankProfile() {
  return { ...emptyProfile };
}
