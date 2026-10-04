import { Router } from "express";
import { isOwnedDocumentPath } from "../storage-paths.js";

export function documentsRouter(store, assistant, aiLimiter = (_request, _response, next) => next(), {
  deleteStoredFile = null,
} = {}) {
  const router = Router();
  const ownedDocument = async (uid, id) => {
    const documents = await store.documents.list(uid);
    return documents.find((item) => item.id === id);
  };
  const invalidStoragePath = (uid, document) => !isOwnedDocumentPath(uid, document.storagePath);

  router.get("/", async (request, response) => {
    response.json({ data: await store.documents.list(request.user.uid) });
  });
  router.delete("/:id", async (request, response) => {
    const document = await ownedDocument(request.user.uid, request.params.id);
    if (!document) return response.status(404).json({ error: { code: "document_not_found" } });
    // The stored file goes first and must succeed before the metadata is removed, so a failure leaves the record
    // in place for a safe retry instead of orphaning the file. A path outside the owner's folder never reaches
    // storage; only its metadata is removed.
    if (document.storagePath && !invalidStoragePath(request.user.uid, document)) {
      if (typeof deleteStoredFile !== "function") {
        return response.status(503).json({
          error: { code: "document_storage_unavailable", message: "Documents cannot be deleted right now. Try again later." },
        });
      }
      try {
        await deleteStoredFile(document.storagePath);
      } catch {
        return response.status(503).json({
          error: { code: "document_storage_unavailable", message: "Documents cannot be deleted right now. Try again later." },
        });
      }
    }
    await store.ragChunks?.removeForDocument(request.user.uid, document.id);
    const removed = await store.documents.remove(request.user.uid, document.id);
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
