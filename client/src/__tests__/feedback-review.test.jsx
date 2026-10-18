import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { feedbackHref } from "../lib/feedback";
import { contentReviewNotice } from "../data/content-review";
import FeedbackLink from "../components/FeedbackLink";
import Disclaimer from "../components/Disclaimer";

afterEach(cleanup);

describe("feedback link", () => {
  it("uses the owner's email when published", () => {
    const href = feedbackHref({ contact: "help@example.com", topic: "Rules" });
    expect(href.startsWith("mailto:help@example.com?subject=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("do not include passport numbers");
  });
  it("falls back to the public issue tracker without a valid email", () => {
    expect(feedbackHref({ contact: "", topic: "x" })).toMatch(/^https:\/\/github\.com\/.+\/issues\/new\?title=/);
    expect(feedbackHref({ contact: "not an email", topic: "x" })).toMatch(/^https:\/\/github\.com/);
  });
  it("renders an accessible link", () => {
    render(<FeedbackLink href="mailto:a@b.co" />);
    expect(screen.getByRole("link", { name: /tell us/i }).getAttribute("href")).toBe("mailto:a@b.co");
  });
});

describe("content review notice", () => {
  it("is honest by default", () => {
    expect(contentReviewNotice({ reviewedBy: null, reviewedOn: null })).toMatch(/not yet been reviewed/);
    expect(contentReviewNotice({ reviewedBy: "X", reviewedOn: "soon" })).toMatch(/not yet been reviewed/);
  });
  it("names the reviewer once recorded", () => {
    expect(contentReviewNotice({ reviewedBy: "the DSO at Example U", reviewedOn: "2026-11-02" })).toMatch(/reviewed by the DSO at Example U on 2026-11-02/);
  });
  it("shows on the full disclaimer but not the compact one", () => {
    const { container, rerender } = render(<Disclaimer />);
    expect(container.textContent).toMatch(/not yet been reviewed/);
    rerender(<Disclaimer compact />);
    expect(container.textContent).not.toMatch(/not yet been reviewed/);
  });
});
