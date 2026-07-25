import "fake-indexeddb/auto";
import { openDB } from "idb";

describe("IndexedDB v2 storage", () => {
  it("upgrades v1 rows with checksum indexes without losing snapshots", async () => {
    const snapshot = {
      id: "legacy-v1-row",
      schemaVersion: 1 as const,
      pack: {
        packId: "upgrade-pack",
        version: "1.0.0",
        checksum: "upgrade-checksum",
      },
      recipeId: "collision",
      seed: "upgrade",
      slots: [],
      createdAt: 10,
    };
    const v1 = await openDB("tagforge-v2", 1, {
      upgrade(db) {
        db.createObjectStore("packs", { keyPath: "key" });
        db.createObjectStore("packData", { keyPath: "key" });
        db.createObjectStore("settings", { keyPath: "key" });
        const history = db.createObjectStore("history", { keyPath: "id" });
        history.createIndex("by-pack", "packKey");
        history.createIndex("by-created", "createdAt");
        const favorites = db.createObjectStore("favorites", { keyPath: "id" });
        favorites.createIndex("by-pack", "packKey");
        favorites.createIndex("by-created", "createdAt");
        db.createObjectStore("migrations", { keyPath: "key" });
      },
    });
    await v1.put("history", {
      id: snapshot.id,
      packKey: "upgrade-pack@1.0.0",
      createdAt: snapshot.createdAt,
      result: snapshot,
    });
    await v1.put("favorites", {
      id: snapshot.id,
      packKey: "upgrade-pack@1.0.0",
      createdAt: snapshot.createdAt,
      result: snapshot,
    });
    v1.close();

    const storage = await import("../src/storage/db");
    expect((await storage.loadHistory())[0]).toEqual(snapshot);
    expect((await storage.loadFavorites())[0]).toEqual(snapshot);
    expect(
      await storage.clearHistoryByChecksum(snapshot.pack.checksum),
    ).toBe(1);
    expect(await storage.loadHistory()).toHaveLength(0);
    expect(await storage.loadFavorites()).toHaveLength(1);

    await storage.setFavorite(snapshot, false);
    await storage.clearAllLocalData();
  });
});
