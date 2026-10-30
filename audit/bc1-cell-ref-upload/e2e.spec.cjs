const { expect, test } = require("@playwright/test");

const baseURL = "http://127.0.0.1:9187";

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
  await page.route("**/api/reference/cell/upload", async (route) => {
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
  await page.route("**/api/reference/cell/upload", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows_read: 1,
        rows_loaded: 1,
        rows_rejected: 0,
        rejected_by_reason: {},
        distinct_eci: 1,
        distinct_nci: 0,
        by_rat: { LTE: 1 },
        bands_unmapped: {},
        etat_breakdown: {},
        arcep_breakdown: {},
        snapshot_date: "2026-10-30",
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
