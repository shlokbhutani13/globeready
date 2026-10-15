import React from "react";

// Feedback with a text prefix, so meaning never depends on colour.
const prefixes = { error: "Problem", success: "Done", info: "Note", warning: "Heads up" };

export default function Notice({ tone = "info", children, action }) {
  const live = tone === "error" ? { role: "alert" } : { role: "status" };
  return (
    <div className={`notice notice-${tone}`} {...live}>
      <p><strong>{prefixes[tone]}:</strong> {children}</p>
      {action}
    </div>
  );
}
