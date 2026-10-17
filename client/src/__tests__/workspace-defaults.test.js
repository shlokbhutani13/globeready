import { describe, expect, test } from "vitest";

import { workspaceDefaults } from "../lib/workspace-defaults";

describe("workspace defaults", () => {
  test("a real account starts empty instead of inheriting demo records", () => {
    expect(workspaceDefaults({ demo: false })).toEqual({
      profile: {
        fullName: "", homeCountry: "", university: "", program: "", programLevel: "other",
        visaCategory: "f-1", studentStage: "pre-arrival", trainingStatus: "not-reported",
      },
      tasks: [],
      documents: [],
    });
  });

  test("sample records are never part of the application defaults", () => {
    expect(workspaceDefaults()).toEqual(workspaceDefaults({ demo: true }));
  });
});
