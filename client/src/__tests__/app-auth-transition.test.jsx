import React from "react";
import { expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

const state = vi.hoisted(() => ({
  auth: { loading: true, user: null, emailVerified: false },
  records: { dates: [], contacts: [], cases: [], planner: { journey: { have: [], custom: [] }, travel: { have: [], custom: [] } } },
}));

vi.mock("../lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("../lib/firebase", () => ({ db: {}, demoMode: false, localUserMode: false, storageAvailable: false, zeroCostPublicMode: true }));
vi.mock("../lib/use-zero-cost-records", () => ({ useZeroCostRecords: () => state.records }));
vi.mock("../lib/student-data", () => ({ subscribeStudentData: () => [], createTask: vi.fn(), removeDocument: vi.fn(), removeTask: vi.fn(), saveResource: vi.fn(), toggleTask: vi.fn(), uploadDocument: vi.fn() }));
vi.mock("../lib/static-news", () => ({ subscribeStaticNews: () => () => {}, loadStaticCoverage: () => Promise.resolve(null) }));
vi.mock("../lib/zero-cost-data", async (importOriginal) => ({
  ...await importOriginal(),
  nextDocumentSlot: () => "doc-00",
  createZeroCostDataStore: () => ({ subscribeSavedNewsIds: () => () => {} }),
}));

import App from "../App";

test("finishing authentication does not change the number of hooks App renders", () => {
  const view = render(<App />);
  state.auth = {
    loading: false,
    user: { uid: "student", displayName: "Maya" },
    emailVerified: true,
    signOutUser: vi.fn(),
    signInProviders: () => [],
  };
  expect(() => view.rerender(<App />)).not.toThrow();
});
