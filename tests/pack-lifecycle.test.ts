import "fake-indexeddb/auto";
import { strToU8, zipSync } from "fflate";
import { importPackFile } from "../src/packs/importer";
import { packChecksum } from "../src/packs/canonical";
import type { DataPack } from "../src/packs/types";
import {
  addHistory,
  clearHistoryByChecksum,
  deleteInstalledPack,
  deleteHistory,
  exportLocalBackup,
  installPack,
  loadFavorites,
  loadHistory,
  packStorageKey,
  setFavorite,
} from "../src/storage/db";
import { makeShareUrl, parseSharedResult } from "../src/utils/share";
import { officialTestPack } from "./fixtures";

const minimalPack: DataPack = {
  manifest: {
    packId: "test-pack",
    dataVersion: "2026.07.25",
    name: { zh: "测试包", en: "Test Pack" },
    description: { zh: "测试", en: "Test" },
    defaultLocale: "zh",
    locales: ["zh", "en"],
    files: {
      categories: "categories.csv",
      entries: "entries.csv",
      recipes: "recipes.json",
    },
  },
  categories: [
    {
      id: "idea",
      labels: { zh: "点子", en: "Idea" },
      enabled: true,
    },
  ],
  entries: [
    {
      id: "first",
      labels: { zh: "第一", en: "First" },
      categoryId: "idea",
      aliases: [],
      family: "first",
      facets: [],
      baseWeight: 1,
      rarity: 0.5,
      scopeImpact: 0,
      implementationRisk: 0.5,
      compositeOf: [],
      enabled: true,
    },
    {
      id: "second",
      labels: { zh: "第二", en: "Second" },
      categoryId: "idea",
      aliases: [],
      family: "second",
      facets: [],
      baseWeight: 1,
      rarity: 0.5,
      scopeImpact: 0,
      implementationRisk: 0.5,
      compositeOf: [],
      enabled: true,
    },
  ],
  promptDecks: [],
  recipes: [
    {
      id: "collision",
      labels: { zh: "碰撞", en: "Collision" },
      description: { zh: "两个点子", en: "Two ideas" },
      slots: [
        {
          id: "left",
          labels: { zh: "左", en: "Left" },
          source: "entries",
          categoryIds: ["idea"],
          required: true,
        },
        {
          id: "right",
          labels: { zh: "右", en: "Right" },
          source: "entries",
          categoryIds: ["idea"],
          required: true,
        },
      ],
      cooldown: { entryWindow: 2, familyWindow: 2, pairWindow: 10 },
      riskPolicy: "neutral",
    },
  ],
};

