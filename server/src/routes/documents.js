import { Router } from "express";
import { allowedDocumentTypes, cleanText, validDate } from "../validation.js";
import { config } from "../config.js";

export function documentsRouter(store, assistant, aiLimiter = (_request, _response, next) => next()) {
  const router = Router();
  const ownedDocument = async (uid, id) => {
    const documents = await store.documents.list(uid);
    return documents.find((item) => item.id === id);
  };
  const invalidStoragePath = (uid, document) =>
    !document.storagePath || !document.storagePath.startsWith(`users/${uid}/documents/`);

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
    await store.ragChunks?.removeForDocument(request.user.uid, request.params.id);
    const removed = await store.documents.remove(request.user.uid, request.params.id);
    return removed ? response.status(204).end() : response.status(404).json({ error: { code: "document_not_found" } });
  });
  router.post("/:id/index", aiLimiter, async (request, response) => {
    const document = await ownedDocument(request.user.uid, request.params.id);
    if (!document) {
      return response.status(404).json({ error: { code: "document_not_found" } });
    }
    if (invalidStoragePath(request.user.uid, document)) {
      return response.status(422).json({
        error: {
          code: "invalid_storage_path",
          message: "This document is not stored in your private folder.",
        },
      });
    }
    if (typeof assistant?.indexDocument !== "function") {
      return response.status(503).json({
        error: {
          code: "document_index_unavailable",
          message: "Document indexing is not configured for this deployment.",
        },
      });
    }

    await store.documents.update(request.user.uid, document.id, {
      analysisStatus: "indexing",
    });
    try {
      const analysis = await assistant.indexDocument({ uid: request.user.uid, document });
      const indexedAt = new Date().toISOString();
      await store.documents.update(request.user.uid, document.id, {
        analysis,
        analysisStatus: "indexed",
        analysisError: null,
        indexedAt,
      });
      return response.json({ data: analysis });
    } catch (error) {
      const analysisError = {
        code: error?.code || "document_index_failed",
        message: error?.safeMessage || "This document could not be read. Your upload is saved; you can retry.",
        retryable: error?.retryable !== false,
      };
      await store.documents.update(request.user.uid, document.id, {
        analysisStatus: "index_failed",
        analysisError,
      });
      return response.status(error?.status || 422).json({ error: analysisError });
    }
  });
  router.post("/:id/analyze", aiLimiter, async (request, response) => {
    const document = await ownedDocument(request.user.uid, request.params.id);
    if (!document) {
      return response.status(404).json({ error: { code: "document_not_found" } });
    }
    if (
      assistant?.mode === "live"
      && invalidStoragePath(request.user.uid, document)
    ) {
      return response.status(422).json({
        error: {
          code: "invalid_storage_path",
          message: "This document is not stored in your private folder.",
        },
      });
    }
    const analysis = await assistant.analyzeDocument({ uid: request.user.uid, document });
    await store.documents.update(request.user.uid, document.id, {
      analysis,
      analysisStatus: "complete",
    });
    response.json({ data: analysis });
  });
  return router;
}
