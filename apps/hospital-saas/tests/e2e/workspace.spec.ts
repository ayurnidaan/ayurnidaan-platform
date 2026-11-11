import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/?patient=25559");
  await page.getByLabel("Email address").fill("browser@vaidya.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-only");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Patient workspace" }),
  ).toBeVisible();
  await expect(page.getByText("Kailash Kanwar", { exact: true })).toBeVisible();
}
test("complete workspace, care tabs, responsive layout and transparent asset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(page.getByRole("table")).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const img = new Image();
      img.src = "/images/clay-botanical.png";
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return (
        ctx.getImageData(0, 0, 1, 1).data[3] === 0 &&
        ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data[3] > 0
      );
    }),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/desktop-workspace.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const name of [
    "Basic detail",
    "Accommodation",
    "IPD history",
    "Prescription",
    "Diet",
    "Investigation",
    "Documents",
    "Discharge summary",
    "Daily program",
    "Vital data",
    "Therapy",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/mobile-workspace.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pharmacy inventory" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("record session vitals and verify they persist and sync to the chart", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("tab", { name: "Vital data", exact: true }).click();
  await page
    .getByRole("button", { name: "Record vitals", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Observation date").fill("2026-09-01");
  await expect(dialog.getByLabel("Temperature · °C")).toHaveValue("37");
  await dialog.getByLabel("Session", { exact: true }).selectOption("Noon");
  await expect(dialog.getByLabel("Temperature · °C")).toHaveValue("");
  await dialog.getByLabel("Observation date").fill("2026-09-02");
  await dialog.getByLabel("Session", { exact: true }).selectOption("Noon");
  await dialog.getByLabel("Temperature · °C").fill("36.9");
  await dialog.getByLabel("Blood pressure · mmHg").fill("119/79");
  await dialog.getByLabel("SpO₂ · %").fill("99");
  await dialog.getByRole("button", { name: "Save observation" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("cell", { name: "119/79", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Vital data", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "119/79", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Therapy", exact: true }).click();
  await expect(page.getByText("119/79", { exact: false })).toBeVisible();
});
test("schedule multiple dates, save a note and create an estimate", async ({
  page,
}) => {
  await login(page);
  await page.getByLabel("Care date", { exact: true }).fill("2026-09-01");
  await page
    .getByRole("button", { name: "Schedule therapy", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByTitle("11 September 2026", { exact: true }).click();
  await dialog.getByLabel("Search therapy catalog").fill("Nasya");
  await dialog.getByLabel("Nasya").check();
  await dialog
    .getByRole("button", { name: "Schedule therapies", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Nasya 20 min" }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Notes for 2026-09-08 Evening" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox")
    .fill("Comfortable after session. Follow-up documented.");
  await dialog.getByRole("button", { name: "Save note" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "Notes for 2026-09-08 Evening" })
    .click();
  await expect(
    page.getByText("Comfortable after session. Follow-up documented."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Create estimate", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search estimate therapies").fill("Nasya");
  await dialog.getByRole("button", { name: "Nasya ₹450" }).click();
  await dialog.getByRole("spinbutton").fill("3");
  await expect(dialog.getByText("₹1,350", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Save estimate" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Saved therapy estimates")).toBeVisible();
});
test("care record CRUD, document upload and patient billing", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("tab", { name: "Diet", exact: true }).click();
  await page.getByRole("button", { name: "Add record" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: false }).fill("Evening meal plan");
  await dialog
    .getByLabel("Meal plan and dietary instructions")
    .fill("Supervised meal plan update.");
  await dialog.getByRole("button", { name: "Save care record" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Evening meal plan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Evening meal plan" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: false })
    .fill("Updated evening meal plan");
  await dialog.getByRole("button", { name: "Save care record" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "Delete Updated evening meal plan" })
    .click();
  await page
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Updated evening meal plan" }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  await page.getByLabel("Upload document", { exact: true }).setInputFiles({
    name: "sample-report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nTest document\n%%EOF"),
  });
  await expect(
    page.getByText("sample-report.pdf", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pharmacy bill", exact: true })
    .click();
  await page.getByRole("button", { name: "Create bill", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bill description").fill("Care session invoice");
  await dialog.getByLabel("Line 1 description").fill("Care service");
  await dialog.getByLabel("Line 1 unit price").fill("1200");
  await dialog
    .getByRole("button", { name: "Create bill", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Care session invoice")).toBeVisible();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .last()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.locator(".document-row .pill").filter({ hasText: /^Paid$/ }),
  ).toBeVisible();
});
test("new patient admission works and data is isolated from the reference case", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "New patient", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Patient name").fill("Browser Test Patient");
  await dialog.getByLabel("Age", { exact: false }).fill("42");
  await dialog.getByRole("button", { name: "Admit patient" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Browser Test Patient" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Vital data", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Every observation matters" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await expect(
    page.getByText("Browser Test Patient", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Kailash Kanwar", { exact: true })).toBeVisible();
});
