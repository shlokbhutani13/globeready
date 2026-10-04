import { afterEach, describe, expect, test, vi } from "vitest";

import { apiRequest, resolveApiUrl } from "../lib/api";
import { documentStoragePath, sanitizeFilename } from "../lib/student-data";

afterEach(() => { vi.restoreAllMocks(); });

describe("API origin for a build", () => {
  test("development falls back to the local API", () => {
    expect(resolveApiUrl({}, { PROD: false })).toBe("http://localhost:5051");
  });

  test("production has no localhost fallback and refuses to guess", () => {
    expect(resolveApiUrl({}, { PROD: true })).toBeNull();
  });

  test("production requires an https origin with no path", () => {
    expect(resolveApiUrl({ VITE_API_URL: "https://api.globeready-prod.test" }, { PROD: true })).toBe("https://api.globeready-prod.test");
    expect(() => resolveApiUrl({ VITE_API_URL: "http://api.globeready-prod.test" }, { PROD: true })).toThrow(/https/);
    expect(() => resolveApiUrl({ VITE_API_URL: "https://api.globeready-prod.test/v1" }, { PROD: true })).toThrow(/origin only/);
    expect(() => resolveApiUrl({ VITE_API_URL: "not a url" }, { PROD: false })).toThrow(/absolute URL/);
  });
});

describe("API responses are read without trusting their shape", () => {
  test("a non-JSON upstream page becomes a safe, typed error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(apiRequest("/api/tasks")).rejects.toMatchObject({ code: "unexpected_response" });
  });

  test("an empty success body resolves to null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiRequest("/api/tasks/1", { method: "DELETE" })).resolves.toBeNull();
  });

  test("an error envelope surfaces its safe message and code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: "invalid_task", message: "A title and valid due date are required." },
    }), { status: 422, headers: { "Content-Type": "application/json" } }));
    await expect(apiRequest("/api/tasks", { method: "POST" })).rejects.toMatchObject({
      code: "invalid_task",
      message: "A title and valid due date are required.",
    });
  });
});

describe("uploaded file names fit the Storage rules", () => {
  const storageFileName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u;
  const storagePath = /^users\/[^/]+\/documents\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u;

  test("a long original name is shortened and still satisfies the rule pattern", () => {
    const name = `${"Very long passport scan name ".repeat(20)}.PDF`;
    const sanitized = sanitizeFilename(name);
    expect(sanitized).toMatch(storageFileName);
    expect(sanitized.endsWith(".pdf")).toBe(true);
    expect(sanitized.length).toBeLessThanOrEqual(130);
  });

  test("unusual characters and empty names resolve to a safe, rule-conforming name", () => {
    expect(sanitizeFilename("../../etc/passwd")).toMatch(storageFileName);
    expect(sanitizeFilename("!!!.pdf")).toBe("document.pdf");
    expect(sanitizeFilename("  ")).toMatch(storageFileName);
    expect(sanitizeFilename("My I-20 (final).pdf")).toBe("My_I_20_final.pdf");
  });

  test("the client builds a path that the server's owned-path check and the Storage rules both accept", () => {
    const path = documentStoragePath("student-a", "Zx9kD0tLm3pQ7rWv2bNc", "I-20 final.PDF");
    expect(path).toMatch(storagePath);
    expect(path.startsWith("users/student-a/documents/")).toBe(true);
  });
});
