import { Router } from "express";
import { consentFrom, consentRecord, consentRequiredMessage } from "../consent.js";
import { noopLogger } from "../logger.js";

export { consentRequiredMessage };

export function consentRouter(store, { clock = () => new Date(), auditLogger = noopLogger } = {}) {
  const router = Router();
  router.get("/", async (request, response) => {
    const profile = await store.profiles.get(request.user.uid);
    response.json({ data: consentFrom(profile) });
  });
  router.put("/", async (request, response) => {
    const record = consentRecord(request.body, new Date(clock()));
    if (!record) {
      return response.status(422).json({
        error: { code: "invalid_consent", message: "Send the current consent version with a yes or no for document reading." },
      });
    }
    await store.profiles.set(request.user.uid, { consent: record });
    auditLogger.info("audit.consent_changed", {
      actorUid: request.user.uid,
      docConsent: record.documents,
      aiConsent: record.aiGeneration,
      requestId: request.requestId,
    });
    const profile = await store.profiles.get(request.user.uid);
    response.json({ data: consentFrom(profile) });
  });
  return router;
}
