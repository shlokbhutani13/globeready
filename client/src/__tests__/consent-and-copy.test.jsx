import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import ConsentPanel from "../components/ConsentPanel";
import DocumentsPage from "../pages/DocumentsPage";
import { deleteAccountWithReauth } from "../lib/account-deletion";

afterEach(cleanup);

const text = {
  documents: "GlobeReady reads the documents you upload.",
  aiGeneration: "Optional. Passages are sent to Google to write an answer.",
  withdraw: "You can change either choice at any time.",
};

describe("privacy choices are explicit and reversible", () => {
  test("document reading is off by default and the wording is shown before any choice", () => {
    render(<ConsentPanel consent={{ documents: false, aiGeneration: false, text }} onSave={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /read my documents/i })).not.toBeChecked();
    expect(screen.getByText(/reads the documents you upload/)).toBeInTheDocument();
    expect(screen.getByText(/sent to Google to write an answer/)).toBeInTheDocument();
  });

  test("AI answers cannot be chosen until document reading is on", () => {
    render(<ConsentPanel consent={{ documents: false, aiGeneration: false, text }} onSave={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /AI-written answers/i })).toBeDisabled();
  });

  test("turning document reading on records the choice, and turning it off also turns AI off", async () => {
    const onSave = vi.fn(async () => {});
    render(<ConsentPanel consent={{ documents: false, aiGeneration: false, text }} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /read my documents/i }));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ documents: true, aiGeneration: false }));

    render(<ConsentPanel consent={{ documents: true, aiGeneration: true, text }} onSave={onSave} />);
    const [documentsBox] = screen.getAllByRole("checkbox", { name: /read my documents/i }).slice(-1);
    fireEvent.click(documentsBox);
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ documents: false, aiGeneration: false }));
  });

  test("a failed save is shown to the student", async () => {
    const onSave = vi.fn(async () => { throw new Error("The service is unavailable."); });
    render(<ConsentPanel consent={{ documents: false, aiGeneration: false, text }} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /read my documents/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is unavailable.");
  });
});

describe("uploads wait for consent in a signed-in account", () => {
  test("while consent is loading, the upload is closed and says why", () => {
    render(<DocumentsPage documents={[]} consent={null} />);
    expect(screen.getByRole("heading", { name: /Turn on document reading to upload/i })).toBeInTheDocument();
    expect(screen.getByText(/Checking your privacy choices/)).toBeInTheDocument();
  });

  test("without consent, the upload stays closed", () => {
    render(<DocumentsPage documents={[]} consent={{ documents: false, aiGeneration: false, text }} />);
    expect(screen.getByRole("heading", { name: /Turn on document reading to upload/i })).toBeInTheDocument();
  });

  test("with consent, the upload opens", () => {
    render(<DocumentsPage documents={[]} consent={{ documents: true, aiGeneration: false, text }} />);
    expect(screen.getByRole("heading", { name: "Upload a document" })).toBeInTheDocument();
  });

  test("outside a signed-in account the page is not gated at all", () => {
    render(<DocumentsPage documents={[]} />);
    expect(screen.getByRole("heading", { name: "Upload a document" })).toBeInTheDocument();
  });
});

describe("account deletion explains a failed re-authentication in plain words", () => {
  test("a closed Google pop-up gets a clear instruction, not the provider's error code", async () => {
    await expect(deleteAccountWithReauth({
      removeAccount: async () => { throw Object.assign(new Error("recent"), { code: "recent_login_required" }); },
      hasGoogleProvider: () => true,
      reauthenticateGoogle: async () => { throw new Error("auth/popup-closed-by-user"); },
    })).rejects.toThrow(/Confirm your Google sign-in in the pop-up window/);
  });

  test("an email account is told to sign in again, not offered a Google pop-up", async () => {
    await expect(deleteAccountWithReauth({
      removeAccount: async () => { throw Object.assign(new Error("Sign out, sign back in, and try again."), { code: "recent_login_required" }); },
      hasGoogleProvider: () => false,
      reauthenticateGoogle: async () => {},
    })).rejects.toThrow(/sign back in/);
  });
});
