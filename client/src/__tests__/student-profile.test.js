import { describe, expect, test } from "vitest";
import {
  normalizeStudentProfile, studentStageFor, trainingChoicesFor, visaCategoryFor,
} from "../lib/student-profile";

describe("canonical student profile", () => {
  test("migrates legacy profile values without inventing a training status", () => {
    expect(normalizeStudentProfile({ degreeLevel: "Master's", visaType: "F-1", journeyStage: "Preparing for graduation" }))
      .toMatchObject({ programLevel: "masters", visaCategory: "f-1", studentStage: "studying", trainingStatus: "not-reported" });
    expect(normalizeStudentProfile({ degreeLevel: "Doctoral", visaType: "J-1", journeyStage: "Current student" }))
      .toMatchObject({ programLevel: "phd", visaCategory: "j-1", studentStage: "studying", trainingStatus: "not-reported" });
  });

  test("canonical values take precedence and helpers tolerate old records", () => {
    const profile = { visaCategory: "j-1", visaType: "F-1", studentStage: "arrived", journeyStage: "Current student" };
    expect(visaCategoryFor(profile)).toBe("j-1");
    expect(studentStageFor(profile)).toBe("arrived");
  });

  test("training choices are deny-by-default for each visa category", () => {
    expect(trainingChoicesFor("f-1").map((item) => item.id)).toContain("opt-authorized");
    expect(trainingChoicesFor("f-1").map((item) => item.id)).not.toContain("academic-training-authorized");
    expect(trainingChoicesFor("j-1").map((item) => item.id)).toContain("academic-training-authorized");
    expect(trainingChoicesFor("j-1").map((item) => item.id)).not.toContain("opt-authorized");
    expect(trainingChoicesFor("other").map((item) => item.id)).toEqual(["not-reported", "not-applicable", "other"]);
  });
});
