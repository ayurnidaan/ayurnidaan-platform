import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: "npx tsx server/index.ts",
      url: "http://127.0.0.1:3101/api/health",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: "3101",
        HOST: "127.0.0.1",
        APP_ORIGIN: "http://127.0.0.1:5174",
        DATABASE_PATH: "./test-results/browser.sqlite",
        UPLOAD_DIR: "./test-results/uploads",
        ADMIN_EMAIL: "browser@vaidya.local",
        ADMIN_PASSWORD: "browser-test-password-only",
        ADMIN_NAME: "Dr. Ananya Sharma",
        SEED_DEMO: "true",
        COOKIE_SECURE: "false",
      },
    },
    {
      command: "npx vite --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: { API_PORT: "3101" },
    },
  ],
});
