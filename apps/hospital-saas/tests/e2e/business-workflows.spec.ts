import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/?patient=25559");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("browser@vaidya.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-only");
  await page
    .getByRole("button", { name: "Enter workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Patient workspace", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".patient-banner")).toBeVisible();
}
async function admit(page: Page, name: string) {
  await page.getByRole("button", { name: "New patient", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Patient name").fill(name);
  await modal.getByLabel("Age", { exact: true }).fill("44");
  await modal
    .getByRole("button", { name: "Admit patient", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
test("prescribing, dispensing, inventory history and partial receipts form one usable flow", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  let modal = page.getByRole("dialog");
  await modal
    .getByLabel("Medicine / item", { exact: true })
    .fill("Browser connected medicine");
  await modal.getByLabel("Opening stock").fill("10");
  await modal.getByLabel("Stock unit", { exact: true }).fill("tablets");
  await modal.getByLabel("Price per stock unit · ₹").fill("25");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await admit(page, "Connected Prescription Patient");
  await page.getByRole("tab", { name: "Prescription", exact: true }).click();
  await page.getByRole("button", { name: "Add medicine", exact: true }).click();
  modal = page.getByRole("dialog");
  await modal
    .getByLabel("Medicine from inventory")
    .selectOption("Browser connected medicine");
  await modal
    .getByLabel("Dose", { exact: true })
    .fill("Clinician-recorded dose");
  await modal
    .getByLabel("Frequency", { exact: true })
    .selectOption("As directed");
  await modal.getByLabel("Duration · days").fill("3");
  await modal.getByLabel("Total quantity to dispense").fill("4");
  await modal
    .getByRole("button", { name: "Add prescription", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await page
    .getByRole("button", { name: "Dispense medicine", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal.getByLabel("Quantity to issue").fill("3");
  await modal
    .getByRole("button", { name: "Dispense & create invoice", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await expect(page.getByText(/Issued 3 · Remaining 1/)).toBeVisible();
  await page
    .getByRole("button", { name: "Pharmacy bill", exact: true })
    .click();
  await expect(
    page.getByText("Medicine · Browser connected medicine", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal.getByLabel("Payment amount · ₹").fill("25");
  await modal.getByLabel("Payment method").selectOption("UPI");
  await modal
    .getByLabel("Receipt / transaction reference")
    .fill("browser-receipt-1");
  await modal
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Partially paid", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Paid", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByLabel("Search inventory").fill("Browser connected medicine");
  await expect(
    page.getByRole("cell", { name: "7 tablets", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Stock history for Browser connected medicine",
    })
    .click();
  await expect(
    page.getByRole("dialog").getByText("-3", { exact: true }),
  ).toBeVisible();
});
test("an estimate becomes dated sessions and a plan invoice", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Create estimate", exact: true })
    .click();
  let modal = page.getByRole("dialog");
  await modal.getByLabel("Search estimate therapies").fill("Takradhara");
  await modal
    .getByRole("button", { name: "Takradhara ₹1,100", exact: true })
    .click();
  await modal.getByRole("spinbutton").fill("2");
  await modal
    .getByRole("button", { name: "Save estimate", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await page
    .getByRole("button", { name: "View estimates", exact: true })
    .click();
  let batch = page
    .locator(".estimate-batch")
    .filter({ hasText: "Takradhara" })
    .first();
  await batch
    .getByRole("button", { name: "Schedule this plan", exact: true })
    .click();
  modal = page.getByRole("dialog").last();
  await modal.getByLabel("First therapy date").fill("2026-09-11");
  await modal
    .getByRole("button", { name: "Schedule plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Care date", { exact: true })).toHaveValue(
    "2026-09-11",
  );
  await expect(
    page.getByRole("button", { name: "Takradhara 45 min" }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View estimates", exact: true })
    .click();
  batch = page
    .locator(".estimate-batch")
    .filter({ hasText: "Takradhara" })
    .first();
  await batch
    .getByRole("button", { name: "Create plan invoice", exact: true })
    .click();
  await expect(
    batch.getByText("Invoice created", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Pharmacy bill", exact: true })
    .click();
  await expect(
    page.getByText("Therapy plan estimate", { exact: true }),
  ).toBeVisible();
});
test("room assignment and discharge update occupancy and retain the final summary", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Rooms & beds", exact: true }).click();
  await page.getByRole("button", { name: "Add room", exact: true }).click();
  let modal = page.getByRole("dialog");
  await modal.getByLabel("Room name / number").fill("Browser Readiness Room");
  await modal.getByLabel("Daily rate · ₹").fill("300");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await admit(page, "Room Discharge Patient");
  await page.getByRole("tab", { name: "Accommodation", exact: true }).click();
  await page.getByRole("button", { name: "Assign room", exact: true }).click();
  modal = page.getByRole("dialog");
  const option = await modal
    .locator("option")
    .filter({ hasText: "Browser Readiness Room" })
    .textContent();
  await modal
    .getByLabel("Room / bed", { exact: true })
    .selectOption({ label: option! });
  await modal.getByRole("button", { name: "Assign room", exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Browser Readiness Room · Private" }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Discharge summary", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finalize discharge", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal
    .getByLabel("Clinical summary")
    .fill("Care handover recorded by the attending physician.");
  await modal
    .getByLabel("Home care and follow-up instructions")
    .fill("Follow the recorded care plan and follow-up instructions.");
  await modal
    .getByRole("button", { name: "Discharge patient", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await expect(
    page.locator(".patient-banner").getByText("Discharged", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Final discharge summary", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rooms & beds", exact: true }).click();
  const room = page
    .locator(".room-card")
    .filter({ hasText: "Browser Readiness Room" });
  await expect(
    room.getByText("1 of 1 beds available", { exact: true }),
  ).toBeVisible();
});
test("daily dashboard opens the matching patient date and program completion survives reload", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByLabel("Dashboard date").fill("2026-09-08");
  await page
    .locator(".queue-row")
    .filter({ hasText: "Kailash Kanwar" })
    .first()
    .click();
  await expect(page.getByLabel("Care date", { exact: true })).toHaveValue(
    "2026-09-08",
  );
  await page.getByRole("tab", { name: "Daily program", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete", exact: true })
    .first()
    .click();
  await expect(
    page.locator(".record-card .pill").filter({ hasText: "Completed" }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Daily program", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Care date", { exact: true })).toHaveValue(
    "2026-09-08",
  );
  await expect(
    page.locator(".record-card .pill").filter({ hasText: "Completed" }).first(),
  ).toBeVisible();
});
test("catalog management and practice settings save through their visible controls", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Therapy catalog", exact: true })
    .click();
  await page.getByRole("button", { name: "Add therapy", exact: true }).click();
  let modal = page.getByRole("dialog");
  await modal.getByLabel("Therapy name").fill("Browser Catalog Therapy");
  await modal.getByLabel("Price per session · ₹").fill("123.45");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal).toBeHidden();
  let row = page
    .locator(".document-row")
    .filter({ hasText: "Browser Catalog Therapy" });
  await row.getByRole("button", { name: "Edit therapy", exact: true }).click();
  modal = page.getByRole("dialog");
  await modal.getByLabel("Availability").selectOption("Archived");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal).toBeHidden();
  row = page
    .locator(".document-row")
    .filter({ hasText: "Browser Catalog Therapy" });
  await expect(row.getByText("Archived", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Practice name").fill("Browser Configured Clinic");
  await page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "Practice details" }) })
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    page.getByText("Practice details saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Practice name")).toHaveValue(
    "Browser Configured Clinic",
  );
});
