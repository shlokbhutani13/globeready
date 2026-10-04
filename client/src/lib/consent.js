import { apiRequest } from "./api";

// The server is the source of truth for consent: it holds the wording version and the decision of record.
export function fetchConsent() {
  return apiRequest("/api/consent");
}

export function saveConsent(choice) {
  return apiRequest("/api/consent", { method: "PUT", body: JSON.stringify(choice) });
}
