import { defineConfig } from "@playwright/test";
const base = process.env.BASE_PATH || "/";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: `http://127.0.0.1:4322${base}`,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {},
  },
  webServer: {
    command: `"${process.execPath}" node_modules/astro/bin/astro.mjs preview --ignore-lock --host 127.0.0.1 --port 4322`,
    url: `http://127.0.0.1:4322${base}`,
    reuseExistingServer: !process.env.CI,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
