import { describe, expect, test } from "vitest";
import { applyDisplay, defaultDisplay, loadDisplay, sanitizeDisplay, saveDisplay } from "../lib/display-preferences";

const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };

describe("display preferences", () => {
  test("round-trips valid choices and ignores anything else", () => {
    const storage = memory();
    saveDisplay({ textSize: "large", contrast: "high", motion: "reduce", evil: "x" }, storage);
    expect(loadDisplay(storage)).toEqual({ textSize: "large", contrast: "high", motion: "reduce" });
    expect(sanitizeDisplay({ textSize: "huge", contrast: 1 })).toEqual(defaultDisplay);
  });

  test("survives unreadable or unavailable storage", () => {
    expect(loadDisplay({ getItem: () => "{broken" })).toEqual(defaultDisplay);
    expect(loadDisplay({ getItem: () => { throw new Error("blocked"); } })).toEqual(defaultDisplay);
    expect(() => saveDisplay({ textSize: "large" }, { setItem: () => { throw new Error("full"); } })).not.toThrow();
  });

  test("applies choices as attributes on the document root", () => {
    const root = { dataset: {} };
    applyDisplay({ textSize: "larger", contrast: "high", motion: "reduce" }, root);
    expect(root.dataset).toEqual({ textSize: "larger", contrast: "high", motion: "reduce" });
  });
});
