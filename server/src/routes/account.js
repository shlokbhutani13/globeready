import { Router } from "express";
import {
  accountDeletionPhrase, defaultRecentLoginWindowMs, deleteAccount, exportAccount, isRecentSignIn,
} from "../account.js";

export function accountRouter(store, {
  account = {},
  clock = () => new Date(),
  recentLoginWindowMs = defaultRecentLoginWindowMs,
} = {}) {
  const router = Router();
  router.get("/export", async (request, response) => {
    const data = await exportAccount({ store, uid: request.user.uid, now: clock() });
    response.setHeader("Content-Disposition", 'attachment; filename="globeready-account-export.json"');
    response.json(data);
  });
  router.delete("/", async (request, response) => {
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
    const result = await deleteAccount({
      store,
      uid: request.user.uid,
      deleteStoragePrefix: account.deleteStoragePrefix || (async () => {}),
      deleteAuthUser: request.user.demo ? null : account.deleteAuthUser || null,
    });
    response.json({ data: { deleted: true, ...result } });
  });
  return router;
}
