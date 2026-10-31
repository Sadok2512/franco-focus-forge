const { expect, test } = require("playwright/test");

const baseURL = process.env.BC1_BASE_URL ?? "http://127.0.0.1:9274";

test.beforeEach(async ({ page, request }) => {
  const login = await request.post(`${baseURL}/api/auth/login`, {
    data: {
      email: process.env.BC1_ADMIN_EMAIL,
      password: process.env.BC1_ADMIN_PASSWORD,
    },
  });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  await page.addInitScript((value) => {
    window.localStorage.setItem("bc4.session", JSON.stringify(value));
  }, session);
});

test("completed import is visible in history", async ({ page }) => {
  await page.goto(`${baseURL}/settings/cellular-reference`);
  await expect(page.getByText("ref_cell_4G5G.csv")).toBeVisible();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "audit/bc1-cell-ref-upload/history-completed.png",
    fullPage: true,
  });
});

test("forced proxy cutoff displays HTTP status and reason", async ({ page }) => {
  await page.route("**/api/settings/cell-ref/upload", async (route) => {
    await route.fulfill({
      status: 504,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          code: "CELL_REFERENCE_UPLOAD_TIMEOUT",
          message:
            "Le proxy a interrompu l'upload avant la reponse de l'API; aucun import n'est confirme.",
        },
      }),
    });
  });
  await page.goto(`${baseURL}/settings/cellular-reference`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "forced-cutoff.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,rat\n1,LTE\n"),
  });
  await page.getByRole("button", { name: "Uploader la référence" }).click();
  await expect(page.getByText(/HTTP 504/)).toBeVisible();
  await expect(page.getByText(/proxy a interrompu/)).toBeVisible();
  await page.screenshot({
    path: "audit/bc1-cell-ref-upload/forced-cutoff-error.png",
    fullPage: true,
  });
});

test("processing remains visible after browser upload reaches 100 percent", async ({ page }) => {
  await page.route("**/api/settings/cell-ref/upload", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "ref-progress",
        status: "queued",
        filename: "progress.csv",
        source_bytes: 15,
      }),
    });
  });
  await page.route("**/api/settings/cell-ref/jobs/ref-progress", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "ref-progress",
        filename: "progress.csv",
        uploaded_at: "2026-10-31T00:00:00Z",
        status: "running",
        progress_percent: 10,
        rows_read: 0,
        rows_loaded: 0,
        rows_rejected: 0,
        report: null,
        error: null,
      }),
    });
  });
  await page.goto(`${baseURL}/settings/cellular-reference`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "progress.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,rat\n1,LTE\n"),
  });
  const upload = page.getByRole("button", { name: "Uploader la référence" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.screenshot({
    path: "audit/bc1-cell-ref-upload/processing-visible.png",
    fullPage: true,
  });
  await upload;
});
