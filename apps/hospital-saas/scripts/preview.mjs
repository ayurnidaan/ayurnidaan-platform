// Run against the local dev server to refresh repository previews and check printing.
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { parse } from "dotenv";
const env = parse(readFileSync(".env", "utf8"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Email address", { exact: true }).fill(env.ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await page.getByRole("table").waitFor();
  await page.evaluate(() => document.fonts.ready);
  mkdirSync("docs", { recursive: true });
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "docs/workspace-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/workspace-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("tab", { name: "Vital data", exact: true }).click();
  await page
    .getByRole("button", { name: "Record vitals", exact: true })
    .click();
  await page.getByLabel("Observation date").fill("2026-09-01");
  await page.getByLabel("Session", { exact: true }).selectOption("Morning");
  if ((await page.getByLabel("Temperature · °C").inputValue()) !== "37")
    throw new Error("Existing morning record did not load");
  await page.getByLabel("Session", { exact: true }).selectOption("Noon");
  if ((await page.getByLabel("Temperature · °C").inputValue()) !== "")
    throw new Error("Session fields did not clear");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "test-results/patient-print.pdf",
    format: "A4",
    landscape: true,
    printBackground: true,
  });
  if (errors.length) throw new Error(errors.join("; "));
  console.log(
    "Desktop/mobile previews, independent session form loading, and print export verified.",
  );
} finally {
  await browser.close();
}
