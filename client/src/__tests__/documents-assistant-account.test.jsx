import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import DocumentsPage from "../pages/DocumentsPage";
import AssistantPage from "../pages/AssistantPage";
import ProfilePage from "../pages/ProfilePage";
import SettingsPage from "../pages/SettingsPage";
import { universityIdFor } from "../lib/news-data";

afterEach(cleanup);

describe("documents: bounded uploads and explicit processing states", () => {
  test("allows a PNG or JPEG to be read, not only PDFs", () => {
    render(<DocumentsPage documents={[{ id: "img", name: "passport.jpg", contentType: "image/jpeg", analysisStatus: "not_requested" }]} />);
    expect(screen.getByRole("button", { name: "Index & explain" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "PDFs only" })).not.toBeInTheDocument();
  });

  test("shows a failed extraction with its safe reason and a retry action, while keeping the upload", () => {
    const onAnalyze = vi.fn();
    render(<DocumentsPage
      onAnalyze={onAnalyze}
      documents={[{
        id: "img",
        name: "passport.jpg",
        contentType: "image/jpeg",
        analysisStatus: "index_failed",
        analysisError: { code: "ocr_unavailable", message: "Reading text from images is not enabled.", retryable: true },
      }]}
    />);

    expect(screen.getByText("Index failed")).toBeInTheDocument();
    expect(screen.getByText(/Reading text from images is not enabled/)).toBeInTheDocument();
    expect(screen.getByText("passport.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry indexing" }));
    expect(onAnalyze).toHaveBeenCalledWith(expect.objectContaining({ id: "img" }));
  });
});

describe("assistant: grounded, honest answers", () => {
  test("never shows a canned guidance answer when the request fails", async () => {
    render(<AssistantPage requestAnswer={async () => { throw new Error("Network down"); }} />);

    fireEvent.change(screen.getByLabelText("Ask GlobeReady"), { target: { value: "What should I bring to an SSN appointment?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not get an answer/i);
    expect(screen.queryByText(/Social Security Administration/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Before an SSN appointment/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  test("states insufficient evidence instead of presenting an answer as document-based", async () => {
    render(<AssistantPage requestAnswer={async () => ({
      answer: "General guidance.",
      evidence: "insufficient",
      notice: "GlobeReady could not find this in your uploaded documents or approved sources.",
      documentCitations: [],
      sources: [],
    })} />);

    fireEvent.change(screen.getByLabelText("Ask GlobeReady"), { target: { value: "When does my lease end?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    expect(await screen.findByText(/could not find this in your uploaded documents/i)).toBeInTheDocument();
  });

  test("shows the professional referral attached to a high-risk answer", async () => {
    render(<AssistantPage requestAnswer={async () => ({
      answer: "General information.",
      evidence: "insufficient",
      notice: "Not found.",
      documentCitations: [],
      sources: [],
      referral: { message: "Speak with a licensed immigration attorney." },
    })} />);

    fireEvent.change(screen.getByLabelText("Ask GlobeReady"), { target: { value: "Can I be deported?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    expect(await screen.findByText(/licensed immigration attorney/i)).toBeInTheDocument();
  });

  test("loads conversation history only when the student asks for it", async () => {
    const requestAnswer = vi.fn(async (path) => {
      if (path === "/api/assistant/conversations") {
        return [{ id: "c1", title: "How long is my travel signature?" }];
      }
      return { answer: "x", documentCitations: [], sources: [] };
    });
    render(<AssistantPage requestAnswer={requestAnswer} />);

    expect(requestAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /history/i }));

    expect(await screen.findByRole("button", { name: "How long is my travel signature?" })).toBeInTheDocument();
  });
});

describe("profile: university domain and time zone", () => {
  test("submits a derived university ID and a validated .edu domain for the server to verify", () => {
    const onSave = vi.fn();
    render(<ProfilePage profile={{ fullName: "Maya", university: "UNC Chapel Hill" }} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Official university website domain (optional)"), {
      target: { value: "unc.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      universityId: universityIdFor("UNC Chapel Hill"),
      officialUniversityDomain: "unc.edu",
      timeZone: expect.any(String),
    }));
  });
});

describe("account settings: export, preferences, and confirmed deletion", () => {
  test("keeps deletion disabled until the exact confirmation phrase is typed", () => {
    const onDelete = vi.fn();
    render(<SettingsPage preferences={{}} onUpdatePreferences={() => {}} onExport={() => {}} onDelete={onDelete} />);

    const deleteButton = screen.getByRole("button", { name: /delete my account/i });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type DELETE MY ACCOUNT/i), { target: { value: "delete" } });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type DELETE MY ACCOUNT/i), { target: { value: "DELETE MY ACCOUNT" } });
    expect(deleteButton).toBeEnabled();
  });

  test("explains that a stale sign-in must be refreshed before deletion", async () => {
    const onDelete = vi.fn(async () => {
      const error = new Error("Sign out, sign back in, and try again.");
      error.code = "recent_login_required";
      throw error;
    });
    render(<SettingsPage preferences={{}} onUpdatePreferences={() => {}} onExport={() => {}} onDelete={onDelete} />);

    fireEvent.change(screen.getByLabelText(/type DELETE MY ACCOUNT/i), { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sign back in/i);
  });

  test("changes email reminder settings through the validated preferences route", () => {
    const onUpdatePreferences = vi.fn();
    render(<SettingsPage preferences={{ emailRemindersEnabled: false }} onUpdatePreferences={onUpdatePreferences} onExport={() => {}} onDelete={() => {}} />);

    fireEvent.click(screen.getByLabelText(/email reminders/i));
    expect(onUpdatePreferences).toHaveBeenCalledWith({ emailRemindersEnabled: true });
  });

  test("offers an export of the student's own data", () => {
    const onExport = vi.fn();
    render(<SettingsPage preferences={{}} onUpdatePreferences={() => {}} onExport={onExport} onDelete={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /export my data/i }));
    expect(onExport).toHaveBeenCalled();
  });
});

describe("university id derivation", () => {
  test("is stable and matches the server's accepted pattern", () => {
    expect(universityIdFor("University of North Carolina at Chapel Hill")).toMatch(/^[a-z0-9][a-z0-9-]{0,127}$/);
  });
});
