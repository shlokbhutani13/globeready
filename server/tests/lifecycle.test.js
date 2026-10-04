import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";

import { createLifecycle } from "../src/lifecycle.js";
import { createLogger } from "../src/logger.js";

function fakeServer({ closeError = null, neverCloses = false } = {}) {
  const server = {
    closed: false,
    idleClosed: false,
    close(callback) {
      server.closed = true;
      if (neverCloses) return;
      queueMicrotask(() => callback(closeError));
    },
    closeIdleConnections() { server.idleClosed = true; },
  };
  return server;
}

function harness(options = {}) {
  const exits = [];
  const lines = [];
  const processRef = new EventEmitter();
  const logger = createLogger({ write: (line) => lines.push(line) });
  const server = options.server || fakeServer();
  const lifecycle = createLifecycle({
    server,
    logger,
    timeoutMs: options.timeoutMs ?? 1_000,
    exit: (code) => exits.push(code),
    processRef,
    onShutdown: options.onShutdown,
  });
  return { exits, lines, processRef, server, lifecycle };
}

describe("graceful shutdown", () => {
  test("SIGTERM stops accepting connections, drains, and exits 0", async () => {
    const { exits, server, processRef, lifecycle } = harness();
    processRef.emit("SIGTERM");
    await lifecycle.shutdown("SIGTERM");
    expect(server.closed).toBe(true);
    expect(server.idleClosed).toBe(true);
    expect(exits).toEqual([0]);
    expect(lifecycle.isShuttingDown()).toBe(true);
  });

  test("SIGINT takes the same path", async () => {
    const { exits, processRef, lifecycle } = harness();
    processRef.emit("SIGINT");
    await lifecycle.shutdown("SIGINT");
    expect(exits).toEqual([0]);
  });

  test("a failed close exits non-zero rather than reporting a clean stop", async () => {
    const { exits, lifecycle } = harness({ server: fakeServer({ closeError: new Error("close failed") }) });
    await lifecycle.shutdown("SIGTERM");
    expect(exits).toEqual([1]);
  });

  test("a hung shutdown is bounded and exits non-zero within the timeout", async () => {
    const { exits, lifecycle } = harness({ server: fakeServer({ neverCloses: true }), timeoutMs: 20 });
    await lifecycle.shutdown("SIGTERM");
    expect(exits).toEqual([1]);
  });

  test("cleanup of owned resources runs before the process exits", async () => {
    const order = [];
    const { lifecycle, exits } = harness({
      onShutdown: async () => { order.push("cleanup"); },
    });
    await lifecycle.shutdown("SIGTERM");
    order.push(`exit:${exits[0]}`);
    expect(order).toEqual(["cleanup", "exit:0"]);
  });

  test("repeated shutdown requests share one shutdown and exit once", async () => {
    const { exits, lifecycle } = harness();
    await Promise.all([lifecycle.shutdown("SIGTERM"), lifecycle.shutdown("SIGINT")]);
    expect(exits).toEqual([0]);
  });

  test("a second signal during shutdown forces an immediate non-zero exit", async () => {
    const { exits, processRef, lifecycle } = harness({ server: fakeServer({ neverCloses: true }), timeoutMs: 5_000 });
    processRef.emit("SIGTERM");
    processRef.emit("SIGTERM");
    expect(exits).toEqual([1]);
    expect(lifecycle.isShuttingDown()).toBe(true);
  });
});

describe("process-level failure policy", () => {
  test("an unhandled rejection is logged and the process exits non-zero", async () => {
    const { exits, processRef, lines } = harness();
    processRef.emit("unhandledRejection", Object.assign(new Error("secret detail"), { code: "ERR_X" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(exits).toEqual([1]);
    const text = lines.join("\n");
    expect(text).toContain("process.unhandled_rejection");
    expect(text).not.toContain("secret detail");
  });

  test("an uncaught exception is logged and the process exits non-zero", async () => {
    const { exits, processRef } = harness();
    processRef.emit("uncaughtException", new Error("boom"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(exits).toEqual([1]);
  });

  test("a lifecycle needs a real HTTP server to manage", () => {
    expect(() => createLifecycle({ server: null, logger: createLogger({ write() {} }), processRef: new EventEmitter() }))
      .toThrow(/HTTP server/);
  });
});
