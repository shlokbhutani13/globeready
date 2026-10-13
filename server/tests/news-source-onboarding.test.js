import { describe, expect, test } from "vitest";

import { onboardingStates, validateOnboardingTransition } from "../src/news/source-onboarding.js";

const completeVerification = {
  state: "verified-disabled",
  officialDomain: "international.example.edu",
  sourceUrl: "https://international.example.edu/news.xml",
  adapter: "feed",
  robotsResult: "allowed",
  parserContractVersion: "fixture-v1",
  cadenceHours: 24,
  topics: ["status", "campus-life"],
  decisionAt: "2026-10-13T12:00:00.000Z",
  decisionBy: "admin-1",
};

describe("university source onboarding", () => {
  test("supports the verified lifecycle and delayed recovery", () => {
    expect([...onboardingStates]).toEqual([
      "proposed", "verifying", "verified-disabled", "enabled", "delayed", "rejected",
    ]);
    const verifying = validateOnboardingTransition({ state: "proposed" }, { state: "verifying" });
    const verified = validateOnboardingTransition(verifying, completeVerification);
    const enabled = validateOnboardingTransition(verified, { state: "enabled" });
    const delayed = validateOnboardingTransition(enabled, { state: "delayed" });
    expect(validateOnboardingTransition(delayed, { state: "enabled" }).state).toBe("enabled");
  });

  test("allows a proposal to be rejected with decision metadata", () => {
    expect(validateOnboardingTransition({ state: "proposed" }, {
      state: "rejected",
      decisionAt: "2026-10-13T12:00:00.000Z",
      decisionBy: "admin-1",
      safeReason: "The submitted page is not an official update source.",
    })).toMatchObject({ state: "rejected", decisionBy: "admin-1" });
  });

  test.each([
    ["illegal skip", { state: "proposed" }, completeVerification, /transition/i],
    ["missing domain", { state: "verifying" }, { ...completeVerification, officialDomain: undefined }, /official domain/i],
    ["mismatched domain", { state: "verifying" }, { ...completeVerification, officialDomain: "other.edu" }, /official domain/i],
    ["missing robots decision", { state: "verifying" }, { ...completeVerification, robotsResult: undefined }, /robots/i],
    ["missing fixture contract", { state: "verifying" }, { ...completeVerification, parserContractVersion: undefined }, /parser contract/i],
  ])("rejects %s", (_label, current, next, message) => {
    expect(() => validateOnboardingTransition(current, next)).toThrow(message);
  });
});
