import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import NewsReviewQueue from "../components/NewsReviewQueue";
import NewsReviewDetail from "../components/NewsReviewDetail";

afterEach(cleanup);
const candidate = (patch = {}) => ({
  id: `review-candidate:${"a".repeat(64)}`, sourceId: "uscis", changeType: "changed", publicationState: "unreviewed",
  collectedAt: "2026-10-14T12:00:00.000Z", canonicalUrl: "https://www.uscis.gov/news/one", sourceHealth: { state: "active" },
  previous: { title: "Old title", publishedAt: "2026-10-01", effectiveAt: null, sourceExcerpt: "Old text", topics: ["status"], visaTypes: ["f-1"] },
  current: { externalId: "one", title: "New title", canonicalUrl: "https://www.uscis.gov/news/one", publishedAt: "2026-10-01", effectiveAt: "2026-11-01", sourceExcerpt: "New text", topics: ["status"], visaTypes: ["f-1"] },
  diffs: ["title", "effectiveAt", "sourceExcerpt"], ...patch,
});

describe("news review workspace", () => {
  test("filters candidates by source change type topic visa date and state", () => {
    const other = candidate({ id: `review-candidate:${"b".repeat(64)}`, sourceId: "irs", changeType: "new", collectedAt: "2026-09-01T12:00:00.000Z", current: { ...candidate().current, title: "Tax notice", topics: ["taxes-social-security"], visaTypes: ["j-1"] } });
    render(<NewsReviewQueue candidates={[candidate(), other]} onSelect={() => {}} />);
    for (const [label, value] of [[/^Source$/i, "uscis"], [/^Change type$/i, "changed"], [/^Topic$/i, "status"], [/^Visa$/i, "f-1"], [/^Review state$/i, "unreviewed"], [/^Collected from$/i, "2026-10-01"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(screen.getByText("New title")).toBeInTheDocument();
    expect(screen.queryByText("Tax notice")).not.toBeInTheDocument();
  });

  test("shows old and new evidence source health and image provenance", () => {
    render(<NewsReviewDetail candidate={candidate()} onDecision={() => {}} />);
    expect(screen.getByText("Old title")).toBeInTheDocument();
    expect(screen.getByText("New title")).toBeInTheDocument();
    expect(screen.getByText(/source health: active/i)).toBeInTheDocument();
    expect(screen.getByText(/topic illustration.*no reviewed official image/i)).toBeInTheDocument();
  });

  test("requires every approval confirmation before enabling approve", () => {
    render(<NewsReviewDetail candidate={candidate()} onDecision={() => {}} />);
    const approve = screen.getByRole("button", { name: /approve candidate/i });
    expect(approve).toBeDisabled();
    for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
    expect(approve).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /factual summary/i })).toBeChecked();
  });

  test("removed evidence can only be rejected deferred or archived", () => {
    render(<NewsReviewDetail candidate={candidate({ changeType: "removed", current: null })} onDecision={() => {}} />);
    expect(screen.queryByRole("button", { name: /approve candidate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish correction/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archive public item/i })).toBeInTheDocument();
  });

  test("submits bounded reject defer correction and archive decisions", async () => {
    const onDecision = vi.fn(async () => {});
    render(<NewsReviewDetail candidate={candidate()} onDecision={onDecision} />);
    fireEvent.click(screen.getByRole("button", { name: /reject candidate/i }));
    fireEvent.click(screen.getByRole("button", { name: /defer candidate/i }));
    fireEvent.change(screen.getByLabelText(/existing public item id/i), { target: { value: "uscis-notice-1" } });
    fireEvent.change(screen.getByLabelText(/public correction note/i), { target: { value: "The official source changed." } });
    for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /publish correction/i }));
    fireEvent.click(screen.getByRole("button", { name: /archive public item/i }));
    await waitFor(() => expect(onDecision).toHaveBeenCalledTimes(4));
    expect(onDecision.mock.calls.map(([, decision]) => decision.type)).toEqual(["reject", "defer", "correct", "archive"]);
  });

  test("announces loading failure success and validation errors accessibly", async () => {
    const onDecision = vi.fn(async () => { throw new Error("Decision was refused"); });
    const { rerender } = render(<NewsReviewQueue candidates={[]} loading />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading review candidates/i);
    rerender(<NewsReviewQueue candidates={[]} error="Candidates unavailable" onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/candidates unavailable/i);
    rerender(<NewsReviewDetail candidate={candidate()} onDecision={onDecision} />);
    fireEvent.click(screen.getByRole("button", { name: /reject candidate/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/decision was refused/i);
  });
});
