import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header, type AppView } from "./components/Header";
import { HistoryStrip } from "./components/generator/HistoryStrip";
import { IdeaBoard } from "./components/generator/IdeaBoard";
import { MetricsPanel } from "./components/generator/MetricsPanel";
import { SettingsPanel } from "./components/generator/SettingsPanel";
import { compiledData } from "./data";
import { generateIdea, rerollIdeaSlot } from "./engine/generate";
import { createRandomSeed, createSeededRng } from "./engine/rng";
import { scoreCandidate } from "./engine/score-candidate";
import { TEMPLATES } from "./engine/templates";
import type {
  GeneratedIdea,
  GeneratorConfig,
  GeneratorMode,
  IdeaHistoryEntry,
  TagKind,
} from "./engine/types";
import {
  loadConfig,
  loadFavorites,
  loadHistory,
  loadTheme,
  saveConfig,
  saveFavorites,
  saveHistory,
  saveTheme,
} from "./storage/local";
import { KIND_LABELS } from "./utils/format";
import {
  copyIdeaText,
  makeShareUrl,
  parseSharedIdea,
} from "./utils/share";
import AboutView from "./views/AboutView";
import ExploreView from "./views/ExploreView";
import FavoritesView from "./views/FavoritesView";
import LibraryView from "./views/LibraryView";

const DEFAULT_CONFIG: GeneratorConfig = {
  mode: "jam",
  surprise: 0.46,
  targetScope: 0.28,
  seed: "first-spark",
  pinnedBySlot: {},
  excludedTagIds: [],
  avoidRecent: true,
};

function historyEntry(idea: GeneratedIdea): IdeaHistoryEntry {
  return { id: idea.id, tagIds: idea.tagIds, createdAt: idea.createdAt };
}

function buildSharedIdea(
  mode: GeneratorMode,
  seed: string,
  tagIds: string[],
  config: GeneratorConfig,
  history: IdeaHistoryEntry[],
): GeneratedIdea | null {
  const template = TEMPLATES[mode];
  const unused = [...tagIds];
  const slots: Record<string, string> = {};
  for (const slot of template.slots) {
    const index = unused.findIndex(
      (id) => compiledData.tagById.get(id)?.kind === slot.kind,
    );
    if (index < 0) return null;
    slots[slot.id] = unused.splice(index, 1)[0];
  }
  const candidate = { slots, tagIds: template.slots.map((slot) => slots[slot.id]) };
  const scored = scoreCandidate(
    candidate,
    { ...config, mode, seed },
    compiledData,
    history,
  );
  return {
    ...candidate,
    id: `shared:${seed}:${candidate.tagIds.join("|")}`,
    seed,
    mode,
    metrics: scored.metrics,
    signals: scored.signals,
    createdAt: Date.now(),
  };
}

function currentView(): AppView {
  const view = new URLSearchParams(window.location.search).get("view");
  if (["generate", "explore", "library", "favorites", "about"].includes(view ?? "")) {
    return view as AppView;
  }
  return "generate";
}

