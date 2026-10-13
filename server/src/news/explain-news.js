export async function explainPublishedNews({ item, profile, question, provider }) {
  if (!item?.canonicalUrl || !item?.title) throw new Error("Published news evidence is incomplete.");
  const userQuestion = typeof question === "string" ? question.trim().slice(0, 500) : "";
  const prompt = [
    `Explain this verified news story in plain language: ${item.title}.`,
    `Official excerpt: ${item.sourceExcerpt || item.excerpt || item.shortSummary || "No excerpt available."}`,
    userQuestion ? `Student question: ${userQuestion}` : "Explain what changed, who may be affected, and practical next questions.",
  ].join("\n");
  const result = await provider.answer({ question: prompt, profile: profile || {}, allowDocuments: false });
  return {
    answer: result.answer || result.notice || "An explanation is not available right now.",
    confidence: result.confidence || "low",
    sources: [{ title: item.publisher || "Official source", url: item.canonicalUrl }],
    disclaimer: "General information only. Verify requirements with the official source and your international student office.",
  };
}
