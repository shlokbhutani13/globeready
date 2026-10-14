import React from "react";

// One consistent page opening: what this page is, a sentence of help, and the single primary action.
export default function PageHeader({ eyebrow, title, description, action, children }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}
