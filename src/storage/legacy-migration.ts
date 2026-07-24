import type {
  CompiledPack,
  ResultSlotSnapshot,
  ResultSnapshotV1,
} from "../packs/types";
import {
  addHistory,
  markMigrationCompleted,
  migrationCompleted,
  setFavorite,
} from "./db";

const MIGRATION_KEY = "local-storage-to-idb-v1";

function parseArray(key: string): Array<Record<string, unknown>> {
  try {
    const value = localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function slotFor(pack: CompiledPack, id: string, index: number): ResultSlotSnapshot {
  const entry = pack.entryById.get(id);
  if (entry) {
    const canonical = entry.deprecatedBy
      ? pack.entryById.get(entry.deprecatedBy) ?? entry
      : entry;
    return {
      slotId: `migrated-${index + 1}`,
      source: "entries",
      itemId: canonical.id,
      categoryId: canonical.categoryId,
      family: canonical.family,
      labels: canonical.labels,
    };
  }
  const prompt = pack.promptById.get(id);
  if (prompt) {
    const deck = pack.data.promptDecks.find((item) =>
      item.prompts.some((candidate) => candidate.id === id),
    );
    return {
      slotId: `migrated-${index + 1}`,
      source: "promptDeck",
      itemId: id,
      deckId: deck?.id,
      family: prompt.family,
      labels: prompt.labels,
    };
  }
  return {
    slotId: `migrated-${index + 1}`,
    source: "entries",
    itemId: id,
    family: id,
    labels: { zh: id, en: id },
  };
}

function migrateValue(
  pack: CompiledPack,
  value: Record<string, unknown>,
  source: "engine-1" | "engine-2",
): ResultSnapshotV1 | null {
  const ids =
    source === "engine-2"
      ? [
          ...((value.baseTagIds as string[] | undefined) ?? []),
          ...(typeof value.promptId === "string" ? [value.promptId] : []),
        ]
      : ((value.tagIds as string[] | undefined) ?? []);
  if (ids.length === 0) return null;
  const createdAt =
    typeof value.createdAt === "number" ? value.createdAt : Date.now();
  const seed =
    typeof value.seed === "string"
      ? value.seed
      : typeof value.id === "string"
        ? value.id
        : `migrated-${createdAt}`;
  return {
    id: `migrated:${source}:${String(value.id ?? seed)}`,
    schemaVersion: 1,
    pack: pack.ref,
    recipeId: "migrated-result",
    seed,
    slots: ids.filter(Boolean).map((id, index) => slotFor(pack, id, index)),
    createdAt,
    readOnly: true,
    migratedFrom: source,
  };
}

export async function migrateLegacyStorage(pack: CompiledPack): Promise<void> {
  if (await migrationCompleted(MIGRATION_KEY)) return;
  const historyV1 = parseArray("tagforge:history:v1");
  const historyV2 = parseArray("tagforge:history:v2");
  const favoritesV1 = parseArray("tagforge:favorites:v1");
  const favoritesV2 = parseArray("tagforge:favorites:v2");
  const migratedHistory = [
    ...historyV1.map((value) => migrateValue(pack, value, "engine-1")),
    ...historyV2.map((value) =>
      migrateValue(
        pack,
        value,
        value.schemaVersion === 2 ? "engine-2" : "engine-1",
      ),
    ),
  ].filter((value): value is ResultSnapshotV1 => Boolean(value));
  const migratedFavorites = [
    ...favoritesV1.map((value) => migrateValue(pack, value, "engine-1")),
    ...favoritesV2.map((value) =>
      migrateValue(
        pack,
        value,
        value.schemaVersion === 2 ? "engine-2" : "engine-1",
      ),
    ),
  ].filter((value): value is ResultSnapshotV1 => Boolean(value));
  for (const result of migratedHistory) await addHistory(result);
  for (const result of migratedFavorites) await setFavorite(result, true);
  await markMigrationCompleted(MIGRATION_KEY);
}
