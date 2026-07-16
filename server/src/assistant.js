const sources = [
  {
    title: "Social Security numbers for noncitizens",
    organization: "Social Security Administration",
    url: "https://www.ssa.gov/pubs/EN-05-10096.pdf",
  },
  {
    title: "Students and Employment",
    organization: "USCIS",
    url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment",
  },
];

export function createAssistant() {
  return {
    async answer({ question, profile }) {
      const university = profile?.university ? ` at ${profile.university}` : "";
      return {
        mode: "demo",
        answer:
          `For an SSN appointment${university}, first confirm your employment eligibility and ` +
          "gather your passport, visa, I-20, I-94, and employment letter. Check the SSA page and " +
          "your international student office before attending because requirements can vary.",
        question,
        actions: [
          "Confirm that your SEVIS record is active.",
          "Ask your international student office which employment letter format it requires.",
          "Use the SSA office locator and keep copies of submitted documents.",
        ],
        sources,
        confidence: "medium",
        disclaimer:
          "This is general information. Verify deadlines and eligibility with official government and university sources.",
      };
    },
  };
}
