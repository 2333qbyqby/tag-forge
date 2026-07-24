import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header, type AppView } from "./components/Header";
import { V2HistoryStrip } from "./components/generator/V2HistoryStrip";
import { V2IdeaBoard } from "./components/generator/V2IdeaBoard";
import { V2SettingsPanel } from "./components/generator/V2SettingsPanel";
import { compiledData, DATA_VERSION, prompts } from "./data";
import { createRandomSeed, createSeededRng } from "./engine/rng";
import type { GeneratorMode } from "./engine/types";
import {
  generateChallenge,
  isValidBasePair,
  rerollChallengeBase,
  rerollChallengePrompt,
  rerollChallengeSlot,
  rerollSingleSlot,
  toHistoryEntry,
} from "./engine/v2";
import {
  isV2Idea,
  type GeneratedIdeaV2,
  type GeneratorConfigV2,
  type IdeaHistoryEntryV2,
  type LegacySavedIdea,
  type SavedIdea,
  type StoredHistoryEntry,
} from "./engine/v2-types";
import {
  loadConfigV2,
  loadFavoritesV2,
  loadHistoryV2,
  loadTheme,
  saveConfigV2,
  saveFavoritesV2,
  saveHistoryV2,
  saveTheme,
} from "./storage/local";
import {
  copySavedIdeaText,
  makeShareUrl,
  parseSharedIdeaPayload,
} from "./utils/share";
import AboutView from "./views/AboutView";
import ExploreView from "./views/ExploreView";
import FavoritesView from "./views/FavoritesView";
import LibraryView from "./views/LibraryView";

const DEFAULT_CONFIG: GeneratorConfigV2 = {
  mode: "challenge",
  selectedKinds: ["gameplay", "any"],
  locked: { left: false, right: false, prompt: false },
  excludedTagIds: [],
  excludedPromptIds: [],
  avoidRecent: true,
  seed: "first-spark-v2",
};

function currentView(): AppView {
  const view = new URLSearchParams(window.location.search).get("view");
  if (["generate", "explore", "library", "favorites", "about"].includes(view ?? "")) {
    return view as AppView;
  }
  return "generate";
}

function toEngineHistory(history: StoredHistoryEntry[]): IdeaHistoryEntryV2[] {
  return history.map((entry) => {
    if (entry.schemaVersion === 2) return entry;
    const eligible = entry.tagIds.filter((id) => {
      const tag = compiledData.tagById.get(id);
      return tag?.generationEligible && !tag.deprecatedBy;
    });
    return {
      id: `migrated:${entry.id}`,
      schemaVersion: 2,
      mode: "single",
      baseTagIds: eligible.slice(0, 2),
      legacyTagIds: entry.tagIds,
      createdAt: entry.createdAt,
    };
  });
}

function buildLegacySharedIdea(
  mode: GeneratorMode,
  seed: string,
  tagIds: string[],
): LegacySavedIdea {
  return {
    id: `legacy:${seed}:${tagIds.join("|")}`,
    schemaVersion: 1,
    seed,
    mode,
    tagIds,
    createdAt: Date.now(),
  };
}

function buildSharedIdea(): SavedIdea | null {
  const payload = parseSharedIdeaPayload();
  if (!payload) return null;
  if (payload.engine === 1) {
    return buildLegacySharedIdea(payload.mode, payload.seed, payload.tagIds);
  }
  const validBase = payload.baseTagIds.filter(
    (id): id is string =>
      typeof id === "string" && compiledData.tagById.has(id),
  );
  const firstBase = validBase[0];
  if (!firstBase) return null;
  return {
    id: `shared-v2:${payload.seed}:${validBase.join("|")}:${payload.promptId ?? ""}`,
    schemaVersion: 2,
    mode: payload.mode,
    seed: payload.seed,
    baseTagIds: [firstBase, validBase[1]],
    promptId: payload.promptId,
    createdAt: Date.now(),
  };
}

function makeSingleIdea(seed: string, ids: string[]): GeneratedIdeaV2 {
  return {
    id: `v2:${seed}:${ids.join("|")}`,
    schemaVersion: 2,
    mode: "single",
    seed,
    baseTagIds: [ids[0] ?? "", ids[1]],
    createdAt: Date.now(),
  };
}

