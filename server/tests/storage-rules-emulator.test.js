import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, getMetadata, ref, uploadBytes } from "firebase/storage";

const describeEmulator = process.env.STORAGE_EMULATOR_HOST ? describe : describe.skip;
const emulatorAddress = (process.env.STORAGE_EMULATOR_HOST || "127.0.0.1:9199").replace(/^https?:\/\//, "");
const [host, port] = emulatorAddress.split(":");
const maxBytes = 10 * 1024 * 1024;
const pdf = (size = 1024) => new Uint8Array(size);
const pdfType = { contentType: "application/pdf" };
const alicePdf = "users/alice/documents/doc-1/I-20.pdf";

describeEmulator("Storage security rules", () => {
  let env;

  beforeAll(async () => {
    const rules = await readFile(fileURLToPath(new URL("../../storage.rules", import.meta.url)), "utf8");
    env = await initializeTestEnvironment({
      projectId: "globeready-storage-test",
      storage: { rules, host, port: Number(port) },
    });
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), alicePdf), pdf(), pdfType);
    });
  }, 120_000);

  afterAll(async () => {
    await env?.cleanup();
  });

  const as = (uid) => env.authenticatedContext(uid).storage();
  const anon = () => env.unauthenticatedContext().storage();

  test("the owner can upload a PDF to their document path", async () => {
    await assertSucceeds(uploadBytes(ref(as("bob"), "users/bob/documents/doc-b/passport.pdf"), pdf(), pdfType));
  });

  test("the owner can upload a PNG and a JPEG to their document path", async () => {
    await assertSucceeds(uploadBytes(ref(as("alice"), "users/alice/documents/doc-2/passport.png"), pdf(), { contentType: "image/png" }));
    await assertSucceeds(uploadBytes(ref(as("alice"), "users/alice/documents/doc-3/passport.jpg"), pdf(), { contentType: "image/jpeg" }));
  });

  test("the owner can read and delete their own object", async () => {
    await assertSucceeds(getBytes(ref(as("alice"), alicePdf)));
    await assertSucceeds(getMetadata(ref(as("alice"), alicePdf)));
    const disposable = ref(as("alice"), "users/alice/documents/doc-delete/disposable.pdf");
    await assertSucceeds(uploadBytes(disposable, pdf(), pdfType));
    await assertSucceeds(deleteObject(disposable));
    await expect(getMetadata(disposable)).rejects.toMatchObject({ code: "storage/object-not-found" });
  });

  test("the stored metadata matches what the document pipeline checks", async () => {
    const metadata = await getMetadata(ref(as("alice"), alicePdf));
    expect(metadata.contentType).toBe("application/pdf");
    expect(metadata.size).toBe(1024);
    expect(alicePdf.startsWith("users/alice/documents/")).toBe(true);
  });

  test("another authenticated student cannot read the object", async () => {
    await assertFails(getBytes(ref(as("bob"), alicePdf)));
    await assertFails(getMetadata(ref(as("bob"), alicePdf)));
  });

  test("another authenticated student cannot overwrite the object", async () => {
    await assertFails(uploadBytes(ref(as("bob"), alicePdf), pdf(), pdfType));
  });

  test("another authenticated student cannot delete the object", async () => {
    await assertFails(deleteObject(ref(as("bob"), alicePdf)));
  });

  test("an unauthenticated visitor cannot read or write", async () => {
    await assertFails(getBytes(ref(anon(), alicePdf)));
    await assertFails(uploadBytes(ref(anon(), "users/alice/documents/doc-9/x.pdf"), pdf(), pdfType));
  });

  test("an unsupported MIME type is rejected, including scriptable SVG and HTML", async () => {
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/documents/doc-4/page.html"), pdf(), { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/documents/doc-5/image.svg"), pdf(), { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/documents/doc-6/x.exe"), pdf(), { contentType: "application/x-msdownload" }));
  });

  test("a MIME type that only starts with an allowed type is rejected", async () => {
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/documents/doc-7/x.pdf"), pdf(), { contentType: "application/pdf-malicious" }));
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/documents/doc-8/x.pdf"), pdf(), { contentType: "image/pngx" }));
  });

  test("a file with no content type is rejected", async () => {
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/documents/doc-10/x.pdf"), pdf()));
  });

  test("a file exactly at the 10 MB limit is accepted", async () => {
    await assertSucceeds(uploadBytes(ref(as("alice"), "users/alice/documents/doc-11/max.pdf"), pdf(maxBytes), pdfType));
  }, 120_000);

  test("a file one byte over the 10 MB limit is rejected", async () => {
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/documents/doc-12/over.pdf"), pdf(maxBytes + 1), pdfType));
  }, 120_000);

  test("a student cannot write outside their own document folder", async () => {
    await assertFails(uploadBytes(ref(as("alice"), "users/bob/documents/doc-13/x.pdf"), pdf(), pdfType));
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/notes/x.pdf"), pdf(), pdfType));
    await assertFails(uploadBytes(ref(as("alice"), "public/x.pdf"), pdf(), pdfType));
  });

  test("a path that tries to climb into another student's folder is rejected", async () => {
    await assertFails(uploadBytes(ref(as("alice"), "users/alice/documents/../../bob/documents/doc-14/x.pdf"), pdf(), pdfType));
  });
});
