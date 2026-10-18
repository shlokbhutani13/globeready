import React, { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { feedbackHref } from "../lib/feedback";

export default function FeedbackLink({ topic = "General", href = feedbackHref({ topic }) }) {
  const [copied, setCopied] = useState(false);
  const external = href.startsWith("https://");
  const address = href.startsWith("mailto:") ? decodeURIComponent(href.slice(7).split("?")[0]) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <p className="feedback-link">
      <MessageSquareText size={15} aria-hidden="true" />
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Something wrong or confusing? Tell us</a>.
      {address && <span> No email app? Write to <strong>{address}</strong> <button type="button" className="button secondary" onClick={copy}>{copied ? "Copied" : "Copy address"}</button></span>}
      <span> Please leave out passport, receipt and other private numbers.</span>
    </p>
  );
}
