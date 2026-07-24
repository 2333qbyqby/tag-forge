import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { compilePack } from "../packs/compile";
import type {
  CompiledPack,
  DataPackV1,
  GeneratorSettings,
  LoadedPack,
  PackRef,
  ResultSnapshotV1,
} from "../packs/types";

export interface InstalledPackMeta {
  key: string;
  ref: PackRef;
  name: { zh: string; en: string };
  installedAt: number;
}

interface StoredPackData {
  key: string;
  data: DataPackV1;
}

interface StoredSetting {
  key: string;
  value: unknown;
}

interface StoredResult {
  id: string;
  packKey: string;
  createdAt: number;
  result: ResultSnapshotV1;
}

interface StoredMigration {
  key: string;
  completedAt: number;
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
    };
  };
  favorites: {
    key: string;
    value: StoredResult;
    indexes: {
      "by-pack": string;
      "by-created": number;
    };
  };
  migrations: {
    key: string;
    value: StoredMigration;
  };
}

let databasePromise: Promise<IDBPDatabase<TagForgeDb>> | undefined;

function database() {
  databasePromise ??= openDB<TagForgeDb>("tagforge-v2", 1, {
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
  return databasePromise;
}

export function packStorageKey(ref: Pick<PackRef, "packId" | "version">): string {
  return `${ref.packId}@${ref.version}`;
}

export async function installPack(
  data: DataPackV1,
  checksum: string,
): Promise<CompiledPack> {
  const ref: PackRef = {
    packId: data.manifest.packId,
    version: data.manifest.version,
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

export async function deleteInstalledPack(key: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction(["packs", "packData"], "readwrite");
  await Promise.all([
    transaction.objectStore("packs").delete(key),
    transaction.objectStore("packData").delete(key),
    transaction.done,
  ]);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await database()).get("settings", key).then((item) => item?.value as T);
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await (await database()).put("settings", { key, value });
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

export async function loadHistory(limit = 100): Promise<ResultSnapshotV1[]> {
  const rows = await (await database()).getAllFromIndex("history", "by-created");
  return rows
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit)
    .map((row) => row.result);
}

export async function addHistory(result: ResultSnapshotV1): Promise<void> {
  const db = await database();
  await db.put("history", {
    id: result.id,
    packKey: packStorageKey(result.pack),
    createdAt: result.createdAt,
    result,
  });
  const all = await db.getAllFromIndex("history", "by-created");
  const overflow = all
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(100);
  const transaction = db.transaction("history", "readwrite");
  for (const row of overflow) {
    await transaction.store.delete(row.id);
  }
  await transaction.done;
}

export async function loadFavorites(): Promise<ResultSnapshotV1[]> {
  const rows = await (await database()).getAllFromIndex(
    "favorites",
    "by-created",
  );
  return rows
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((row) => row.result);
}

export async function setFavorite(
  result: ResultSnapshotV1,
  favorite: boolean,
): Promise<void> {
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
}

export async function migrationCompleted(key: string): Promise<boolean> {
  return Boolean(await (await database()).get("migrations", key));
}

export async function markMigrationCompleted(key: string): Promise<void> {
  await (await database()).put("migrations", { key, completedAt: Date.now() });
}
