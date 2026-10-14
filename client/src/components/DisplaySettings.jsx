import React, { useState } from "react";
import { applyDisplay, displayChoices, loadDisplay, saveDisplay } from "../lib/display-preferences";

const labels = { textSize: "Text size", contrast: "Contrast", motion: "Animation" };

// Display choices apply immediately and are remembered on this device only.
export default function DisplaySettings() {
  const [value, setValue] = useState(() => loadDisplay());
  const change = (key, next) => {
    const updated = saveDisplay({ ...value, [key]: next });
    applyDisplay(updated);
    setValue(updated);
  };
  return (
    <section className="panel settings-section" aria-labelledby="display-title">
      <div className="panel-title"><h2 id="display-title">Display</h2></div>
      <p className="muted">These choices are saved on this device only. They are not stored in your account.</p>
      <div className="form-grid">
        {Object.entries(displayChoices).map(([key, choices]) => (
          <label className="field" key={key}>{labels[key]}
            <select value={value[key]} onChange={(event) => change(key, event.target.value)}>
              {choices.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}
