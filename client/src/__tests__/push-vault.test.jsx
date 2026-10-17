import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

afterEach(cleanup);
import PushPanel from "../components/PushPanel";
import VaultPanel from "../components/VaultPanel";
import { disablePush, enablePush, needsHomeScreen, pushState, tokenId } from "../lib/push";
import { safeName, validateVaultFile, vaultConfigured, deleteFromVault, downloadFromVault, listVault, uploadToVault } from "../lib/drive-vault";

describe("push reminders library", () => {
  it("explains why push is unavailable instead of failing silently", () => {
    expect(pushState({ configured: false }).status).toBe("unconfigured");
    expect(pushState({ configured: true, notificationImpl: undefined, serviceWorker: undefined }).status).toBe("unsupported");
    expect(pushState({ configured: true, notificationImpl: { permission: "denied" }, serviceWorker: {} }).status).toBe("blocked");
    expect(pushState({ configured: true, notificationImpl: { permission: "default" }, serviceWorker: {}, standaloneRequired: true }).status).toBe("install");
    expect(pushState({ configured: true, notificationImpl: { permission: "default" }, serviceWorker: {} }).status).toBe("ready");
    expect(needsHomeScreen({ userAgent: "Mozilla/5.0 (iPhone)", standalone: false })).toBe(true);
    expect(needsHomeScreen({ userAgent: "Mozilla/5.0 (iPhone)", standalone: true })).toBe(false);
    expect(needsHomeScreen({ userAgent: "Mozilla/5.0 (Macintosh)", standalone: false })).toBe(false);
  });

  it("hashes a token to a stable, rules-safe id", async () => {
    const one = await tokenId("token-one");
    expect(one).toMatch(/^[0-9a-f]{40}$/);
    expect(await tokenId("token-one")).toBe(one);
    expect(await tokenId("token-two")).not.toBe(one);
  });

  it("refuses to enable without a configured key or a granted permission", async () => {
    await expect(enablePush({ firestore: {}, uid: "u1" })).rejects.toThrow(/not set up/i);
  });
});

describe("push panel", () => {
  const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) }; };
  it("renders nothing when push is not configured", () => {
    const { container } = render(<PushPanel uid="u1" state={{ status: "unconfigured", message: "" }} storage={memory()} />);
    expect(container.innerHTML).toBe("");
  });
  it("turns on, remembers, and turns off", async () => {
    const storage = memory();
    const enable = vi.fn(async () => ({ id: "x", token: "tok" }));
    const disable = vi.fn(async () => true);
    render(<PushPanel uid="u1" state={{ status: "ready", message: "" }} storage={storage} enable={enable} disable={disable} />);
    fireEvent.click(screen.getByRole("button", { name: /turn on push reminders/i }));
    await screen.findByText(/push reminders are on for this device/i);
    expect(storage.getItem("globeready.push.u1")).toBe("tok");
    fireEvent.click(screen.getByRole("button", { name: /turn off push reminders/i }));
    await screen.findByRole("button", { name: /turn on push reminders/i });
    expect(disable).toHaveBeenCalledWith(expect.objectContaining({ token: "tok" }));
    expect(storage.getItem("globeready.push.u1")).toBeNull();
  });
  it("shows a clear message when blocked or when permission is refused", async () => {
    const enable = vi.fn(async () => { throw new Error("Notifications were not allowed, so push reminders stay off."); });
    render(<PushPanel uid="u1" state={{ status: "ready", message: "" }} storage={memory()} enable={enable} />);
    fireEvent.click(screen.getByRole("button", { name: /turn on push reminders/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/stay off/i);
    expect(disablePush).toBeTypeOf("function");
  });
  it("tells iPhone users to add the app to the Home Screen and does not offer the button", () => {
    render(<PushPanel uid="u1" state={pushState({ configured: true, notificationImpl: { permission: "default" }, serviceWorker: {}, standaloneRequired: true })} storage={memory()} />);
    expect(screen.getByText(/add GlobeReady to your Home Screen/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /turn on push reminders/i }).disabled).toBe(true);
  });
});

