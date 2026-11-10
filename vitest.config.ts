import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    // Long scenarios (days of game time) are slow on a busy machine; generous limit, not a performance target.
    testTimeout: 30_000,
  },
});
