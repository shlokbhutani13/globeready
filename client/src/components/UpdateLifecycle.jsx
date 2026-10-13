import React from "react";

const copy = {
  corrected: "Corrected by the official source",
  superseded: "Superseded by a newer official update",
  withdrawn: "Withdrawn by the official source",
};

export default function UpdateLifecycle({ item = {} }) {
  if (!copy[item.lifecycleState]) return null;
  return <p className={`update-lifecycle ${item.lifecycleState}`} role="status">
    {copy[item.lifecycleState]}{item.replacementItemId ? ` (${item.replacementItemId})` : ""}
  </p>;
}
