import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { compilePack } from "../packs/compile";
import type {
  CompiledPack,
  DataPack,
  GeneratorSettings,
  LoadedPack,
  PackRef,
  ResultSnapshot,
} from "../packs/types";

export interface InstalledPackMeta {
  key: string;
  ref: PackRef;
  name: { zh: string; en: string };
  installedAt: number;
  summary?: {
    entries: number;
    prompts: number;
    recipes: number;
  };
}

interface StoredPackData {
  key: string;
  data: DataPack;
}

interface StoredSetting {
  key: string;
  value: unknown;
}

interface StoredResult {
  id: string;
  packKey: string;
  createdAt: number;
  result: ResultSnapshot;
}

interface TagForgeDb extends DBSchema {
  packs: {
    key: string;
    value: InstalledPackMeta;
  };
  packData: {
    key: string;
    value: StoredPackData;
  };
  settings: {
    key: string;
    value: StoredSetting;
  };
  history: {
    key: string;
    value: StoredResult;
    indexes: {
      "by-pack": string;
      "by-created": number;
      "by-checksum": string;
    };
  };
  favorites: {
    key: string;
    value: StoredResult;
    indexes: {
      "by-pack": string;
      "by-created": number;
      "by-checksum": string;
    };
  };
}

export interface PackDeleteOptions {
  checksum: string;
  deleteHistory: boolean;
}

export interface LocalDataSummary {
  installedPacks: number;
  history: number;
  favorites: number;
  settings: number;
}

export interface LocalBackup {
  exportedAt: string;
  packs: InstalledPackMeta[];
  packData: StoredPackData[];
  settings: StoredSetting[];
  history: StoredResult[];
  favorites: StoredResult[];
}

let databasePromise: Promise<IDBPDatabase<TagForgeDb>> | undefined;
let historyMutationQueue: Promise<unknown> = Promise.resolve();
let favoriteMutationQueue: Promise<unknown> = Promise.resolve();
const settingMutationQueues = new Map<string, Promise<unknown>>();

function enqueueHistoryMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const pending = historyMutationQueue.then(mutation, mutation);
  historyMutationQueue = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

function enqueueFavoriteMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const pending = favoriteMutationQueue.then(mutation, mutation);
  favoriteMutationQueue = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

function enqueueSettingMutation<T>(
  key: string,
  mutation: () => Promise<T>,
): Promise<T> {
  const current = settingMutationQueues.get(key) ?? Promise.resolve();
  const pending = current.then(mutation, mutation);
  const settled = pending.then(
    () => undefined,
    () => undefined,
  );
  settingMutationQueues.set(key, settled);
  return pending.finally(() => {
    if (settingMutationQueues.get(key) === settled) {
      settingMutationQueues.delete(key);
    }
  });
}

function database() {
  databasePromise ??= openDB<TagForgeDb>("tagforge-dev", 1, {
    upgrade(db) {
      db.createObjectStore("packs", { keyPath: "key" });
      db.createObjectStore("packData", { keyPath: "key" });
      db.createObjectStore("settings", { keyPath: "key" });
      const history = db.createObjectStore("history", { keyPath: "id" });
      history.createIndex("by-pack", "packKey");
      history.createIndex("by-created", "createdAt");
      history.createIndex("by-checksum", "result.pack.checksum");
      const favorites = db.createObjectStore("favorites", { keyPath: "id" });
      favorites.createIndex("by-pack", "packKey");
      favorites.createIndex("by-created", "createdAt");
      favorites.createIndex("by-checksum", "result.pack.checksum");
    },
  });
  return databasePromise;
}

export function packStorageKey(ref: Pick<PackRef, "packId">): string {
  return ref.packId;
}

export async function installPack(
  data: DataPack,
  checksum: string,
): Promise<CompiledPack> {
  const ref: PackRef = {
    packId: data.manifest.packId,
    dataVersion: data.manifest.dataVersion,
    checksum,
  };
  const key = packStorageKey(ref);
  const db = await database();
  const transaction = db.transaction(["packs", "packData"], "readwrite");
  await Promise.all([
    transaction.objectStore("packs").put({
      key,
      ref,
      name: data.manifest.name,
      installedAt: Date.now(),
      summary: {
        entries: data.entries.length,
        prompts: data.promptDecks.reduce(
          (count, deck) => count + deck.prompts.length,
          0,
        ),
        recipes: data.recipes.length,
      },
    }),
    transaction.objectStore("packData").put({ key, data }),
    transaction.done,
  ]);
  const loaded: LoadedPack = {
    data,
    ref,
    origin: "installed",
    capabilities: {
      generate: true,
      browse: true,
      history: true,
      export: true,
      analysis: false,
    },
  };
  return compilePack(loaded);
}

export async function listInstalledPacks(): Promise<InstalledPackMeta[]> {
  return (await database()).getAll("packs");
}

export async function loadInstalledPack(key: string): Promise<CompiledPack | null> {
  const db = await database();
  const [meta, stored] = await Promise.all([
    db.get("packs", key),
    db.get("packData", key),
  ]);
  if (!meta || !stored) return null;
  return compilePack({
    data: stored.data,
    ref: meta.ref,
    origin: "installed",
    capabilities: {
      generate: true,
      browse: true,
      history: true,
      export: true,
      analysis: false,
    },
  });
}

