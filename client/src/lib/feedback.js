// A feedback link that costs nothing and collects nothing: it opens the student's own email app (or the public
// issue tracker when the owner has not published a contact address). No data is sent by GlobeReady itself.
const issueUrl = "https://github.com/shlokbhutani13/globeready/issues/new";

export function feedbackHref({ contact = import.meta.env.VITE_PRIVACY_CONTACT, topic = "General" } = {}) {
  const address = typeof contact === "string" ? contact.trim() : "";
  const subject = `GlobeReady feedback: ${String(topic).slice(0, 60)}`;
  const body = "What were you trying to do?\n\nWhat happened instead?\n\n(Please do not include passport numbers, receipt numbers or other private details.)";
  if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(address)) {
    return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  return `${issueUrl}?title=${encodeURIComponent(subject)}`;
}
