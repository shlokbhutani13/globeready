export function createDisabledEmailDelivery() {
  return Object.freeze({
    enabled: false,
    async deliver() {
      return { status: "disabled", retryable: false, providerMessageId: null };
    },
  });
}

export function normalizeDeliveryResult(result) {
  if (!result || !["sent", "retryable", "permanent-failure", "disabled"].includes(result.status)) {
    throw new Error("Email delivery returned an invalid result.");
  }
  if (result.status === "sent" && (typeof result.providerMessageId !== "string" || !result.providerMessageId)) {
    throw new Error("Sent email requires a provider message ID.");
  }
  return {
    status: result.status,
    retryable: result.status === "retryable",
    providerMessageId: result.providerMessageId || null,
  };
}