export async function deleteInstalledPack(
  key: string,
  options?: PackDeleteOptions,
): Promise<number> {
  const db = await database();
  let deletedHistory = 0;
  if (options?.deleteHistory) {
    deletedHistory = await clearHistoryByChecksum(options.checksum);
  }
  await settingMutationQueues.get(`generator:${key}`);
  const transaction = db.transaction(
    ["packs", "packData", "settings"],
    "readwrite",
  );
  transaction.objectStore("packs").delete(key);
  transaction.objectStore("packData").delete(key);
  transaction.objectStore("settings").delete(`generator:${key}`);
  await transaction.done;
  return deletedHistory;
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await database()).get("settings", key).then((item) => item?.value as T);
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await enqueueSettingMutation(key, async () => {
    await (await database()).put("settings", { key, value });
  });
}

export async function loadGeneratorSettings(
  pack: CompiledPack,
  fallback: GeneratorSettings,
): Promise<GeneratorSettings> {
  return (
    (await getSetting<GeneratorSettings>(
      `generator:${packStorageKey(pack.ref)}`,
    )) ?? fallback
  );
}

export async function saveGeneratorSettings(
  pack: CompiledPack,
  settings: GeneratorSettings,
): Promise<void> {
  await setSetting(`generator:${packStorageKey(pack.ref)}`, settings);
}

export async function deleteGeneratorSettings(key: string): Promise<void> {
  const settingKey = key.startsWith("generator:") ? key : `generator:${key}`;
  await enqueueSettingMutation(settingKey, async () => {
    await (await database()).delete("settings", settingKey);
  });
}

export async function loadHistory(limit = 100): Promise<ResultSnapshot[]> {
  const rows = await (await database()).getAllFromIndex("history", "by-created");
  return rows
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit)
    .map((row) => row.result);
}

export async function addHistory(result: ResultSnapshot): Promise<void> {
  await enqueueHistoryMutation(async () => {
    const db = await database();
    const transaction = db.transaction("history", "readwrite");
    await transaction.store.put({
      id: result.id,
      packKey: packStorageKey(result.pack),
      createdAt: result.createdAt,
      result,
    });
    const all = await transaction.store.index("by-created").getAll();
    const overflow = all
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(100);
    for (const row of overflow) {
      await transaction.store.delete(row.id);
    }
    await transaction.done;
  });
}

export async function deleteHistory(id: string): Promise<number> {
  return enqueueHistoryMutation(async () => {
    const db = await database();
    const existing = await db.get("history", id);
    if (!existing) return 0;
    await db.delete("history", id);
    return 1;
  });
}

export async function clearHistoryByChecksum(
  checksum: string,
): Promise<number> {
  return enqueueHistoryMutation(async () => {
    const db = await database();
    const transaction = db.transaction("history", "readwrite");
    const index = transaction.store.index("by-checksum");
    let cursor = await index.openCursor(checksum);
    let count = 0;
    while (cursor) {
      await cursor.delete();
      count += 1;
      cursor = await cursor.continue();
    }
    await transaction.done;
    return count;
  });
}

export async function clearAllHistory(): Promise<number> {
  return enqueueHistoryMutation(async () => {
    const db = await database();
    const count = await db.count("history");
    await db.clear("history");
    return count;
  });
}

export async function loadFavorites(): Promise<ResultSnapshot[]> {
  const rows = await (await database()).getAllFromIndex(
    "favorites",
    "by-created",
  );
  return rows
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((row) => row.result);
}

export async function setFavorite(
  result: ResultSnapshot,
  favorite: boolean,
): Promise<void> {
  await enqueueFavoriteMutation(async () => {
    const db = await database();
    if (!favorite) {
      await db.delete("favorites", result.id);
      return;
    }
    await db.put("favorites", {
      id: result.id,
      packKey: packStorageKey(result.pack),
      createdAt: result.createdAt,
      result,
    });
  });
}

export async function getLocalDataSummary(): Promise<LocalDataSummary> {
  const db = await database();
  const [installedPacks, history, favorites, settings] = await Promise.all([
    db.count("packs"),
    db.count("history"),
    db.count("favorites"),
    db.count("settings"),
  ]);
  return { installedPacks, history, favorites, settings };
}

export async function exportLocalBackup(): Promise<LocalBackup> {
  const db = await database();
  const [packs, packData, settings, history, favorites] = await Promise.all([
    db.getAll("packs"),
    db.getAll("packData"),
    db.getAll("settings"),
    db.getAll("history"),
    db.getAll("favorites"),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    packs,
    packData,
    settings,
    history,
    favorites,
  };
}

export async function clearAllLocalData(): Promise<void> {
  const db = await database();
  await Promise.all([historyMutationQueue, favoriteMutationQueue]);
  await Promise.all(settingMutationQueues.values());
  const transaction = db.transaction(
    [
      "packs",
      "packData",
      "settings",
      "history",
      "favorites",
    ],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("packs").clear(),
    transaction.objectStore("packData").clear(),
    transaction.objectStore("settings").clear(),
    transaction.objectStore("history").clear(),
    transaction.objectStore("favorites").clear(),
  ]);
  await transaction.done;
}