describe("data pack import, storage, and sharing", () => {
  it("normalizes equivalent JSON and ZIP/CSV to one checksum", async () => {
    const json = new File(
      [JSON.stringify(minimalPack)],
      "minimal.tagforge.json",
      { type: "application/json" },
    );
    const zip = new File(
      [
        zipSync({
          "manifest.json": strToU8(JSON.stringify(minimalPack.manifest)),
          "categories.csv": strToU8(
            "id,label_zh,label_en,color,enabled\nidea,点子,Idea,,true\n",
          ),
          "entries.csv": strToU8(
            [
              "id,label_zh,label_en,category_id,aliases,family,facets,base_weight,rarity,scope_impact,implementation_risk,composite_of,deprecated_by,enabled",
              "first,第一,First,idea,,first,,1,0.5,0,0.5,,,true",
              "second,第二,Second,idea,,second,,1,0.5,0,0.5,,,true",
              "",
            ].join("\n"),
          ),
          "recipes.json": strToU8(JSON.stringify(minimalPack.recipes)),
        }),
      ],
      "minimal.zip",
      { type: "application/zip" },
    );
    const [fromJson, fromZip] = await Promise.all([
      importPackFile(json),
      importPackFile(zip),
    ]);
    expect(fromJson.report.valid).toBe(true);
    expect(fromZip.report.valid).toBe(true);
    expect(fromJson.checksum).toBe(fromZip.checksum);
  });

  it("rejects script files and unsafe ZIP paths", async () => {
    const unsafePath = new File(
      [zipSync({ "../entries.csv": strToU8("id\nbad") })],
      "unsafe-path.zip",
      { type: "application/zip" },
    );
    const scriptFile = new File(
      [zipSync({ "payload.js": strToU8("alert(1)") })],
      "script.zip",
      { type: "application/zip" },
    );
    await expect(importPackFile(unsafePath)).rejects.toThrow();
    await expect(importPackFile(scriptFile)).rejects.toThrow();
  });

  it("rejects excessive unpacked content and invalid references", async () => {
    const oversized = new File(
      [
        zipSync({
          "entries.csv": new Uint8Array(25 * 1024 * 1024 + 1),
        }),
      ],
      "oversized.zip",
      { type: "application/zip" },
    );
    await expect(importPackFile(oversized)).rejects.toThrow();

    const invalid: DataPack = {
      ...minimalPack,
      entries: [...minimalPack.entries, { ...minimalPack.entries[0] }],
      recipes: [
        {
          ...minimalPack.recipes[0],
          slots: [
            {
              ...minimalPack.recipes[0].slots[0],
              categoryIds: ["missing-category"],
            },
          ],
        },
      ],
    };
    const imported = await importPackFile(
      new File([JSON.stringify(invalid)], "invalid.tagforge.json"),
    );
    expect(imported.report.valid).toBe(false);
    expect(imported.report.issues.map((issue) => issue.code)).toContain(
      "id.duplicate",
    );
    expect(imported.report.issues.map((issue) => issue.code)).toContain(
      "reference.category",
    );
  });

  it("accepts only the current snapshot link structure", async () => {
    const pack = await officialTestPack();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          href: "https://example.test/tag-forge/?view=generate",
          hash: "",
          search: "?view=generate",
        },
      },
    });
    const current = {
      id: "new-result",
      pack: pack.ref,
      recipeId: "collision",
      seed: "current",
      slots: [],
      createdAt: 100,
    };
    expect(parseSharedResult(pack)).toBeNull();
    const url = new URL(makeShareUrl(current));
    window.location.hash = url.hash;
    window.location.search = url.search;
    expect(parseSharedResult(pack)).toEqual(current);
  });

  it("ignores an uploaded pack's official analysis claim", async () => {
    const spoofed: DataPack = {
      ...minimalPack,
      manifest: { ...minimalPack.manifest, official: true },
    };
    const checksum = await packChecksum(spoofed);
    const installed = await installPack(spoofed, checksum);
    expect(installed.origin).toBe("installed");
    expect(installed.capabilities.analysis).toBe(false);
    await deleteInstalledPack(packStorageKey(installed.ref));
  });

  it("serializes history deletion and clears only an exact checksum", async () => {
    const base = {
      recipeId: "collision",
      seed: "storage-order",
      slots: [],
      createdAt: Date.now(),
    };
    const first = {
      ...base,
      id: "history:checksum-a",
      pack: {
        packId: "same-pack",
        dataVersion: "2026.07.25",
        checksum: "checksum-a",
      },
    };
    const second = {
      ...base,
      id: "history:checksum-b",
      pack: {
        packId: "same-pack",
        dataVersion: "2026.07.25",
        checksum: "checksum-b",
      },
    };
    await Promise.all([addHistory(first), deleteHistory(first.id)]);
    await addHistory(first);
    await addHistory(second);
    await setFavorite(first, true);

    expect(await clearHistoryByChecksum(first.pack.checksum)).toBe(1);
    const stored = await loadHistory();
    expect(stored.some((item) => item.id === first.id)).toBe(false);
    expect(stored.some((item) => item.id === second.id)).toBe(true);
    expect((await loadFavorites()).some((item) => item.id === first.id)).toBe(
      true,
    );

    const backup = await exportLocalBackup();
    expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(
      backup.history.some(
        (item) => item.result.pack.checksum === second.pack.checksum,
      ),
    ).toBe(true);
    expect(
      backup.favorites.some(
        (item) => item.result.pack.checksum === first.pack.checksum,
      ),
    ).toBe(true);

    await deleteHistory(second.id);
    await setFavorite(first, false);
  });
});
