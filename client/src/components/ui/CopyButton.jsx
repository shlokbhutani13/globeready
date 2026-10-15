import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

// Click-to-copy for phone numbers and email addresses. If the browser blocks clipboard access, the value stays visible
// and selectable and the button says so instead of pretending it worked.
export default function CopyButton({ value, label, clipboard = globalThis.navigator?.clipboard }) {
  const [state, setState] = useState("idle");
  const copy = async () => {
    try {
      if (!clipboard?.writeText) throw new Error("unavailable");
      await clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <button type="button" className="copy-button" onClick={copy} aria-label={`Copy ${label}`}>
      {state === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      <span role="status">{state === "copied" ? "Copied" : state === "failed" ? "Copy not available. Select the text instead." : "Copy"}</span>
    </button>
  );
}
