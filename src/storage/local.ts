import type {
  GeneratedIdea,
  GeneratorConfig,
  IdeaHistoryEntry,
} from "../engine/types";
import type {
  GeneratorConfigV2,
  LegacyHistoryEntry,
  SavedIdea,
  StoredHistoryEntry,
} from "../engine/v2-types";

const HISTORY_KEY = "tagforge:history:v1";
const FAVORITES_KEY = "tagforge:favorites:v1";
const CONFIG_KEY = "tagforge:config:v1";
const HISTORY_KEY_V2 = "tagforge:history:v2";
const FAVORITES_KEY_V2 = "tagforge:favorites:v2";
const CONFIG_KEY_V2 = "tagforge:config:v2";
const THEME_KEY = "tagforge:theme:v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private contexts. The app remains usable.
  }
}

export function loadHistory(): IdeaHistoryEntry[] {
  return readJson<IdeaHistoryEntry[]>(HISTORY_KEY, []).slice(0, 100);
}

export function saveHistory(history: IdeaHistoryEntry[]): void {
  writeJson(HISTORY_KEY, history.slice(0, 100));
}

export function loadFavorites(): GeneratedIdea[] {
  return readJson<GeneratedIdea[]>(FAVORITES_KEY, []);
}

export function saveFavorites(favorites: GeneratedIdea[]): void {
  writeJson(FAVORITES_KEY, favorites);
}

export function loadConfig(fallback: GeneratorConfig): GeneratorConfig {
  const stored = readJson<Partial<GeneratorConfig>>(CONFIG_KEY, {});
  return {
    ...fallback,
    ...stored,
    pinnedBySlot: stored.pinnedBySlot ?? fallback.pinnedBySlot,
    excludedTagIds: stored.excludedTagIds ?? fallback.excludedTagIds,
  };
}

export function saveConfig(config: GeneratorConfig): void {
  writeJson(CONFIG_KEY, config);
}

export function loadHistoryV2(): StoredHistoryEntry[] {
  if (localStorage.getItem(HISTORY_KEY_V2) !== null) {
    return readJson<StoredHistoryEntry[]>(HISTORY_KEY_V2, []).slice(0, 100);
  }
  const legacy = readJson<IdeaHistoryEntry[]>(HISTORY_KEY, []).map(
    (entry): LegacyHistoryEntry => ({
      id: entry.id,
      schemaVersion: 1,
      tagIds: entry.tagIds,
      createdAt: entry.createdAt,
    }),
  );
  if (legacy.length > 0) writeJson(HISTORY_KEY_V2, legacy.slice(0, 100));
  return legacy.slice(0, 100);
}

export function saveHistoryV2(history: StoredHistoryEntry[]): void {
  writeJson(HISTORY_KEY_V2, history.slice(0, 100));
}

export function loadFavoritesV2(): SavedIdea[] {
  if (localStorage.getItem(FAVORITES_KEY_V2) !== null) {
    return readJson<SavedIdea[]>(FAVORITES_KEY_V2, []);
  }
  const legacy = readJson<GeneratedIdea[]>(FAVORITES_KEY, []).map((idea) => ({
    ...idea,
    schemaVersion: 1 as const,
  }));
  if (legacy.length > 0) writeJson(FAVORITES_KEY_V2, legacy);
  return legacy;
}

export function saveFavoritesV2(favorites: SavedIdea[]): void {
  writeJson(FAVORITES_KEY_V2, favorites);
}

export function loadConfigV2(fallback: GeneratorConfigV2): GeneratorConfigV2 {
  const stored = readJson<Partial<GeneratorConfigV2>>(CONFIG_KEY_V2, {});
  if (stored.mode === "single" || stored.mode === "challenge") {
    return {
      ...fallback,
      ...stored,
      selectedKinds: stored.selectedKinds ?? fallback.selectedKinds,
      locked: { ...fallback.locked, ...stored.locked },
      excludedTagIds: stored.excludedTagIds ?? fallback.excludedTagIds,
      excludedPromptIds:
        stored.excludedPromptIds ?? fallback.excludedPromptIds,
    };
  }
  const legacy = readJson<Partial<GeneratorConfig>>(CONFIG_KEY, {});
  const pinned = Object.values(legacy.pinnedBySlot ?? {});
  const migrated: GeneratorConfigV2 = {
    ...fallback,
    mode: legacy.mode === "jam" ? "challenge" : "single",
    seed: legacy.seed ?? fallback.seed,
    locked: {
      left: pinned.length > 0,
      right: pinned.length > 1,
      prompt: false,
    },
    excludedTagIds: legacy.excludedTagIds ?? [],
    avoidRecent: legacy.avoidRecent ?? fallback.avoidRecent,
    migratedBaseTagIds:
      pinned.length > 0 ? [pinned[0], pinned[1]] : undefined,
  };
  writeJson(CONFIG_KEY_V2, migrated);
  return migrated;
}

export function saveConfigV2(config: GeneratorConfigV2): void {
  writeJson(CONFIG_KEY_V2, config);
}

export function loadTheme(): "dark" | "light" {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function saveTheme(theme: "dark" | "light"): void {
  localStorage.setItem(THEME_KEY, theme);
}
