import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const templatePath = path.resolve(
  ".tmp/public/templates/minimal-collision.tagforge.json",
);

async function openPackManager(page: import("@playwright/test").Page) {
  await page.locator(".main-nav button").filter({ hasText: "数据包" }).click();
  await expect(page.locator(".pack-dropzone")).toBeVisible();
}

async function uploadTemplate(
  page: import("@playwright/test").Page,
  withRerollPool = false,
) {
  if (withRerollPool) {
    const pack = JSON.parse(fs.readFileSync(templatePath, "utf8")) as {
      entries: Array<Record<string, unknown>>;
    };
    pack.entries.push(
      {
        ...pack.entries[0],
        id: "movement-alt",
        family: "movement-alt",
        labels: { zh: "漂移", en: "Drift" },
      },
      {
        ...pack.entries[1],
        id: "memory-alt",
        family: "memory-alt",
        labels: { zh: "梦境", en: "Dream" },
      },
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: "rerollable.tagforge.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(pack)),
    });
  } else {
    await page.locator('input[type="file"]').setInputFiles(templatePath);
  }
  await expect(page.locator(".import-preview")).toContainText("VALID PACK");
}

test("loads the official dataset and renders all named recipes", async ({
  page,
}) => {
  await page.goto("/?view=generate");
  await expect(page.locator(".brand")).toContainText("TagForge");
  await expect(page.locator(".pack-origin-badge")).toContainText("官方");
  await expect(page.locator("#recipe-select option")).toHaveCount(5);
  await expect(page.locator(".idea-tile")).toHaveCount(2);

  const before = await page.locator(".idea-tile h2").allTextContents();
  await page.evaluate(() => {
    window.location.hash = "result=stale-share";
  });
  await page.locator(".generate-button").click();
  await expect(page).not.toHaveURL(/#result=/);
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
  await uploadTemplate(page, true);
  await uploadTemplate(page, true);
  await page.locator(".pack-preview-actions button").first().click();

  await expect(page.locator(".pack-origin-badge")).toContainText("临时");
  await expect(
    page.locator(".main-nav button").filter({ hasText: "数据实验室" }),
  ).toHaveCount(0);

  await page.locator(".generate-button").click();
  await expect(
    page.locator(".history-section > .history-strip .history-card"),
  ).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".pack-origin-badge")).toContainText("官方");
  await expect(
    page.locator(".main-nav button").filter({ hasText: "数据实验室" }),
  ).toBeVisible();

  await openPackManager(page);
  await uploadTemplate(page, true);
  await page.locator(".pack-preview-actions .primary-compact").click();
  await expect(page.locator(".pack-origin-badge")).toContainText("本地");
  await expect(
    page.locator(".history-section > .history-strip .history-card"),
  ).toHaveCount(0);
});

test("installed packs, generation, favorites, and deletion survive refresh", async ({
  page,
}) => {
  await page.goto("/?view=generate");
  await openPackManager(page);
  await uploadTemplate(page, true);
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
  await page.goto("/?view=lab");
  await expect(page).toHaveURL(/\?view=generate$/);
  await expect(page.getByText("数据实验室仅支持官方数据集。")).toBeVisible();

  await expect(
    page.locator(".history-section > .history-strip .history-card"),
  ).toHaveCount(1);
  await page
    .locator(".history-section > .history-strip")
    .getByRole("button", { name: /^删除历史：/ })
    .click();
  await expect(page.getByText("历史记录已删除。")).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".history-section > .history-strip .history-card"),
  ).toHaveCount(0);

  await page.locator(".main-nav button").filter({ hasText: "收藏" }).click();
  await expect(page.locator(".favorite-card")).toHaveCount(1);

  await openPackManager(page);
  await page.getByRole("button", { name: /^删除数据包/ }).click();
  await page.getByRole("button", { name: "删除数据包", exact: true }).click();
  await expect(page.locator(".pack-origin-badge")).toContainText("官方");
});

test("loading a recent result synchronizes recipe and clears locks", async ({
  page,
}) => {
  await page.goto("/?view=generate");
  await page.locator("#recipe-select").selectOption("challenge");
  await expect(page.locator(".idea-tile")).toHaveCount(3);
  await page.locator("#recipe-select").selectOption("prototype");
  await expect(page.locator(".idea-tile")).toHaveCount(4);
  await page.locator(".idea-tile").first().hover();
  await page
    .locator(".idea-tile")
    .first()
    .getByRole("button", { name: "锁定" })
    .click();
  await expect(page.locator(".pin-badge")).toHaveCount(1);

  await page
    .locator(".history-section > .history-strip .history-card")
    .filter({ hasText: "开放挑战" })
    .getByRole("button", { name: /开放挑战/ })
    .click();
  await expect(page.locator("#recipe-select")).toHaveValue("challenge");
  await expect(page.locator(".idea-tile")).toHaveCount(3);
  await expect(page.locator(".pin-badge")).toHaveCount(0);
});

test("excluded items can be undone from generator settings", async ({ page }) => {
  await page.goto("/?view=generate");
  await page.locator(".idea-tile").first().hover();
  await page
    .locator(".idea-tile")
    .first()
    .getByRole("button", { name: "排除并重抽" })
    .click();
  await expect(page.getByText("已排除 1 项")).toBeVisible();
  await page.getByRole("button", { name: "撤销最近一次排除" }).click();
  await expect(page.getByText("已排除 0 项")).toBeVisible();
});

test("local data manager clears generated data but keeps the official pack", async ({
  page,
}) => {
  await page.goto("/?view=generate");
  await page.locator(".generate-button").click();
  await page.locator(".idea-toolbar-actions .secondary-button").nth(1).click();
  await page.locator(".main-nav button").filter({ hasText: "关于" }).click();
  await expect(page.locator(".local-data-panel")).toBeVisible();

  await page.getByRole("button", { name: "清除全部本地生成数据" }).click();
  await page.getByLabel("输入“清除”以确认").fill("清除");
  await page.getByRole("button", { name: "永久清除" }).click();
  await expect(page.getByText("全部本地生成数据已清除。")).toBeVisible();
  await expect(page.locator(".pack-origin-badge")).toContainText("官方");
  await expect(page.locator(".local-data-stats strong")).toHaveText([
    "0",
    "0",
    "0",
    "0",
    "0",
  ]);
});

test("mobile navigation and actions do not overflow", async ({ page }) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/?view=generate");
    if (width <= 767) {
      await expect(page.locator(".brand small")).toBeVisible();
    }
    await expect(page.locator(".main-nav")).toBeVisible();
    const bodyOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(bodyOverflow).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 320, height: 760 });
  await page.locator(".main-nav button").filter({ hasText: "数据包" }).click();
  await expect(page.getByRole("button", { name: "导出当前包" })).toBeVisible();
  const exportBox = await page
    .getByRole("button", { name: "导出当前包" })
    .boundingBox();
  expect(exportBox?.width ?? 0).toBeGreaterThan(80);
});
