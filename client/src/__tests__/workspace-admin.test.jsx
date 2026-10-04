import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { apiRequest } from "../lib/api";
import NewsAdminPage from "../pages/NewsAdminPage";

vi.mock("../lib/api", () => ({ apiRequest: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NewsAdminPage", () => {
  test("refuses to render admin data for a non-admin user", () => {
    render(<NewsAdminPage isAdmin={false} />);
    expect(screen.getByText(/admin access required/i)).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  test("loads and displays the pending review queue and source health for an admin", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/admin/news/sources") {
        return Promise.resolve({ items: [{ id: "federal-register", publisher: "Federal Register", verified: true, enabled: true }] });
      }
      if (path === "/api/admin/news/review") {
        return Promise.resolve({ items: [{ id: "review-1", status: "pending", type: "news-explanation", newsItemId: "item-1" }] });
      }
      if (path === "/api/admin/news/health") {
        return Promise.resolve({ sourceCount: 1, runCount: 3 });
      }
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });

    render(<NewsAdminPage isAdmin />);

    await waitFor(() => expect(screen.getByText("Federal Register")).toBeInTheDocument());
    expect(screen.getByText(/news explanation/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  test("sends an approve decision for a pending review item", async () => {
    apiRequest.mockImplementation((path, options) => {
      if (path === "/api/admin/news/sources") return Promise.resolve({ items: [] });
      if (path === "/api/admin/news/health") return Promise.resolve({ sourceCount: 0, runCount: 0 });
      if (path === "/api/admin/news/review" && !options) {
        return Promise.resolve({ items: [{ id: "review-1", status: "pending", type: "news-explanation", newsItemId: "item-1" }] });
      }
      if (path === "/api/admin/news/review/review-1") return Promise.resolve({});
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });

    render(<NewsAdminPage isAdmin />);
    await waitFor(() => expect(screen.getByText(/news explanation/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/admin/news/review/review-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ decision: "approve" }) }),
    ));
  });

  test("never allows enabling a source that is not verified", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/admin/news/sources") {
        return Promise.resolve({ items: [{ id: "custom-u", publisher: "Custom U", verified: false, enabled: false }] });
      }
      if (path === "/api/admin/news/review") return Promise.resolve({ items: [] });
      if (path === "/api/admin/news/health") return Promise.resolve({ sourceCount: 1, runCount: 0 });
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });

    render(<NewsAdminPage isAdmin />);
    await waitFor(() => expect(screen.getByText("Custom U")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /enable/i })).toBeDisabled();
  });
});
