export function createAuthMiddleware(adminAuth) {
  return async function authenticate(request, response, next) {
    try {
      if (!adminAuth) {
        const uid = request.get("x-demo-user");
        if (!uid) {
          return response.status(401).json({
            error: { code: "demo_identity_required", message: "Choose a demo profile." },
          });
        }
        request.user = { uid, demo: true };
        return next();
      }

      const authorization = request.get("authorization") || "";
      if (!authorization.startsWith("Bearer ")) {
        return response.status(401).json({
          error: { code: "authentication_required", message: "Sign in to continue." },
        });
      }

      const token = authorization.slice("Bearer ".length);
      const decoded = await adminAuth.verifyIdToken(token);
      request.user = { uid: decoded.uid, email: decoded.email, demo: false };
      return next();
    } catch {
      return response.status(401).json({
        error: { code: "invalid_token", message: "Your session has expired. Sign in again." },
      });
    }
  };
}
