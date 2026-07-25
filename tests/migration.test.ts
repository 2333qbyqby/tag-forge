import "fake-indexeddb/auto";
import { strToU8, zipSync } from "fflate";
import { importPackFile } from "../src/packs/importer";
import { packChecksum } from "../src/packs/canonical";
import type { DataPackV1 } from "../src/packs/types";
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
import { migrateLegacyStorage } from "../src/storage/legacy-migration";
import { makeShareUrl, parseSharedResult } from "../src/utils/share";
import { officialTestPack } from "./fixtures";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const minimalPack: DataPackV1 = {
  manifest: {
    schemaVersion: 1,
    packId: "test-pack",
    version: "1.0.0",
    dataVersion: "1.0.0",
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

describe("data pack import, migration, and sharing", () => {
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

    const invalid: DataPackV1 = {
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

  it("migrates legacy localStorage once and preserves unknown IDs", async () => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
    storage.setItem(
      "tagforge:history:v1",
      JSON.stringify([
        {
          id: "old-result",
          seed: "old-seed",
          tagIds: ["platformer", "unknown-private-id"],
          createdAt: 100,
        },
      ]),
    );
    storage.setItem(
      "tagforge:favorites:v2",
      JSON.stringify([
        {
          id: "old-favorite",
          schemaVersion: 2,
          seed: "favorite-seed",
          baseTagIds: ["platformer"],
          createdAt: 200,
        },
      ]),
    );
    const pack = await officialTestPack();
    await migrateLegacyStorage(pack);
    await migrateLegacyStorage(pack);
    const history = await loadHistory();
    const favorites = await loadFavorites();
    expect(history.filter((item) => item.id.includes("old-result"))).toHaveLength(
      1,
    );
    expect(
      history
        .find((item) => item.id.includes("old-result"))
        ?.slots.some((slot) => slot.itemId === "unknown-private-id"),
    ).toBe(true);
    expect(
      favorites.filter((item) => item.id.includes("old-favorite")),
    ).toHaveLength(1);
    expect(storage.getItem("tagforge:history:v1")).not.toBeNull();
  });

  it("parses old links as read-only snapshots and new links losslessly", async () => {
    const pack = await officialTestPack();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          href: "https://example.test/tag-forge/?view=generate",
          hash: "",
          search: "?engine=1&seed=legacy&tags=platformer,unknown-id",
        },
      },
    });
    const legacy = parseSharedResult(pack);
    expect(legacy?.readOnly).toBe(true);
    expect(legacy?.slots.map((slot) => slot.itemId)).toContain("unknown-id");

    const current = {
      ...legacy!,
      id: "new-result",
      recipeId: "collision",
      readOnly: false,
    };
    const url = new URL(makeShareUrl(current));
    window.location.hash = url.hash;
    window.location.search = url.search;
    expect(parseSharedResult(pack)).toEqual(current);
  });

  it("ignores an uploaded pack's official analysis claim", async () => {
    const spoofed: DataPackV1 = {
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
      schemaVersion: 1 as const,
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
        version: "1.0.0",
        checksum: "checksum-a",
      },
    };
    const second = {
      ...base,
      id: "history:checksum-b",
      pack: {
        packId: "same-pack",
        version: "1.0.0",
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
    expect(backup.schemaVersion).toBe(1);
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
