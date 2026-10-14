import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import LoginPage from "../pages/LoginPage";

afterEach(cleanup);
const auth = (overrides = {}) => ({ firebaseConfigured: true, signInEmail: vi.fn(), signUpEmail: vi.fn(), signInGoogle: vi.fn(), resetPassword: vi.fn().mockResolvedValue(), ...overrides });

test("reset password confirms without revealing whether the account exists, and asks for an email first", async () => {
  const a = auth();
  render(<LoginPage auth={a} zeroCost />);
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/enter your email/i);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "maya@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/if an account exists/i));
  expect(a.resetPassword).toHaveBeenCalledWith("maya@example.com");
});

test("sign-in failures show readable messages, not Firebase codes", async () => {
  const a = auth({ signInEmail: vi.fn().mockRejectedValue({ code: "auth/invalid-credential", message: "Firebase: Error (auth/invalid-credential)." }) });
  render(<LoginPage auth={a} zeroCost />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "maya@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with email" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i));
  expect(screen.getByRole("alert")).not.toHaveTextContent(/Firebase/);
});