export default function App() {
  const initialRef = useRef<{
    config: GeneratorConfig;
    history: IdeaHistoryEntry[];
    idea: GeneratedIdea;
  } | null>(null);

  if (!initialRef.current) {
    const storedConfig = loadConfig(DEFAULT_CONFIG);
    const storedHistory = loadHistory();
    const shared = parseSharedIdea();
    const sharedIdea = shared
      ? buildSharedIdea(
          shared.mode,
          shared.seed,
          shared.tagIds,
          storedConfig,
          storedHistory,
        )
      : null;
    const activeConfig = shared
      ? { ...storedConfig, mode: shared.mode, seed: shared.seed }
      : storedConfig;
    const idea =
      sharedIdea ??
      generateIdea(
        activeConfig,
        compiledData,
        storedHistory,
        createSeededRng(activeConfig.seed),
      );
    initialRef.current = { config: activeConfig, history: storedHistory, idea };
  }

  const [view, setView] = useState<AppView>(currentView);
  const [config, setConfig] = useState(initialRef.current.config);
  const [history, setHistory] = useState(initialRef.current.history);
  const [idea, setIdea] = useState(initialRef.current.idea);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [theme, setTheme] = useState<"dark" | "light">(loadTheme);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => saveConfig(config), [config]);
  useEffect(() => saveHistory(history), [history]);
  useEffect(() => saveFavorites(favorites), [favorites]);

  const updateView = useCallback((next: AppView) => {
    setView(next);
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("view", next);
    window.history.replaceState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const recordIdea = useCallback((next: GeneratedIdea) => {
    setIdea(next);
    setHistory((current) => [historyEntry(next), ...current].slice(0, 100));
  }, []);

  const forge = useCallback(
    (overrides: Partial<GeneratorConfig> = {}) => {
      const nextSeed = overrides.seed ?? createRandomSeed();
      const nextConfig = { ...config, ...overrides, seed: nextSeed };
      const next = generateIdea(
        nextConfig,
        compiledData,
        history,
        createSeededRng(nextSeed),
      );
      setConfig(nextConfig);
      recordIdea(next);
    },
    [config, history, recordIdea],
  );

  const changeConfig = useCallback(
    (next: GeneratorConfig) => {
      if (next.mode !== config.mode) {
        const reset = {
          ...next,
          seed: createRandomSeed(),
          pinnedBySlot: {},
        };
        setConfig(reset);
        recordIdea(
          generateIdea(reset, compiledData, history, createSeededRng(reset.seed)),
        );
        return;
      }
      setConfig(next);
    },
    [config.mode, history, recordIdea],
  );

  const rerollSlot = useCallback(
    (slotId: string) => {
      if (config.pinnedBySlot[slotId]) return;
      const seed = createRandomSeed();
      const next = rerollIdeaSlot(
        idea,
        slotId,
        { ...config, seed },
        compiledData,
        history,
        createSeededRng(`${seed}:${slotId}`),
      );
      setConfig((current) => ({ ...current, seed }));
      recordIdea(next);
    },
    [config, history, idea, recordIdea],
  );

  const togglePin = useCallback((slotId: string, tagId: string) => {
    setConfig((current) => {
      const pinnedBySlot = { ...current.pinnedBySlot };
      if (pinnedBySlot[slotId] === tagId) delete pinnedBySlot[slotId];
      else pinnedBySlot[slotId] = tagId;
      return { ...current, pinnedBySlot };
    });
  }, []);

  const exclude = useCallback(
    (slotId: string, tagId: string) => {
      const nextConfig = {
        ...config,
        seed: createRandomSeed(),
        excludedTagIds: [...new Set([...config.excludedTagIds, tagId])],
      };
      setConfig(nextConfig);
      const next = rerollIdeaSlot(
        idea,
        slotId,
        nextConfig,
        compiledData,
        history,
        createSeededRng(`${nextConfig.seed}:exclude:${slotId}`),
      );
      recordIdea(next);
    },
    [config, history, idea, recordIdea],
  );

  const isFavorite = favorites.some((favorite) => favorite.id === idea.id);
  const toggleFavorite = useCallback(() => {
    setFavorites((current) =>
      current.some((favorite) => favorite.id === idea.id)
        ? current.filter((favorite) => favorite.id !== idea.id)
        : [idea, ...current],
    );
  }, [idea]);

  const ideaLabels = useMemo(() => {
    const template = TEMPLATES[idea.mode];
    return template.slots.map((slot) => ({
      kind: KIND_LABELS[slot.kind],
      value: compiledData.tagById.get(idea.slots[slot.id])?.labels.zh ?? "",
    }));
  }, [idea]);

  const copyIdea = useCallback(
    async (target = idea) => {
      const template = TEMPLATES[target.mode];
      await copyIdeaText(
        target,
        template.slots.map((slot) => ({
          kind: KIND_LABELS[slot.kind],
          value: compiledData.tagById.get(target.slots[slot.id])?.labels.zh ?? "",
        })),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    },
    [idea],
  );

  const shareIdea = useCallback(async () => {
    await navigator.clipboard.writeText(makeShareUrl(idea));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [idea]);

  const useTag = useCallback(
    (tagId: string) => {
      const tag = compiledData.tagById.get(tagId);
      if (!tag) return;
      const preferredModeByKind: Partial<Record<TagKind, GeneratorMode>> = {
        jamPrompt: "jam",
        setting: "jam",
        mood: "jam",
        goal: "prototype",
        presentation: "wild",
        perspective: "wild",
      };
      const mode = preferredModeByKind[tag.kind] ?? "quick";
      const template = TEMPLATES[mode];
      const targetSlot = template.slots.find((slot) => slot.kind === tag.kind);
      if (!targetSlot) return;
      const nextConfig: GeneratorConfig = {
        ...config,
        mode,
        seed: createRandomSeed(),
        pinnedBySlot: { [targetSlot.id]: tag.id },
      };
      const next = generateIdea(
        nextConfig,
        compiledData,
        history,
        createSeededRng(nextConfig.seed),
      );
      setConfig(nextConfig);
      recordIdea(next);
      updateView("generate");
    },
    [config, history, recordIdea, updateView],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key.toLowerCase() === "g" || event.code === "Space") {
        event.preventDefault();
        forge();
      }
      if (event.key.toLowerCase() === "r") forge();
      if (event.key.toLowerCase() === "f") toggleFavorite();
      if (event.key.toLowerCase() === "c") void copyIdea();
      const slotIndex = Number(event.key) - 1;
      const slot = TEMPLATES[idea.mode].slots[slotIndex];
      if (slot) togglePin(slot.id, idea.slots[slot.id]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copyIdea, forge, idea, toggleFavorite, togglePin]);

  return (
    <div className="app">
      <Header
        view={view}
        theme={theme}
        favoriteCount={favorites.length}
        onViewChange={updateView}
        onThemeToggle={() =>
          setTheme((current) => (current === "dark" ? "light" : "dark"))
        }
      />

      {view === "generate" ? (
        <>
          <div className="workbench">
            <SettingsPanel config={config} onChange={changeConfig} />
            <IdeaBoard
              idea={idea}
              config={config}
              isFavorite={isFavorite}
              copied={copied}
              onGenerate={() => forge()}
              onRerollSlot={rerollSlot}
              onTogglePin={togglePin}
              onExclude={exclude}
              onFavorite={toggleFavorite}
              onCopy={() => void copyIdea()}
              onShare={() => void shareIdea()}
            />
            <MetricsPanel idea={idea} />
          </div>
          <HistoryStrip history={history} />
        </>
      ) : null}
      {view === "explore" ? <ExploreView onUseTag={useTag} /> : null}
      {view === "library" ? <LibraryView onUseTag={useTag} /> : null}
      {view === "favorites" ? (
        <FavoritesView
          favorites={favorites}
          onRemove={(id) =>
            setFavorites((current) => current.filter((item) => item.id !== id))
          }
          onLoad={(next) => {
            setIdea(next);
            setConfig((current) => ({
              ...current,
              mode: next.mode,
              seed: next.seed,
              pinnedBySlot: {},
            }));
            updateView("generate");
          }}
          onCopy={(target) => void copyIdea(target)}
        />
      ) : null}
      {view === "about" ? <AboutView /> : null}

      <footer className="app-footer">
        <span>TagForge · Engine 1 · Data 2026.07</span>
        <button onClick={() => updateView("about")}>算法与数据</button>
        <a href="https://github.com/2333qbyqby/tag-forge" target="_blank" rel="noreferrer">
          开源仓库
        </a>
      </footer>
      <span className="sr-only" aria-live="polite">
        {copied ? "已复制到剪贴板" : ""}
      </span>
    </div>
  );
}

