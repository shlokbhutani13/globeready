import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import DeviceBackupPanel from "../components/DeviceBackupPanel";
import { createDeviceBackup } from "../lib/device-backup";

afterEach(cleanup);

const data = {
  budget: { currency: "USD", startMonth: "2026-10", items: [] },
  readiness: { marks: {}, custom: [] },
  emergencyCard: { values: {}, include: {}, options: {}, contactIds: [] },
  universityWorkspace: { questions: {}, custom: [], terms: [] },
  newsSeen: {}, savedSearches: [], snoozes: {},
};
const memory = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
};

describe("device backup settings panel", () => {
  test("warns about sensitive plaintext and downloads without uploading", () => {
    const download = vi.fn();
    render(<DeviceBackupPanel uid="student" storage={memory()} download={download} now={new Date("2026-10-14T12:00:00Z")} />);
    expect(screen.getByText(/medical, insurance, financial and private notes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /download device backup/i }));
    expect(download).toHaveBeenCalledWith("globeready-device-backup-2026-10-14.json", expect.stringContaining('"uid": "student"'), "application/json;charset=utf-8");
  });

  test("previews all replacement sections before the explicit restore action", async () => {
    const storage = memory();
    const archive = createDeviceBackup({ uid: "student", data });
    render(<DeviceBackupPanel uid="student" storage={storage} />);
    const file = new File([JSON.stringify(archive)], "backup.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/choose a device backup/i), { target: { files: [file] } });
    await screen.findByText(/7 device-data sections are ready/i);
    expect(screen.getByText(/existing browser data in these sections will be replaced/i)).toBeInTheDocument();
    expect(storage.values.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /replace device data/i }));
    await waitFor(() => expect(storage.values.size).toBe(7));
    expect(screen.getByRole("status")).toHaveTextContent(/restored on this device/i);
  });

  test("shows a cross-account error and offers no restore action", async () => {
    const archive = createDeviceBackup({ uid: "someone-else", data });
    render(<DeviceBackupPanel uid="student" storage={memory()} />);
    fireEvent.change(screen.getByLabelText(/choose a device backup/i), { target: { files: [new File([JSON.stringify(archive)], "wrong.json")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/different account/i);
    expect(screen.queryByRole("button", { name: /replace device data/i })).not.toBeInTheDocument();
  });
});