describe("drive vault library", () => {
  it("validates files and names before anything leaves the browser", () => {
    expect(validateVaultFile({ type: "text/html", size: 10 })).toMatch(/PDF, PNG or JPEG/);
    expect(validateVaultFile({ type: "application/pdf", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(validateVaultFile({ type: "application/pdf", size: 0 })).toMatch(/empty/);
    expect(validateVaultFile({ type: "application/pdf", size: 10 }, 50)).toMatch(/up to 50/);
    expect(validateVaultFile({ type: "image/png", size: 10 }, 3)).toBe("");
    expect(safeName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeName("")).toBe("document");
    expect(vaultConfigured()).toBe(false);
  });

  const ok = (body) => vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 }));
  it("talks only to the hidden app-data space, with the bearer token", async () => {
    const list = ok({ files: [{ id: "abcdefghij1", name: "i20.pdf", size: "2048", createdTime: "2026-10-17T00:00:00Z", mimeType: "application/pdf" }] });
    expect(await listVault("tok", list)).toEqual([{ id: "abcdefghij1", name: "i20.pdf", size: 2048, createdTime: "2026-10-17T00:00:00Z", mimeType: "application/pdf" }]);
    const [url, options] = list.mock.calls[0];
    expect(url).toContain("spaces=appDataFolder");
    expect(options.headers.Authorization).toBe("Bearer tok");
    const up = ok({ id: "newidnewid12", name: "a.pdf" });
    await uploadToVault("tok", new File(["x"], "a.pdf", { type: "application/pdf" }), up);
    expect(up.mock.calls[0][0]).toContain("uploadType=multipart");
    expect(up.mock.calls[0][1].method).toBe("POST");
    await expect(downloadFromVault("tok", "../x", ok("x"))).rejects.toThrow(/not valid/);
    await expect(deleteFromVault("tok", "a/b", ok("x"))).rejects.toThrow(/not valid/);
    const del = ok("");
    await deleteFromVault("tok", "abcdefghij1", del);
    expect(del.mock.calls[0][1].method).toBe("DELETE");
    await expect(listVault("tok", vi.fn(async () => new Response("", { status: 401 })))).rejects.toThrow(/expired/i);
    await expect(listVault("tok", vi.fn(async () => new Response("", { status: 500 })))).rejects.toThrow(/\(500\)/);
  });
});

describe("vault panel", () => {
  it("renders nothing when the owner has not configured Google", () => {
    const { container } = render(<VaultPanel configured={false} />);
    expect(container.innerHTML).toBe("");
  });
  it("connects, lists, uploads, downloads and deletes, and says the files are not encrypted", async () => {
    const files = [{ id: "abcdefghij1", name: "i20.pdf", size: 2048 }];
    const api = {
      requestDriveAccess: vi.fn(async () => "tok"),
      listVault: vi.fn(async () => files),
      validateVaultFile: vi.fn(() => ""),
      uploadToVault: vi.fn(async () => ({})),
      downloadFromVault: vi.fn(async () => new Blob(["x"])),
      deleteFromVault: vi.fn(async () => true),
    };
    const save = vi.fn();
    globalThis.confirm = vi.fn(() => true);
    render(<VaultPanel api={api} configured save={save} />);
    expect(screen.getByText(/not encrypted by GlobeReady/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText(/i20\.pdf/);
    fireEvent.click(screen.getByRole("button", { name: /download i20\.pdf/i }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.any(Blob), "i20.pdf"));
    const file = new File(["x"], "new.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/choose a file for the vault/i), { target: { files: [file] } });
    await waitFor(() => expect(api.uploadToVault).toHaveBeenCalledWith("tok", file));
    fireEvent.click(screen.getByRole("button", { name: /delete i20\.pdf/i }));
    await waitFor(() => expect(api.deleteFromVault).toHaveBeenCalledWith("tok", "abcdefghij1"));
  });
  it("shows a readable error when Google refuses", async () => {
    const api = { requestDriveAccess: vi.fn(async () => { throw new Error("Google access was cancelled."); }) };
    render(<VaultPanel api={api} configured />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/cancelled/i);
  });
});
