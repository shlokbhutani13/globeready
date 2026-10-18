import React from "react";
import { MessageSquareText } from "lucide-react";
import { feedbackHref } from "../lib/feedback";

export default function FeedbackLink({ topic = "General", href = feedbackHref({ topic }) }) {
  const external = href.startsWith("https://");
  return <p className="feedback-link"><MessageSquareText size={15} aria-hidden="true" /> <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Something wrong or confusing? Tell us</a>. Please leave out passport, receipt and other private numbers.</p>;
}
