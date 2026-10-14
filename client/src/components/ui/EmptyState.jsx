import React from "react";

export default function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <h2 className="empty-title">{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
