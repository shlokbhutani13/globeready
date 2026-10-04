import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { DEMO_MODE: "true" },
  },
});
