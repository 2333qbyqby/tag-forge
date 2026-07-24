import { expect, test } from "@playwright/test";
import path from "node:path";

const templatePath = path.resolve(
  ".tmp/public/templates/minimal-collision.tagforge.json",
);

async function openPackManager(page: import("@playwright/test").Page) {
  await page.locator(".main-nav button").filter({ hasText: "数据包" }).click();
  await expect(page.locator(".pack-dropzone")).toBeVisible();
}

async function uploadTemplate(page: import("@playwright/test").Page) {
  await page.locator('input[type="file"]').setInputFiles(templatePath);
  await expect(page.locator(".import-preview")).toContainText("VALID PACK");
}

test("loads the official V2 pack and renders all named recipes", async ({
  page,
}) => {
  await page.goto("/?view=generate");
  await expect(page.locator(".brand")).toContainText("TagForge");
  await expect(page.locator(".pack-origin-badge")).toContainText("官方");
  await expect(page.locator("#recipe-select option")).toHaveCount(5);
  await expect(page.locator(".idea-tile")).toHaveCount(2);

  const before = await page.locator(".idea-tile h2").allTextContents();
  await page.locator(".generate-button").click();
  const after = await page.locator(".idea-tile h2").allTextContents();
  expect(after).not.toEqual(before);
  const labButton = page
    .locator(".main-nav button")
    .filter({ hasText: "数据实验室" });
  await expect(labButton).toBeVisible();
  await labButton.click();
  await expect(page.locator(".lab-summary-grid article").first()).toContainText(
    "424",
  );
  await expect(page.locator(".graph-node").first()).toBeVisible();
});

test("temporary packs disappear on refresh and cannot enable analysis", async ({
  page,
}) => {
  await page.goto("/?view=generate");
  await openPackManager(page);
  await uploadTemplate(page);
  await page.locator(".pack-preview-actions button").first().click();

  await expect(page.locator(".pack-origin-badge")).toContainText("临时");
  await expect(
    page.locator(".main-nav button").filter({ hasText: "数据实验室" }),
  ).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".pack-origin-badge")).toContainText("官方");
  await expect(
    page.locator(".main-nav button").filter({ hasText: "数据实验室" }),
  ).toBeVisible();
});

test("installed packs, generation, favorites, and deletion survive refresh", async ({
  page,
}) => {
  await page.goto("/?view=generate");
  await openPackManager(page);
  await uploadTemplate(page);
  await page.locator(".pack-preview-actions button").last().click();

  await expect(page.locator(".pack-origin-badge")).toContainText("本地");
  await expect(page.locator(".idea-tile")).toHaveCount(2);
  await expect(
    page.locator(".main-nav button").filter({ hasText: "数据实验室" }),
  ).toHaveCount(0);

  await page.locator(".generate-button").click();
  await page.locator(".idea-toolbar-actions .secondary-button").nth(1).click();
  await page.reload();
  await expect(page.locator(".pack-origin-badge")).toContainText("本地");

  await page.locator(".main-nav button").filter({ hasText: "收藏" }).click();
  await expect(page.locator(".favorite-card")).toHaveCount(1);

  await openPackManager(page);
  await page.locator(".installed-pack-list article .icon-button").click();
  await expect(page.locator(".pack-origin-badge")).toContainText("官方");
});
