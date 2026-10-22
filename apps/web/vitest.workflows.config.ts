import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";
import { workflowFiles } from "./test/workflows/manifest.mjs";

export default mergeConfig(base, defineConfig({
  // Do not load any developer or production .env files.
  envDir: false,
  test: {
    // Escape dynamic route brackets because include entries are glob patterns.
    include: workflowFiles.map(file => file.replace(/[\[\]]/g, char => `\\${char}`)),
    setupFiles: ["./test/workflows/offlineSetup.js"],
    maxWorkers: 2,
    pool: "forks",
  },
}));
