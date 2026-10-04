// Process lifecycle: a bounded, observable shutdown and an explicit policy for process-level failures.
// Policy: an uncaught exception or unhandled rejection leaves the process in an unknown state, so it is logged
// and the process exits non-zero after a bounded attempt to close the server. The orchestrator restarts it.
export function createLifecycle({
  server,
  logger,
  timeoutMs = 10_000,
  exit = (code) => process.exit(code),
  processRef = process,
  onShutdown = async () => {},
} = {}) {
  if (!server || typeof server.close !== "function") throw new Error("Lifecycle requires an HTTP server.");
  let shuttingDown = false;
  let shutdownPromise = null;

  let finished = false;
  function finish(code, reason) {
    if (finished) return;
    finished = true;
    logger.info("lifecycle.exit", { exitCode: code, reason });
    exit(code);
  }

  function shutdown(reason, { exitCode = 0 } = {}) {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    logger.info("lifecycle.shutdown_started", { reason });
    shutdownPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        // Stop waiting for in-flight requests; do not hang the orchestrator's termination window.
        logger.error("lifecycle.shutdown_timeout", { timeoutMs });
        finish(1, reason);
        resolve();
      }, timeoutMs);
      timer.unref?.();

      server.close(async (error) => {
        server.closeIdleConnections?.();
        try {
          if (error) throw error;
          await onShutdown();
          clearTimeout(timer);
          logger.info("lifecycle.shutdown_complete", { reason });
          finish(exitCode, reason);
        } catch (failure) {
          clearTimeout(timer);
          logger.error("lifecycle.shutdown_failed", { errorCode: failure?.code || "unknown" });
          finish(1, reason);
        }
        resolve();
      });
      server.closeIdleConnections?.();
    });
    return shutdownPromise;
  }

  function onSignal(signal) {
    if (shutdownPromise) {
      // A second signal means the operator wants the process gone now.
      logger.warn("lifecycle.forced_exit", { signal });
      exit(1);
      return;
    }
    shutdown(signal);
  }

  processRef.on("SIGTERM", () => onSignal("SIGTERM"));
  processRef.on("SIGINT", () => onSignal("SIGINT"));
  processRef.on("unhandledRejection", (reason) => {
    logger.error("process.unhandled_rejection", { errorCode: reason?.code || "unknown" });
    shutdown("unhandledRejection", { exitCode: 1 });
  });
  processRef.on("uncaughtException", (error) => {
    logger.error("process.uncaught_exception", { errorCode: error?.code || "unknown" });
    shutdown("uncaughtException", { exitCode: 1 });
  });

  return {
    shutdown,
    isShuttingDown: () => shuttingDown,
  };
}
