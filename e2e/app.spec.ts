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
    "432",
  );
  await expect(page.locator(".graph-node").first()).toBeVisible();
});

test("metadata badge and history delete icon stay aligned", async ({ page }) => {
  await page.goto("/?view=generate");

  const badgeOverflow = await page.locator(".data-version-badge").evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  expect(badgeOverflow).toBeLessThanOrEqual(0);

  await page.locator(".generate-button").click();
  const deleteButton = page.locator(".history-delete").first();
  const deleteIcon = deleteButton.locator("svg");
  await expect(deleteButton).toBeVisible();

  const buttonBox = await deleteButton.boundingBox();
  const iconBox = await deleteIcon.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(iconBox).not.toBeNull();
  expect(buttonBox?.width).toBe(30);
  expect(buttonBox?.height).toBe(30);
  expect(
    Math.abs(
      (iconBox?.x ?? 0) +
        (iconBox?.width ?? 0) / 2 -
        ((buttonBox?.x ?? 0) + (buttonBox?.width ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(
      (iconBox?.y ?? 0) +
        (iconBox?.height ?? 0) / 2 -
        ((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(0.5);
});

test("library filters groups and explains motif provenance", async ({ page }) => {
  await page.goto("/?view=library");
  await page.getByRole("button", { name: "意象元素", exact: true }).click();
  await expect(page.locator(".tag-library-card").first()).toBeVisible();
  await page.locator(".source-detail-button").first().click();
  await expect(page.getByRole("dialog")).toContainText("MOTIF PROVENANCE");
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "官方页面" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭来源详情" }).click();

  await openPackManager(page);
  const external = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  external.categories[1].group = "motif";
  delete external.manifest.files.provenance;
  delete external.provenance;
  await page.locator('input[type="file"]').setInputFiles({
    name: "motif-without-provenance.tagforge.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(external)),
  });
  await expect(page.locator(".import-preview")).toContainText("VALID PACK");
  await page.locator(".pack-preview-actions button").first().click();
  await page.locator(".main-nav button").filter({ hasText: "词库" }).click();
  await page.getByRole("button", { name: "意象元素", exact: true }).click();
  await page.locator(".source-detail-button").first().click();
  await expect(page.getByRole("dialog")).toContainText("该词条未附来源证据");
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
  await expect(page.locator(".idea-tile")).toHaveCount(5);
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
    .filter({ hasText: "意象挑战" })
    .getByRole("button", { name: /意象挑战/ })
    .click();
  await expect(page.locator("#recipe-select")).toHaveValue("challenge");
  await expect(page.locator(".idea-tile")).toHaveCount(5);
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
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/?view=generate");
    if (width <= 860) {
      await expect(page.locator(".brand small")).toBeVisible();
    }
    await expect(page.locator(".main-nav")).toBeVisible();
    const bodyOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(bodyOverflow).toBeLessThanOrEqual(1);

    const workbenchBox = await page.locator(".workbench").boundingBox();
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(workbenchBox).not.toBeNull();
    expect(
      Math.abs(
        (workbenchBox?.x ?? 0) * 2 +
          (workbenchBox?.width ?? 0) -
          clientWidth,
      ),
    ).toBeLessThanOrEqual(2);

    if (width <= 860) {
      const navBox = await page.locator(".main-nav").boundingBox();
      const workspaceBox = await page.locator(".idea-workspace").boundingBox();
      expect(navBox).not.toBeNull();
      expect(workspaceBox).not.toBeNull();
      expect(
        Math.abs((navBox?.y ?? 0) + (navBox?.height ?? 0) - 748),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs((workspaceBox?.width ?? 0) - (workbenchBox?.width ?? 0)),
      ).toBeLessThanOrEqual(2);
    }
  }

  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/?view=library");
  const toolbarBox = await page.locator(".library-toolbar").boundingBox();
  const groupFilterBox = await page.locator(".group-filter").boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(groupFilterBox).not.toBeNull();
  expect(groupFilterBox?.width ?? 0).toBeGreaterThan(250);
  expect(groupFilterBox?.x ?? 0).toBeGreaterThan(toolbarBox?.x ?? 0);

  await page.goto("/?view=generate");
  await page.locator(".main-nav button").filter({ hasText: "数据包" }).click();
  await expect(page.getByRole("button", { name: "导出当前包" })).toBeVisible();
  const exportBox = await page
    .getByRole("button", { name: "导出当前包" })
    .boundingBox();
  expect(exportBox?.width ?? 0).toBeGreaterThan(80);
});
