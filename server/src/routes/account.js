import { Router } from "express";
import {
  accountDeletionPhrase, defaultRecentLoginWindowMs, deleteAccount, exportAccount, isRecentSignIn,
} from "../account.js";
import { noopLogger } from "../logger.js";

const pass = (_request, _response, next) => next();

export function accountRouter(store, {
  account = {},
  clock = () => new Date(),
  recentLoginWindowMs = defaultRecentLoginWindowMs,
  exportLimiter = pass,
  deletionLimiter = pass,
  auditLogger = noopLogger,
} = {}) {
  const router = Router();
  router.get("/export", exportLimiter, async (request, response) => {
    const data = await exportAccount({ store, uid: request.user.uid, now: clock() });
    auditLogger.info("audit.account_exported", { actorUid: request.user.uid, requestId: request.requestId });
    response.setHeader("Content-Disposition", 'attachment; filename="globeready-account-export.json"');
    response.json(data);
  });
  router.delete("/", deletionLimiter, async (request, response) => {
    if (request.body?.confirmation !== accountDeletionPhrase) {
      return response.status(422).json({
        error: { code: "confirmation_required", message: `Type "${accountDeletionPhrase}" to confirm.` },
      });
    }
    if (!request.user.demo && !isRecentSignIn(request.user.authTime, clock().getTime(), recentLoginWindowMs)) {
      return response.status(403).json({
        error: { code: "recent_login_required", message: "Sign out, sign back in, and try again to delete your account." },
      });
    }
    const storageAvailable = request.user.demo || typeof account.deleteStoragePrefix === "function";
    if (!storageAvailable) {
      return response.status(503).json({
        error: {
          code: "account_deletion_unavailable",
          message: "Account deletion is temporarily unavailable. Your data has not been changed; try again later.",
        },
      });
    }
    const result = await deleteAccount({
      store,
      uid: request.user.uid,
      deleteStoragePrefix: request.user.demo ? async () => {} : account.deleteStoragePrefix,
      deleteAuthUser: request.user.demo ? null : account.deleteAuthUser || null,
    });
    auditLogger.info("audit.account_deleted", {
      actorUid: request.user.uid,
      authIdentity: result.authIdentity,
      requestId: request.requestId,
    });
    response.json({ data: { deleted: true, ...result } });
  });
  return router;
}
