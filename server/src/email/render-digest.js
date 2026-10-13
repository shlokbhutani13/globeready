function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function officialHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname.endsWith(".gov") || url.hostname.endsWith(".edu")) ? url.href : null;
  } catch {
    return null;
  }
}

export function renderDigestEmail(digest = {}) {
  const frequency = digest.frequency === "daily" ? "Daily" : "Weekly";
  const text = [`GlobeReady ${frequency.toLowerCase()} update digest`];
  const html = [`<h1>GlobeReady ${frequency.toLowerCase()} update digest</h1>`];
  for (const section of Array.isArray(digest.sections) ? digest.sections : []) {
    text.push("", String(section.title || "Updates"));
    html.push(`<h2>${escapeHtml(section.title || "Updates")}</h2>`, "<ul>");
    for (const item of Array.isArray(section.items) ? section.items : []) {
      const link = officialHttps(item.canonicalUrl);
      text.push(`- ${item.title}${link ? ` — ${link}` : ""}`);
      html.push(`<li>${link ? `<a href="${escapeHtml(link)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</li>`);
    }
    html.push("</ul>");
  }
  text.push("", `Unsubscribe or change digest settings: ${digest.unsubscribeUrl || "Open GlobeReady settings."}`);
  html.push("<p>Change or unsubscribe from digest email in GlobeReady settings.</p>");
  return { subject: `Your GlobeReady ${frequency.toLowerCase()} digest`, text: text.join("\n"), html: html.join("") };
}
