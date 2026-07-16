import { Router } from "express";
import { allowedDocumentTypes, cleanText, validDate } from "../validation.js";
import { config } from "../config.js";

export function documentsRouter(store) {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json({ data: await store.documents.list(request.user.uid) });
  });
  router.post("/", async (request, response) => {
    const { contentType, size } = request.body;
    if (
      !allowedDocumentTypes.has(contentType) ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > config.maxUploadBytes ||
      !validDate(request.body.expiresAt)
    ) {
      return response.status(422).json({
        error: {
          code: "invalid_document",
          message: "Upload a PDF, PNG, or JPEG up to 10 MB.",
        },
      });
    }
    const document = await store.documents.create(request.user.uid, {
      name: cleanText(request.body.name) || "Untitled document",
      category: cleanText(request.body.category) || "other",
      contentType,
      size,
      expiresAt: request.body.expiresAt || "",
      analysisStatus: "not_requested",
      storageMode: request.user.demo ? "metadata-only-demo" : "firebase",
    });
    response.status(201).json({ data: document });
  });
  router.delete("/:id", async (request, response) => {
    const removed = await store.documents.remove(request.user.uid, request.params.id);
    return removed ? response.status(204).end() : response.status(404).json({ error: { code: "document_not_found" } });
  });
  return router;
}
