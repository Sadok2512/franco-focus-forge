import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseURL = process.env.SS02_BASE_URL;
const email = process.env.SS02_EMAIL;
const password = process.env.SS02_PASSWORD;
const auditDir = process.env.SS02_AUDIT_DIR;
if (!baseURL || !email || !password || !auditDir) {
  throw new Error("SS02_BASE_URL, SS02_EMAIL, SS02_PASSWORD and SS02_AUDIT_DIR are required");
}

await mkdir(auditDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const apiErrors = [];
const writes = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.url().includes("/api/") && response.status() >= 400) {
    apiErrors.push({ url: response.url(), status: response.status() });
  }
});
page.on("request", (request) => {
  if (request.url().includes("/superstreams") && request.method() !== "GET") {
    writes.push({
      method: request.method(),
      url: request.url(),
      ifMatch: request.headers()["if-match"] ?? null,
      body: request.postDataJSON() ?? null,
    });
  }
});

try {
  await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL(/\/projects/),
    page.getByRole("button", { name: "Se connecter" }).click(),
  ]);

  const projectRow = page.locator("tr", { hasText: "SS02 Project A" });
  await projectRow.getByLabel("Plus d'actions pour SS02 Project A").click();
  await page.getByRole("menuitem", { name: /Créer un Superstream|Create Superstream/ }).click();
  const createDialog = page.getByRole("dialog", {
    name: /Créer un Superstream|Create Superstream/,
  });
  await createDialog.waitFor();
  await createDialog.screenshot({ path: `${auditDir}/01-create-dialog.png` });
  await createDialog.getByLabel(/Nom du Superstream|Superstream name/).fill("SS02 Playwright");
  await createDialog.locator('tr[data-capture-id="bbbbbbbbbbbb"]').click();
  await createDialog.locator('tr[data-capture-id="aaaaaaaaaaaa"]').click();
  if (await createDialog.getByText("foreign.nmf").count()) {
    throw new Error("Cross-project capture leaked into project A dialog");
  }
  await createDialog.screenshot({ path: `${auditDir}/02-selected-order.png` });
  await createDialog.getByRole("button", { name: /^(Créer|Create)$/ }).click();
  await page.locator('[data-superstream="SS02 Playwright"]').waitFor();
  await page
    .locator('[data-superstream="SS02 Playwright"]')
    .screenshot({ path: `${auditDir}/03-tree-created.png` });

  await page.getByLabel(/Actions pour SS02 Playwright|Actions for SS02 Playwright/).click();
  await page.getByRole("menuitem", { name: /Renommer|Rename/ }).click();
  const renameDialog = page.getByRole("dialog", { name: /Renommer|Rename/ });
  await renameDialog.getByLabel(/Nom du Superstream|Superstream name/).fill("SS02 Renamed");
  await renameDialog.getByRole("button", { name: /^(Renommer|Rename)$/ }).click();
  await page.locator('[data-superstream="SS02 Renamed"]').waitFor();

  await page.getByLabel(/Actions pour SS02 Renamed|Actions for SS02 Renamed/).click();
  await page.getByRole("menuitem", { name: /Modifier les captures|Edit captures/ }).click();
  const membersDialog = page.getByRole("dialog", {
    name: /Modifier les captures du Superstream|Edit Superstream captures/,
  });
  const order = membersDialog.getByTestId("superstream-capture-order");
  await order
    .getByRole("button", { name: /Monter la capture|Move capture up/ })
    .last()
    .click();
  await membersDialog.screenshot({ path: `${auditDir}/04-members-reordered.png` });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/members") &&
        response.request().method() === "PUT" &&
        response.ok(),
    ),
    membersDialog.getByRole("button", { name: /Enregistrer|Save/ }).click(),
  ]);
  const renamedStream = page.locator('[data-superstream="SS02 Renamed"]');
  await renamedStream.waitFor();
  if ((await renamedStream.getAttribute("aria-expanded")) !== "true")
    await renamedStream.locator("button").first().click();
  await renamedStream.getByText("aaaaaaaaaaaa").waitFor();
  await page.screenshot({ path: `${auditDir}/05-project-tree.png`, fullPage: true });

  await page.getByLabel(/Actions pour SS02 Renamed|Actions for SS02 Renamed/).click();
  await page.getByRole("menuitem", { name: /Supprimer le Superstream|Delete Superstream/ }).click();
  const confirm = page.getByRole("alertdialog", {
    name: /Supprimer le Superstream|Delete Superstream/,
  });
  await confirm
    .getByRole("button", { name: /Supprimer le Superstream|Delete Superstream/ })
    .click();
  await page.locator('[data-superstream="SS02 Renamed"]').waitFor({ state: "detached" });

  const createWrite = writes.find((write) => write.method === "POST");
  if (
    !createWrite ||
    JSON.stringify(createWrite.body) !==
      JSON.stringify({
        name: "SS02 Playwright",
        captureIds: ["bbbbbbbbbbbb", "aaaaaaaaaaaa"],
      })
  )
    throw new Error(`Unexpected create contract: ${JSON.stringify(createWrite)}`);
  const conditionalWrites = writes.filter((write) =>
    ["PATCH", "PUT", "DELETE"].includes(write.method),
  );
  if (
    conditionalWrites.length !== 3 ||
    conditionalWrites.some((write) => !/^"\d+"$/.test(write.ifMatch ?? ""))
  ) {
    throw new Error(`Missing If-Match: ${JSON.stringify(conditionalWrites)}`);
  }
  if (apiErrors.length || consoleErrors.length) {
    throw new Error(`Browser errors: ${JSON.stringify({ apiErrors, consoleErrors })}`);
  }
  await writeFile(
    `${auditDir}/playwright-result.json`,
    JSON.stringify(
      {
        verdict: "PASS",
        projectIsolation: true,
        writes,
        apiErrors,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    "VERDICT=PASS CRUD=CREATE,RENAME,MEMBERS,DELETE PROJECT_ISOLATION=PASS IF_MATCH=PASS",
  );
} catch (error) {
  await page.screenshot({ path: `${auditDir}/failure.png`, fullPage: true });
  await writeFile(
    `${auditDir}/playwright-result.json`,
    JSON.stringify(
      {
        verdict: "FAIL",
        error: String(error),
        writes,
        apiErrors,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  console.error(`VERDICT=FAIL reason=${String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
