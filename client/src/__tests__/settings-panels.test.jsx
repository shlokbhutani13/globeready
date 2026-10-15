import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import DisplaySettings from "../components/DisplaySettings";
import RestorePanel from "../components/RestorePanel";

afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.textSize; delete document.documentElement.dataset.contrast; });

test("display choices apply immediately and persist on the device", () => {
  render(<DisplaySettings />);
  fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "larger" } });
  fireEvent.change(screen.getByLabelText("Contrast"), { target: { value: "high" } });
  expect(document.documentElement.dataset.textSize).toBe("larger");
  expect(document.documentElement.dataset.contrast).toBe("high");
  expect(JSON.parse(localStorage.getItem("globeready:display"))).toMatchObject({ textSize: "larger", contrast: "high" });
  cleanup();
  render(<DisplaySettings />);
  expect(screen.getByLabelText("Text size")).toHaveValue("larger");
});

const fileOf = (value) => { const text = typeof value === "string" ? value : JSON.stringify(value); return { name: "export.json", text: async () => text }; };
const upload = (file) => fireEvent.change(document.getElementById("restore-file"), { target: { files: [file] } });
const exportFile = { schemaVersion: 2, uid: "maya", profile: {}, tasks: [{ id: "a", title: "Pay SEVIS fee", dueDate: "2026-11-01" }], contacts: [{ name: "Dr. Rao", role: "dso" }], documents: [{ id: "doc-00" }] };

test("restore shows a preview first, writes nothing until confirmed, then adds only", async () => {
  const store = { createTask: vi.fn().mockResolvedValue({ id: "x" }), toggleTask: vi.fn(), createContact: vi.fn().mockResolvedValue({}), saveProfile: vi.fn() };
  render(<RestorePanel uid="maya" existing={{}} store={store} />);
  upload(fileOf(exportFile));
  expect(await screen.findByText("Add 1 tasks")).toBeInTheDocument();
  expect(screen.getByText("Add 1 contacts")).toBeInTheDocument();
  expect(screen.getByText(/Not restored: 1 document/)).toBeInTheDocument();
  expect(store.createTask).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Restore 2 saves" }));
  expect(await screen.findByText(/Restored 2 items. Nothing was overwritten or deleted./)).toBeInTheDocument();
  expect(store.createTask).toHaveBeenCalledTimes(1);
});

test("restore refuses another account's file and invalid JSON without writing", async () => {
  const store = { createTask: vi.fn() };
  render(<RestorePanel uid="maya" existing={{}} store={store} />);
  upload(fileOf({ ...exportFile, uid: "bob" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/different account/);
  upload(fileOf("not json at all"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not JSON/));
  expect(store.createTask).not.toHaveBeenCalled();
});

test("restore can be cancelled from the preview", async () => {
  const store = { createTask: vi.fn() };
  render(<RestorePanel uid="maya" existing={{}} store={store} />);
  upload(fileOf(exportFile));
  fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("region", { name: "Restore preview" })).not.toBeInTheDocument();
  expect(store.createTask).not.toHaveBeenCalled();
});
