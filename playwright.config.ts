import { defineConfig, devices } from "@playwright/test";

const pnpm = process.env.npm_execpath
  ? `"${process.execPath}" "${process.env.npm_execpath}"`
  : "pnpm";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3200",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "tablet-chromium",
      use: { ...devices["iPad (gen 7)"], browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command: `${pnpm} --filter @eiep/web exec vite --host 127.0.0.1 --port 3200 --strictPort`,
      url: "http://127.0.0.1:3200",
      reuseExistingServer: false,
    },
    {
      command: `${pnpm} --filter @eiep/portal exec vite --host 127.0.0.1 --port 3201 --strictPort`,
      url: "http://127.0.0.1:3201",
      reuseExistingServer: false,
    },
  ],
});
