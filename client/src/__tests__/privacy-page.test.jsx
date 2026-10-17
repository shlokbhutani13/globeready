import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import PrivacyPage, { contactLink } from "../pages/PrivacyPage";
import LoginPage from "../pages/LoginPage";
import { privacySections } from "../data/privacy-notice";

afterEach(cleanup);
const text = () => document.body.textContent.replace(/\s+/g, " ");

describe("Privacy notice", () => {
  it("has one h1, labelled sections and a way back", () => {
    render(<PrivacyPage contact="" />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.length).toBe(privacySections.length + 1);
    for (const section of privacySections) expect(document.getElementById(`privacy-${section.id}`)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to globeready/i }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("states the document-text facts without softening them", () => {
    render(<PrivacyPage contact="" />);
    const all = text();
    expect(all).toMatch(/original files/i);
    expect(all).toMatch(/discarded after the text is extracted/i);
    expect(all).toMatch(/up to 50 documents/i);
    expect(all).toMatch(/names, dates of birth and addresses/i);
    expect(all).toMatch(/can miss unusual formats/i);
    expect(all).toMatch(/does not delete text already saved/i);
    expect(all).toMatch(/Delete all saved document text/);
  });

  it("describes browser-only data, third parties, news labels and deletion honestly", () => {
    render(<PrivacyPage contact="" />);
    const all = text();
    expect(all).toMatch(/never uploaded/i);
    expect(all).toMatch(/not in your account export/i);
    expect(all).toMatch(/not encrypted/i);
    expect(all).toMatch(/No AI provider receives your questions or documents/i);
    expect(all).toMatch(/not yet reviewed by GlobeReady/i);
    expect(all).toMatch(/about every four hours/i);
    expect(all).toMatch(/does not reach copies/i);
    expect(all).toMatch(/not legal advice/i);
  });

  it("never invents a contact address", () => {
    const { unmount } = render(<PrivacyPage contact="" />);
    expect(screen.getByText(/have not been published yet/i)).toBeTruthy();
    expect(document.querySelector("a[href^='mailto:']")).toBeNull();
    unmount();
    render(<PrivacyPage contact="help@example.org" />);
    expect(document.querySelector("a[href='mailto:help@example.org']")).toBeTruthy();
    expect(contactLink("not an address")).toBe("");
    expect(contactLink("a@b.co\" onclick=\"x")).toBe("");
    expect(contactLink(undefined)).toBe("");
  });

  it("is linked from the sign-in page in the free beta only", () => {
    const auth = { firebaseConfigured: true, signInGoogle: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {} };
    const { unmount } = render(<LoginPage auth={auth} zeroCost />);
    expect(screen.getByRole("link", { name: /privacy and your data/i }).getAttribute("href")).toBe("/privacy");
    unmount();
    render(<LoginPage auth={auth} />);
    expect(screen.queryByRole("link", { name: /privacy and your data/i })).toBeNull();
  });
});
