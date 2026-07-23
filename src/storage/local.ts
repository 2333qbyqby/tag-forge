import type {
  GeneratedIdea,
  GeneratorConfig,
  IdeaHistoryEntry,
} from "../engine/types";

const HISTORY_KEY = "tagforge:history:v1";
const FAVORITES_KEY = "tagforge:favorites:v1";
const CONFIG_KEY = "tagforge:config:v1";
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

export function loadTheme(): "dark" | "light" {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function saveTheme(theme: "dark" | "light"): void {
  localStorage.setItem(THEME_KEY, theme);
}

