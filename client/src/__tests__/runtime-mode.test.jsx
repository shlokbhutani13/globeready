import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { authHeadersForMode, firebaseAppName, resolveClientMode } from "../lib/runtime-mode";
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

  test("Firebase client app identities differ across modes and projects", () => {
    const config = { projectId: "globeready-local", appId: "app-1", storageBucket: "a.appspot.com" };
    expect(firebaseAppName(config, "local-user")).not.toBe(firebaseAppName(config, "production"));
    expect(firebaseAppName(config, "local-user")).not.toBe(firebaseAppName({ ...config, projectId: "other" }, "local-user"));
  });

  test("local-user mode cannot be built or served as a production build", () => {
    expect(() => resolveClientMode({ VITE_LOCAL_USER_MODE: "true" }, { DEV: false, PROD: true })).toThrow(/production/i);
  });

  test("invalid flag values are refused", () => {
    expect(() => resolveClientMode({ VITE_LOCAL_USER_MODE: "on" }, { DEV: true, PROD: false })).toThrow();
    expect(() => resolveClientMode({ VITE_DEMO_MODE: "on" }, { DEV: true, PROD: false })).toThrow();
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

  test("the demo entry point appears only when explicit demo mode is available", () => {
    const auth = { firebaseConfigured: false, signInGoogle: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {} };
    render(<LoginPage auth={auth} demoAvailable onDemo={() => {}} />);
    expect(screen.getByRole("button", { name: /continue in demo mode/i })).toBeInTheDocument();
  });
});
