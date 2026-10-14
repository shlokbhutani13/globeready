import React from "react";
import { pageHelp } from "../data/page-help";

// Collapsed by default so a returning student sees nothing extra; a new student can open it.
export default function PageHelp({ id }) {
  const help = pageHelp[id];
  if (!help) return null;
  return (
    <details className="page-help">
      <summary>How this page works</summary>
      <p>{help.what}</p>
      <ul>{help.how.map((line) => <li key={line}>{line}</li>)}</ul>
      <p className="muted"><strong>What it does not do:</strong> {help.not}</p>
    </details>
  );
}
