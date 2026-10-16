import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { authHeadersForMode, firebaseAppName, resolveClientMode, usesStaticReviewedNews, validateZeroCostPublicConfig } from "../lib/runtime-mode";
import LoginPage from "../pages/LoginPage";

afterEach(cleanup);

describe("client runtime mode", () => {
  test("production is the default", () => {
    expect(resolveClientMode({}, { DEV: false, PROD: true })).toBe("production");
  });

  test("local-user mode is allowed in development", () => {
    expect(resolveClientMode({ VITE_LOCAL_USER_MODE: "true" }, { DEV: true, PROD: false })).toBe("local-user");
  });

  test("demo mode must be explicitly selected and is development-only", () => {
    expect(resolveClientMode({ VITE_DEMO_MODE: "true" }, { DEV: true, PROD: false })).toBe("demo");
    expect(() => resolveClientMode({ VITE_DEMO_MODE: "true" }, { DEV: false, PROD: true })).toThrow(/production/i);
    expect(() => resolveClientMode({ VITE_DEMO_MODE: "true", VITE_LOCAL_USER_MODE: "true" }, { DEV: true, PROD: false })).toThrow(/both/i);
  });

  test("x-demo-user is sent only by explicit demo mode", () => {
    expect(authHeadersForMode("demo", "")).toEqual({ "x-demo-user": "globeready-demo" });
    expect(authHeadersForMode("local-user", "")).toEqual({});
    expect(authHeadersForMode("production", "")).toEqual({});
    expect(authHeadersForMode("production", "token-1")).toEqual({ Authorization: "Bearer token-1" });
  });

  test("every non-demo standalone mode reads the reviewed news artifact", () => {
    expect(usesStaticReviewedNews("zero-cost-public")).toBe(true);
    expect(usesStaticReviewedNews("local-user")).toBe(true);
    expect(usesStaticReviewedNews("demo")).toBe(false);
    expect(usesStaticReviewedNews("production")).toBe(false);
  });

  test("Firebase client app identities differ across modes and projects", () => {
    const config = { projectId: "globeready-local", appId: "app-1", storageBucket: "a.appspot.com" };
    expect(firebaseAppName(config, "local-user")).not.toBe(firebaseAppName(config, "production"));
    expect(firebaseAppName(config, "local-user")).not.toBe(firebaseAppName({ ...config, projectId: "other" }, "local-user"));
  });

  test("local-user mode cannot be built or served as a production build", () => {
    expect(() => resolveClientMode({ VITE_LOCAL_USER_MODE: "true" }, { DEV: false, PROD: true })).toThrow(/production/i);
  });

  test("zero-cost-public is an explicit production runtime and cannot combine with development modes", () => {
    expect(resolveClientMode({ VITE_ZERO_COST_PUBLIC: "true" }, { DEV: false, PROD: true })).toBe("zero-cost-public");
    expect(() => resolveClientMode({ VITE_ZERO_COST_PUBLIC: "true" }, { DEV: true, PROD: false })).toThrow(/production build/i);
    expect(() => resolveClientMode({ VITE_ZERO_COST_PUBLIC: "true", VITE_DEMO_MODE: "true" }, { DEV: false, PROD: true })).toThrow(/cannot be combined/i);
  });

  test("zero-cost-public rejects API, Storage, uploads, and emulator configuration", () => {
    expect(validateZeroCostPublicConfig({ VITE_ZERO_COST_PUBLIC: "true", VITE_FIREBASE_PROJECT_ID: "free-project" })).toBe(true);
    for (const forbidden of [
      { VITE_API_URL: "https://api.example.com" },
      { VITE_FIREBASE_STORAGE_BUCKET: "bucket.example" },
      { VITE_DOCUMENT_UPLOADS_ENABLED: "true" },
      { VITE_LOCAL_USER_MODE: "true" },
    ]) {
      expect(() => validateZeroCostPublicConfig({ VITE_ZERO_COST_PUBLIC: "true", ...forbidden })).toThrow(/zero-cost-public/i);
    }
  });

  test("invalid flag values are refused", () => {
    expect(() => resolveClientMode({ VITE_LOCAL_USER_MODE: "on" }, { DEV: true, PROD: false })).toThrow();
    expect(() => resolveClientMode({ VITE_DEMO_MODE: "on" }, { DEV: true, PROD: false })).toThrow();
    expect(() => resolveClientMode({ VITE_ZERO_COST_PUBLIC: "on" }, { DEV: false, PROD: true })).toThrow();
  });

  test("the login page labels the local Google identity accurately", () => {
    const auth = { firebaseConfigured: true, signInGoogle: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {} };
    render(<LoginPage auth={auth} localUser onDemo={() => {}} />);
    expect(screen.getByText(/mock Google identity/i)).toBeInTheDocument();
    expect(screen.getByText(/not your Google account/i)).toBeInTheDocument();
  });

  test("the login page shows no local-user label in production", () => {
    const auth = { firebaseConfigured: true, signInGoogle: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {} };
    render(<LoginPage auth={auth} onDemo={() => {}} />);
    expect(screen.queryByText(/mock Google identity/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue in demo mode/i })).not.toBeInTheDocument();
  });

  test("the public beta never advertises sample or demo data", () => {
    const auth = { firebaseConfigured: true, signInGoogle: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {} };
    render(<LoginPage auth={auth} zeroCost onDemo={() => {}} />);
    expect(screen.queryByText(/sample|demo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sign in or create an account to open your private workspace/i)).toBeInTheDocument();
  });

  test("the demo entry point appears only when explicit demo mode is available", () => {
    const auth = { firebaseConfigured: false, signInGoogle: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {} };
    render(<LoginPage auth={auth} demoAvailable onDemo={() => {}} />);
    expect(screen.getByRole("button", { name: /continue in demo mode/i })).toBeInTheDocument();
  });
});