export default function App() {
  const initialRef = useRef<{
    config: GeneratorConfigV2;
    history: StoredHistoryEntry[];
    idea: SavedIdea;
  } | null>(null);

  if (!initialRef.current) {
    const history = loadHistoryV2();
    const storedConfig = loadConfigV2(DEFAULT_CONFIG);
    const shared = buildSharedIdea();
    const activeConfig =
      shared && isV2Idea(shared)
        ? { ...storedConfig, mode: shared.mode, seed: shared.seed }
        : storedConfig;
    const migratedEligibleIds = activeConfig.migratedBaseTagIds
      ?.filter((id): id is string => {
        if (!id) return false;
        const tag = compiledData.tagById.get(id);
        return Boolean(tag?.generationEligible && !tag.deprecatedBy);
      })
      .slice(0, 2);
    const migratedFirst = migratedEligibleIds?.[0];
    const migratedSecond = migratedEligibleIds?.[1];
    const migratedPairIsValid =
      migratedFirst &&
      migratedSecond &&
      isValidBasePair(
        compiledData.tagById.get(migratedFirst)!,
        compiledData.tagById.get(migratedSecond)!,
        compiledData,
      ) &&
      [migratedFirst, migratedSecond].some((id) => {
        const kind = compiledData.tagById.get(id)?.kind;
        return kind === "genre" || kind === "mechanic";
      });
    const migratedBaseTagIds = migratedFirst
      ? migratedPairIsValid
        ? [migratedFirst, migratedSecond]
        : [migratedFirst]
      : undefined;
    const consumedConfig: GeneratorConfigV2 = {
      ...activeConfig,
      locked: migratedBaseTagIds?.length
        ? {
            ...activeConfig.locked,
            left: true,
            right: migratedBaseTagIds.length > 1,
          }
        : activeConfig.locked,
      migratedBaseTagIds: undefined,
    };
    let idea: SavedIdea;
    if (shared) {
      idea = shared;
    } else if (consumedConfig.mode === "challenge") {
      const migratedIdea = migratedBaseTagIds?.[0]
        ? ({
            ...makeSingleIdea(consumedConfig.seed, migratedBaseTagIds),
            mode: "challenge" as const,
          } satisfies GeneratedIdeaV2)
        : undefined;
      idea = generateChallenge(
        consumedConfig,
        compiledData,
        prompts,
        toEngineHistory(history),
        createSeededRng(consumedConfig.seed),
        migratedIdea,
      );
    } else if (migratedBaseTagIds?.[0]) {
      idea = makeSingleIdea(consumedConfig.seed, migratedBaseTagIds);
    } else {
      idea = rerollSingleSlot(
        0,
        consumedConfig,
        compiledData,
        toEngineHistory(history),
        createSeededRng(consumedConfig.seed),
      );
    }
    initialRef.current = { config: consumedConfig, history, idea };
  }

  const [view, setView] = useState<AppView>(currentView);
  const [config, setConfig] = useState(initialRef.current.config);
  const [history, setHistory] = useState(initialRef.current.history);
  const [idea, setIdea] = useState<SavedIdea>(initialRef.current.idea);
  const [favorites, setFavorites] = useState<SavedIdea[]>(loadFavoritesV2);
  const [theme, setTheme] = useState<"dark" | "light">(loadTheme);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);
  useEffect(() => saveConfigV2(config), [config]);
  useEffect(() => saveHistoryV2(history), [history]);
  useEffect(() => saveFavoritesV2(favorites), [favorites]);

  const engineHistory = useMemo(() => toEngineHistory(history), [history]);

  const updateView = useCallback((next: AppView) => {
    setView(next);
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("view", next);
    window.history.replaceState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const recordIdea = useCallback((next: GeneratedIdeaV2) => {
    setIdea(next);
    setHistory((current) =>
      [toHistoryEntry(next, prompts), ...current].slice(0, 100),
    );
  }, []);

  const forge = useCallback(() => {
    const seed = createRandomSeed();
    const nextConfig = { ...config, seed };
    let next: GeneratedIdeaV2;
    if (nextConfig.mode === "challenge") {
      next = generateChallenge(
        nextConfig,
        compiledData,
        prompts,
        engineHistory,
        createSeededRng(seed),
        isV2Idea(idea) && idea.mode === "challenge" ? idea : undefined,
      );
    } else {
      const current = isV2Idea(idea) && idea.mode === "single" ? idea : undefined;
      let working =
        current ??
        rerollSingleSlot(
          0,
          nextConfig,
          compiledData,
          engineHistory,
          createSeededRng(seed).fork("initial"),
        );
      if (!nextConfig.locked.left) {
        working = rerollSingleSlot(
          0,
          nextConfig,
          compiledData,
          engineHistory,
          createSeededRng(seed).fork("left"),
          working,
        );
      }
      if (!nextConfig.locked.right) {
        working = rerollSingleSlot(
          1,
          nextConfig,
          compiledData,
          engineHistory,
          createSeededRng(seed).fork("right"),
          working,
        );
      }
      next = working;
    }
    setConfig(nextConfig);
    recordIdea(next);
  }, [config, engineHistory, idea, recordIdea]);

  const changeConfig = useCallback(
    (next: GeneratorConfigV2) => {
      if (next.mode === config.mode) {
        setConfig(next);
        return;
      }
      const seed = createRandomSeed();
      const reset = {
        ...next,
        seed,
        locked: { left: false, right: false, prompt: false },
      };
      const generated =
        reset.mode === "challenge"
          ? generateChallenge(
              reset,
              compiledData,
              prompts,
              engineHistory,
              createSeededRng(seed),
            )
          : rerollSingleSlot(
              0,
              reset,
              compiledData,
              engineHistory,
              createSeededRng(seed),
            );
      setConfig(reset);
      recordIdea(generated);
    },
    [config.mode, engineHistory, recordIdea],
  );

  const rerollSlot = useCallback(
    (slot: 0 | 1) => {
      if (config.locked[slot === 0 ? "left" : "right"]) return;
      const seed = createRandomSeed();
      const nextConfig = { ...config, seed };
      const current = isV2Idea(idea) ? idea : undefined;
      const next =
        current?.mode === "challenge"
          ? rerollChallengeSlot(
              slot,
              nextConfig,
              compiledData,
              engineHistory,
              createSeededRng(seed),
              current,
            )
          : rerollSingleSlot(
              slot,
              nextConfig,
              compiledData,
              engineHistory,
              createSeededRng(seed),
              current,
            );
      setConfig(nextConfig);
      recordIdea(next);
    },
    [config, engineHistory, idea, recordIdea],
  );

  const rerollBase = useCallback(() => {
    if (!isV2Idea(idea) || idea.mode !== "challenge") return;
    const seed = createRandomSeed();
    const nextConfig = { ...config, seed };
    const next = rerollChallengeBase(
      nextConfig,
      compiledData,
      engineHistory,
      createSeededRng(seed),
      idea,
    );
    setConfig(nextConfig);
    recordIdea(next);
  }, [config, engineHistory, idea, recordIdea]);

  const rerollPrompt = useCallback(() => {
    if (
      !isV2Idea(idea) ||
      idea.mode !== "challenge" ||
      config.locked.prompt
    ) {
      return;
    }
    const seed = createRandomSeed();
    const nextConfig = { ...config, seed };
    const next = rerollChallengePrompt(
      nextConfig,
      prompts,
      engineHistory,
      createSeededRng(seed),
      idea,
    );
    setConfig(nextConfig);
    recordIdea(next);
  }, [config, engineHistory, idea, recordIdea]);

  const toggleLock = useCallback((part: "left" | "right" | "prompt") => {
    setConfig((current) => ({
      ...current,
      locked: { ...current.locked, [part]: !current.locked[part] },
    }));
  }, []);

  const excludeTag = useCallback(
    (slot: 0 | 1, tagId: string) => {
      if (config.locked[slot === 0 ? "left" : "right"]) return;
      const seed = createRandomSeed();
      const nextConfig = {
        ...config,
        seed,
        excludedTagIds: [...new Set([...config.excludedTagIds, tagId])],
      };
      const current = isV2Idea(idea) ? idea : undefined;
      const next =
        current?.mode === "challenge"
          ? rerollChallengeSlot(
              slot,
              nextConfig,
              compiledData,
              engineHistory,
              createSeededRng(seed),
              current,
            )
          : rerollSingleSlot(
              slot,
              nextConfig,
              compiledData,
              engineHistory,
              createSeededRng(seed),
              current,
            );
      setConfig(nextConfig);
      recordIdea(next);
    },
    [config, engineHistory, idea, recordIdea],
  );

  const excludePrompt = useCallback(
    (promptId: string) => {
      if (
        config.locked.prompt ||
        !isV2Idea(idea) ||
        idea.mode !== "challenge"
      ) {
        return;
      }
      const seed = createRandomSeed();
      const nextConfig = {
        ...config,
        seed,
        excludedPromptIds: [
          ...new Set([...config.excludedPromptIds, promptId]),
        ],
      };
      const next = rerollChallengePrompt(
        nextConfig,
        prompts,
        engineHistory,
        createSeededRng(seed),
        idea,
      );
      setConfig(nextConfig);
      recordIdea(next);
    },
    [config, engineHistory, idea, recordIdea],
  );

  const isFavorite = favorites.some((favorite) => favorite.id === idea.id);
  const toggleFavorite = useCallback(() => {
    setFavorites((current) =>
      current.some((favorite) => favorite.id === idea.id)
        ? current.filter((favorite) => favorite.id !== idea.id)
        : [idea, ...current],
    );
  }, [idea]);

  const labelsFor = useCallback((target: SavedIdea) => {
    if (!isV2Idea(target)) {
      return target.tagIds.map((id) => ({
        kind: compiledData.tagById.get(id)?.kind ?? "旧标签",
        value: compiledData.tagById.get(id)?.labels.zh ?? id,
      }));
    }
    const labels = target.baseTagIds
      .filter((id): id is string => Boolean(id))
      .map((id, index) => ({
        kind: `方向 ${index === 0 ? "A" : "B"}`,
        value: compiledData.tagById.get(id)?.labels.zh ?? id,
      }));
    const prompt = prompts.find((item) => item.id === target.promptId);
    if (prompt) {
      labels.push({ kind: "开放命题", value: prompt.labels.zh });
    } else if (target.promptId) {
      labels.push({ kind: "开放命题（旧数据）", value: target.promptId });
    }
    return labels;
  }, []);

  const copyIdea = useCallback(
    async (target: SavedIdea = idea) => {
      await copySavedIdeaText(target, labelsFor(target));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    },
    [idea, labelsFor],
  );

  const shareIdea = useCallback(async () => {
    await navigator.clipboard.writeText(makeShareUrl(idea));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [idea]);

  const extractLegacy = useCallback(
    (target: SavedIdea = idea) => {
      if (isV2Idea(target)) return;
      const ids = target.tagIds
        .filter((id) => {
          const tag = compiledData.tagById.get(id);
          return tag?.generationEligible && !tag.deprecatedBy;
        })
        .slice(0, 2);
      if (ids.length === 0) return;
      const seed = createRandomSeed();
      const next = makeSingleIdea(seed, ids);
      setConfig((current) => ({
        ...current,
        mode: "single",
        seed,
        locked: {
          left: true,
          right: ids.length > 1,
          prompt: false,
        },
      }));
      recordIdea(next);
      updateView("generate");
    },
    [idea, recordIdea, updateView],
  );

  const useTag = useCallback(
    (tagId: string) => {
      const tag = compiledData.tagById.get(tagId);
      if (!tag?.generationEligible || tag.deprecatedBy) return;
      const seed = createRandomSeed();
      const next = makeSingleIdea(seed, [tagId]);
      setConfig((current) => ({
        ...current,
        mode: "single",
        seed,
        locked: { left: true, right: false, prompt: false },
      }));
      recordIdea(next);
      updateView("generate");
    },
    [recordIdea, updateView],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key.toLowerCase() === "g" || event.code === "Space") {
        event.preventDefault();
        forge();
      }
      if (event.key.toLowerCase() === "f") toggleFavorite();
      if (event.key.toLowerCase() === "c") void copyIdea();
      if (event.key === "1") toggleLock("left");
      if (event.key === "2") toggleLock("right");
      if (event.key === "3" && isV2Idea(idea) && idea.mode === "challenge") {
        toggleLock("prompt");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copyIdea, forge, idea, toggleFavorite, toggleLock]);

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
            <V2SettingsPanel config={config} onChange={changeConfig} />
            <V2IdeaBoard
              idea={idea}
              config={config}
              data={compiledData}
              prompts={prompts}
              isFavorite={isFavorite}
              copied={copied}
              onGenerate={forge}
              onRerollSlot={rerollSlot}
              onRerollBase={rerollBase}
              onRerollPrompt={rerollPrompt}
              onToggleLock={toggleLock}
              onExcludeTag={excludeTag}
              onExcludePrompt={excludePrompt}
              onFavorite={toggleFavorite}
              onCopy={() => void copyIdea()}
              onShare={() => void shareIdea()}
              onExtractLegacy={() => extractLegacy()}
            />
          </div>
          <V2HistoryStrip
            history={history}
            data={compiledData}
            prompts={prompts}
          />
        </>
      ) : null}
      {view === "explore" ? <ExploreView onUseTag={useTag} /> : null}
      {view === "library" ? <LibraryView onUseTag={useTag} /> : null}
      {view === "favorites" ? (
        <FavoritesView
          favorites={favorites}
          data={compiledData}
          prompts={prompts}
          onRemove={(id) =>
            setFavorites((current) => current.filter((item) => item.id !== id))
          }
          onLoad={(next) => {
            setIdea(next);
            if (isV2Idea(next)) {
              setConfig((current) => ({
                ...current,
                mode: next.mode,
                seed: next.seed,
                locked: { left: false, right: false, prompt: false },
              }));
            }
            updateView("generate");
          }}
          onCopy={(target) => void copyIdea(target)}
          onExtractLegacy={extractLegacy}
        />
      ) : null}
      {view === "about" ? <AboutView /> : null}

      <footer className="app-footer">
        <span>TagForge · Engine 2 · Data {DATA_VERSION}</span>
        <button onClick={() => updateView("about")}>算法与数据</button>
        <a
          href="https://github.com/2333qbyqby/tag-forge"
          target="_blank"
          rel="noreferrer"
        >
          开源仓库
        </a>
      </footer>
      <span className="sr-only" aria-live="polite">
        {copied ? "已复制到剪贴板" : ""}
      </span>
    </div>
  );
}
