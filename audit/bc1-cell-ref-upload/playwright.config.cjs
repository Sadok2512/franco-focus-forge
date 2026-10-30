const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: "e2e.spec.cjs",
  timeout: 30_000,
  use: {
    browserName: "chromium",
    headless: true,
    launchOptions: {
      executablePath: "/home/devmat/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
    },
    viewport: { width: 1440, height: 1000 },
  },
});
