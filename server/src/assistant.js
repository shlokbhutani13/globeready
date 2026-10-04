import { classifyQuestion, selectTrustedSources } from "./trusted-resources.js";
import { unavailableNotice } from "./document-assistant.js";

const guidance = {
  ssn: "Confirm your eligibility before an SSN appointment. Prepare your passport, visa, I-20, I-94, and the employment or university letter required for your situation.",
  employment: "Confirm CPT or OPT authorization before accepting off-campus work. Ask your international student office how the role, dates, and academic program affect the required authorization.",
  banking: "Compare monthly fees, minimum balances, ATM access, international-transfer costs, fraud controls, and the identification each bank accepts before opening an account.",
  health: "Check the plan network, deductible, copays, emergency coverage, prescription rules, and campus-health options before choosing where to receive care.",
  tax: "Identify your tax-residency status and required forms before filing. Use your university's international tax support and current IRS instructions instead of assuming resident filing rules apply.",
  status: "Check your I-20, SEVIS status, enrollment requirement, travel signature, address reporting, and employment authorization with your university international student office.",
};

export function createAssistant() {
  return {
    mode: "demo",
    async answer({ question, profile }) {
      const university = profile?.university ? ` at ${profile.university}` : "";
      const topic = classifyQuestion(question);
      return {
        mode: "demo",
        answer: `${guidance[topic]} Confirm the details${university} because university procedures can differ.`,
        question,
        actions: [
          "Open the official source linked below.",
          "Check your university international student office instructions.",
          "Save the relevant deadline or follow-up as a GlobeReady task.",
        ],
        sources: selectTrustedSources(question),
        confidence: "medium",
        disclaimer:
          "This is general information. Verify deadlines and eligibility with official government and university sources.",
      };
    },
    async analyzeDocument({ document }) {
      return {
        summary: `${document.name} is stored in demo mode. Connect Firebase Storage and Gemini to analyze its contents.`,
        importantDates: [],
        actions: ["Verify the document with your university international student office."],
        terms: [],
        confidence: "low",
        disclaimer: "Demo mode does not read file contents. Verify all details with an official source.",
        mode: "demo",
      };
    },
  };
}

export function createLocalFallback() {
  return {
    mode: "local",
    async answer({ question }) {
      return {
        mode: "local",
        answer: "No passage in your uploaded documents answers this question.",
        question,
        actions: ["Ask a more specific question about a document you uploaded, or check an official source."],
        sources: selectTrustedSources(question),
        confidence: "low",
        disclaimer: "General information. Verify deadlines and eligibility with official government and university sources.",
      };
    },
    async analyzeDocument({ document }) {
      return {
        summary: `${document.name} could not be read in local mode.`,
        importantDates: [],
        actions: [],
        terms: [],
        confidence: "low",
        disclaimer: "Verify all details with an official source.",
        mode: "local",
      };
    },
  };
}

// Used in production when no document storage is configured. It never returns guidance text that could be
// mistaken for an answer grounded in the student's documents or in a model.
export function createUnavailableAssistant() {
  return {
    mode: "unavailable",
    async answer({ question }) {
      return {
        mode: "unavailable",
        answer: "",
        question,
        evidence: "unavailable",
        notice: unavailableNotice,
        documentCitations: [],
        sources: selectTrustedSources(question),
        confidence: "low",
        disclaimer: "General information only. Confirm with your university and official sources.",
      };
    },
    async indexDocument() {
      throw Object.assign(new Error("Document indexing is unavailable."), {
        code: "document_index_unavailable",
        safeMessage: "Document reading is not available right now. Your upload is saved; try again later.",
        retryable: true,
        status: 503,
      });
    },
    async analyzeDocument() {
      throw Object.assign(new Error("Document analysis is unavailable."), {
        code: "document_index_unavailable",
        safeMessage: "Document reading is not available right now. Your upload is saved; try again later.",
        retryable: true,
        status: 503,
      });
    },
  };
}
