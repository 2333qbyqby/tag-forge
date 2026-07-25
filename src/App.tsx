import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToastRegion, type ToastMessage } from "./components/Feedback";
import { Header, type AppView } from "./components/Header";
import { ViewErrorBoundary } from "./components/ViewErrorBoundary";
import { PackWorkbench } from "./components/generator/PackWorkbench";
import { ResultHistory } from "./components/generator/ResultHistory";
import { defaultGeneratorSettings, generateResult } from "./engine/pack-engine";
import { createRandomSeed } from "./engine/rng";
import { canonicalPackJson } from "./packs/canonical";
import { compilePack } from "./packs/compile";
import type { ImportedPack } from "./packs/importer";
import { loadOfficialPack } from "./packs/official";
import type {
  CompiledPack,
  GeneratorSettings,
  ResultDisplaySource,
  ResultSnapshot,
} from "./packs/types";
import {
  addHistory,
  clearAllHistory,
  clearAllLocalData,
  clearHistoryByChecksum,
  deleteGeneratorSettings,
  deleteHistory,
  deleteInstalledPack,
  exportLocalBackup,
  getLocalDataSummary,
  getSetting,
  installPack,
  listInstalledPacks,
  loadFavorites,
  loadGeneratorSettings,
  loadHistory,
  loadInstalledPack,
  packStorageKey,
  saveGeneratorSettings,
  setFavorite,
  setSetting,
  type InstalledPackMeta,
  type LocalDataSummary,
} from "./storage/db";
import {
  copyResultText,
  makeShareUrl,
  parseSharedResult,
} from "./utils/share";

const LibraryView = lazy(() => import("./views/LibraryView"));
const FavoritesView = lazy(() => import("./views/FavoritesView"));
const PackManagerView = lazy(() => import("./views/PackManagerView"));
const DataLabView = lazy(() => import("./views/DataLabView"));
const AboutView = lazy(() => import("./views/AboutView"));

const EMPTY_SUMMARY: LocalDataSummary = {
  installedPacks: 0,
  history: 0,
  favorites: 0,
  settings: 0,
};

function viewFromUrl(): AppView {
  const value = new URLSearchParams(window.location.search).get("view");
  return ["generate", "library", "favorites", "packs", "lab", "about"].includes(
    value ?? "",
  )
    ? (value as AppView)
    : "generate";
}

function themeFromStorage(): "dark" | "light" {
  const stored = localStorage.getItem("tagforge:theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function snapshotForEntry(
  pack: CompiledPack,
  recipeId: string,
  slotId: string,
  entryId: string,
  seed: string,
): ResultSnapshot {
  const entry = pack.entryById.get(entryId);
  if (!entry) throw new Error(`Unknown entry: ${entryId}`);
  return {
    id: `anchor:${entryId}:${seed}`,
    pack: pack.ref,
    recipeId,
    seed,
    slots: [
      {
        slotId,
        source: "entries",
        itemId: entry.id,
        categoryId: entry.categoryId,
        family: entry.family,
        labels: entry.labels,
      },
    ],
    createdAt: Date.now(),
  };
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadCompiledPack(pack: CompiledPack) {
  downloadJson(
    `${pack.data.manifest.packId}-${pack.data.manifest.dataVersion}.tagforge.json`,
    JSON.parse(canonicalPackJson(pack.data)),
  );
}

export default function App() {
  const [view, setView] = useState<AppView>(viewFromUrl);
  const [officialPack, setOfficialPack] = useState<CompiledPack>();
  const [pack, setPack] = useState<CompiledPack>();
  const [settings, setSettings] = useState<GeneratorSettings>();
  const [result, setResult] = useState<ResultSnapshot>();
  const [resultSource, setResultSource] =
    useState<ResultDisplaySource>("generated");
  const [history, setHistory] = useState<ResultSnapshot[]>([]);
  const [sessionHistory, setSessionHistory] = useState<ResultSnapshot[]>([]);
  const [favorites, setFavorites] = useState<ResultSnapshot[]>([]);
  const [installed, setInstalled] = useState<InstalledPackMeta[]>([]);
  const [localSummary, setLocalSummary] =
    useState<LocalDataSummary>(EMPTY_SUMMARY);
  const [theme, setTheme] = useState<"dark" | "light">(themeFromStorage);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [generatorError, setGeneratorError] = useState("");
  const [error, setError] = useState("");
  const [bootRetry, setBootRetry] = useState(0);
  const [toast, setToast] = useState<ToastMessage>();
  const toastIdRef = useRef(0);
  const activationRequestRef = useRef(0);

  const notify = useCallback(
    (
      text: string,
      options?: Omit<ToastMessage, "id" | "text">,
    ) => {
      toastIdRef.current += 1;
      setToast({ id: toastIdRef.current, text, ...options });
    },
    [],
  );

  const refreshLocalSummary = useCallback(async () => {
    setLocalSummary(await getLocalDataSummary());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError("");
    async function boot() {
      try {
        const official = await loadOfficialPack();
        const [
          installedPacks,
          storedHistory,
          storedFavorites,
          activeKey,
          summary,
        ] = await Promise.all([
          listInstalledPacks(),
          loadHistory(),
          loadFavorites(),
          getSetting<string>("active-pack"),
          getLocalDataSummary(),
        ]);
        const active =
          activeKey && activeKey !== "official"
            ? (await loadInstalledPack(activeKey)) ?? official
            : official;
        const fallback = defaultGeneratorSettings(active);
        let activeSettings = await loadGeneratorSettings(active, fallback);
        if (!active.recipeById.has(activeSettings.recipeId)) {
          activeSettings = fallback;
        }
        const shared = parseSharedResult(official);
        const visibleShared =
          shared && shared.pack.checksum !== active.ref.checksum
            ? { ...shared, readOnly: true }
            : shared;
        if (
          visibleShared &&
          active.recipeById.has(visibleShared.recipeId) &&
          !visibleShared.readOnly
        ) {
          activeSettings = {
            ...activeSettings,
            recipeId: visibleShared.recipeId,
            seed: visibleShared.seed,
            lockedSlotIds: [],
            categoryOverrides: {},
          };
        }
        const activeHistory = storedHistory.filter(
          (item) => item.pack.checksum === active.ref.checksum,
        );
        const initial =
          visibleShared ??
          generateResult(active, activeSettings, activeHistory);
        if (cancelled) return;
        setOfficialPack(official);
        setPack(active);
        setSettings(activeSettings);
        setResult(initial);
        setResultSource(visibleShared ? "shared" : "generated");
        setHistory(storedHistory);
        setSessionHistory([]);
        setFavorites(storedFavorites);
        setInstalled(installedPacks);
        setLocalSummary(summary);
        if (viewFromUrl() === "lab" && !active.capabilities.analysis) {
          const url = new URL(window.location.href);
          url.search = "";
          url.searchParams.set("view", "generate");
          window.history.replaceState({}, "", url);
          setView("generate");
          notify("数据实验室仅支持官方数据集。");
        }
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "TagForge failed to initialize.",
          );
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [bootRetry, notify]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tagforge:theme", theme);
  }, [theme]);

  const activeHistory = useMemo(() => {
    if (!pack) return [];
    const source = pack.origin === "temporary" ? sessionHistory : history;
    return source.filter((item) => item.pack.checksum === pack.ref.checksum);
  }, [history, pack, sessionHistory]);
  const historyCountByChecksum = useMemo(
    () =>
      history.reduce<Record<string, number>>((counts, item) => {
        counts[item.pack.checksum] = (counts[item.pack.checksum] ?? 0) + 1;
        return counts;
      }, {}),
    [history],
  );
  const favoriteCountByChecksum = useMemo(
    () =>
      favorites.reduce<Record<string, number>>((counts, item) => {
        counts[item.pack.checksum] = (counts[item.pack.checksum] ?? 0) + 1;
        return counts;
      }, {}),
    [favorites],
  );

  const updateView = useCallback(
    (next: AppView, replace = false) => {
      if (next === "lab" && pack && !pack.capabilities.analysis) {
        notify("数据实验室仅支持官方数据集。");
        next = "generate";
      }
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("view", next);
      if (replace) {
        window.history.replaceState({}, "", url);
      } else if (next !== view) {
        window.history.pushState({}, "", url);
      }
      setView(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [notify, pack, view],
  );

  useEffect(() => {
    const onPopState = () => {
      const requested = viewFromUrl();
      if (requested === "lab" && pack && !pack.capabilities.analysis) {
        updateView("generate", true);
      } else {
        setView(requested);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [pack, updateView]);

  const clearSharedResultUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.hash) return;
    url.hash = "";
    window.history.replaceState({}, "", url);
  }, []);

  const persistSettings = useCallback(
    (next: GeneratorSettings, dirty = true) => {
      setSettings(next);
      setSettingsDirty(dirty);
      if (pack && pack.origin !== "temporary") {
        void saveGeneratorSettings(pack, next).catch((reason) =>
          notify(
            reason instanceof Error ? reason.message : "生成设置保存失败。",
            { tone: "error" },
          ),
        );
      }
    },
    [notify, pack],
  );

  const record = useCallback(
    (next: ResultSnapshot) => {
      setResult(next);
      setResultSource("generated");
      setSettingsDirty(false);
      setGeneratorError("");
      clearSharedResultUrl();
      if (pack?.origin === "temporary") {
        setSessionHistory((current) =>
          [next, ...current.filter((item) => item.id !== next.id)].slice(0, 100),
        );
        return;
      }
      setHistory((current) =>
        [next, ...current.filter((item) => item.id !== next.id)].slice(0, 100),
      );
      void addHistory(next)
        .then(refreshLocalSummary)
        .catch((reason) => {
          setHistory((current) =>
            current.filter((item) => item.id !== next.id),
          );
          notify(reason instanceof Error ? reason.message : "历史保存失败。", {
            tone: "error",
          });
        });
    },
    [clearSharedResultUrl, notify, pack?.origin, refreshLocalSummary],
  );

  const generate = useCallback(
    (
      nextSettings: GeneratorSettings,
      current?: ResultSnapshot,
      onlySlotId?: string,
    ) => {
      if (!pack) return;
      try {
        const next = generateResult(
          pack,
          nextSettings,
          activeHistory,
          current,
          onlySlotId,
        );
        persistSettings(nextSettings, false);
        record(next);
      } catch (reason) {
        persistSettings(nextSettings, true);
        setGeneratorError(
          reason instanceof Error ? reason.message : "当前设置无法完成生成。",
        );
      }
    },
    [activeHistory, pack, persistSettings, record],
  );

  const forge = useCallback(() => {
    if (!settings) return;
    generate({ ...settings, seed: createRandomSeed() }, result);
  }, [generate, result, settings]);

  const changeSettings = useCallback(
    (next: GeneratorSettings) => {
      if (!settings || !pack) return;
      if (next.recipeId !== settings.recipeId) {
        generate({ ...next, seed: createRandomSeed() });
      } else {
        persistSettings(next, true);
      }
    },
    [generate, pack, persistSettings, settings],
  );

  const activate = useCallback(
    async (
      nextPack: CompiledPack,
      persist: boolean,
      snapshot?: ResultSnapshot,
      source: ResultDisplaySource = "generated",
    ) => {
      const requestId = activationRequestRef.current + 1;
      activationRequestRef.current = requestId;
      const fallback = defaultGeneratorSettings(nextPack);
      let nextSettings =
        nextPack.origin === "temporary"
          ? fallback
          : await loadGeneratorSettings(nextPack, fallback);
      if (!nextPack.recipeById.has(nextSettings.recipeId)) {
        nextSettings = fallback;
      }
      const editableSnapshot =
        snapshot &&
        snapshot.pack.checksum === nextPack.ref.checksum &&
        nextPack.recipeById.has(snapshot.recipeId);
      if (editableSnapshot) {
        nextSettings = {
          ...nextSettings,
          recipeId: snapshot.recipeId,
          seed: snapshot.seed,
          lockedSlotIds: [],
          categoryOverrides: {},
        };
      }
      const relevantSource =
        nextPack.origin === "temporary" ? sessionHistory : history;
      const relevant = relevantSource.filter(
        (item) => item.pack.checksum === nextPack.ref.checksum,
      );
      const nextResult = editableSnapshot
        ? { ...snapshot, readOnly: false }
        : generateResult(nextPack, nextSettings, relevant);
      if (requestId !== activationRequestRef.current) return;
      if (persist) {
        await setSetting("active-pack", packStorageKey(nextPack.ref));
      }
      if (requestId !== activationRequestRef.current) return;
      setPack(nextPack);
      setSettings(nextSettings);
      setSettingsDirty(false);
      setGeneratorError("");
      setResult(nextResult);
      setResultSource(editableSnapshot ? source : "generated");
      if (editableSnapshot && nextPack.origin !== "temporary") {
        await saveGeneratorSettings(nextPack, nextSettings);
      }
      updateView("generate");
    },
    [history, sessionHistory, updateView],
  );

  const activateOfficial = useCallback(async () => {
    if (!officialPack) return;
    await setSetting("active-pack", "official");
    await activate(officialPack, false);
  }, [activate, officialPack]);

  const activateInstalled = useCallback(
    async (key: string) => {
      const nextPack = await loadInstalledPack(key);
      if (!nextPack) throw new Error("找不到已安装的数据包。");
      await activate(nextPack, true);
    },
    [activate],
  );

  const openTemporary = useCallback(
    async (imported: ImportedPack) => {
      const temporary = compilePack({
        data: imported.pack,
        ref: {
          packId: imported.pack.manifest.packId,
          dataVersion: imported.pack.manifest.dataVersion,
          checksum: imported.checksum,
        },
        origin: "temporary",
        capabilities: {
          generate: true,
          browse: true,
          history: true,
          export: true,
          analysis: false,
        },
      });
      await activate(temporary, false);
    },
    [activate],
  );

  const installImported = useCallback(
    async (imported: ImportedPack) => {
      const key = packStorageKey({
        packId: imported.pack.manifest.packId,
      });
      const existing = installed.find((item) => item.key === key);
      if (existing && existing.ref.checksum !== imported.checksum) {
        await deleteGeneratorSettings(key);
      }
      const nextPack = await installPack(imported.pack, imported.checksum);
      setInstalled(await listInstalledPacks());
      await activate(nextPack, true);
      await refreshLocalSummary();
      notify(existing ? "数据包已更新并打开。" : "数据包已安装并打开。", {
        tone: "success",
      });
    },
    [activate, installed, notify, refreshLocalSummary],
  );

  const removeInstalled = useCallback(
    async (key: string, checksum: string, removeHistory: boolean) => {
      await deleteInstalledPack(key, {
        checksum,
        deleteHistory: removeHistory,
      });
      setInstalled(await listInstalledPacks());
      if (removeHistory) {
        setHistory((current) =>
          current.filter((item) => item.pack.checksum !== checksum),
        );
      }
      if (pack && packStorageKey(pack.ref) === key) {
        await activateOfficial();
      }
      await refreshLocalSummary();
      notify("数据包与生成设置已删除。", { tone: "success" });
    },
    [activateOfficial, notify, pack, refreshLocalSummary],
  );

  const loadSnapshot = useCallback(
    async (
      next: ResultSnapshot,
      source: Extract<ResultDisplaySource, "history" | "favorite">,
    ) => {
      if (!pack || !settings) return;
      clearSharedResultUrl();
      const editable =
        next.pack.checksum === pack.ref.checksum &&
        pack.recipeById.has(next.recipeId);
      if (editable) {
        const nextSettings: GeneratorSettings = {
          ...settings,
          recipeId: next.recipeId,
          seed: next.seed,
          lockedSlotIds: [],
          categoryOverrides: {},
        };
        persistSettings(nextSettings, false);
        setResult({ ...next, readOnly: false });
        setResultSource(source);
      } else {
        setResult({ ...next, readOnly: true });
        setResultSource(source);
      }
      setGeneratorError("");
      updateView("generate");
    },
    [
      clearSharedResultUrl,
      pack,
      persistSettings,
      settings,
      updateView,
    ],
  );

  const openFavorite = useCallback(
    async (next: ResultSnapshot) => {
      if (next.pack.checksum === pack?.ref.checksum) {
        await loadSnapshot(next, "favorite");
        return;
      }
      if (officialPack?.ref.checksum === next.pack.checksum) {
        await setSetting("active-pack", "official");
        await activate(officialPack, false, next, "favorite");
        return;
      }
      const target = installed.find(
        (item) => item.ref.checksum === next.pack.checksum,
      );
      if (target) {
        const nextPack = await loadInstalledPack(target.key);
        if (nextPack) {
          await activate(nextPack, true, next, "favorite");
          return;
        }
      }
      await loadSnapshot(next, "favorite");
    },
    [
      activate,
      installed,
      loadSnapshot,
      officialPack,
      pack?.ref.checksum,
    ],
  );

  const toggleFavorite = useCallback(async () => {
    if (!result) return;
    const exists = favorites.some((item) => item.id === result.id);
    try {
      await setFavorite(result, !exists);
      setFavorites((current) =>
        exists
          ? current.filter((item) => item.id !== result.id)
          : [result, ...current],
      );
      await refreshLocalSummary();
      notify(exists ? "已移出收藏。" : "已加入收藏。", { tone: "success" });
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "收藏操作失败。", {
        tone: "error",
      });
    }
  }, [favorites, notify, refreshLocalSummary, result]);

  const removeFavorite = useCallback(
    async (next: ResultSnapshot) => {
      setFavorites((current) => current.filter((item) => item.id !== next.id));
      try {
        await setFavorite(next, false);
        await refreshLocalSummary();
        notify("已移出收藏。", {
          actionLabel: "撤销",
          onAction: async () => {
            await setFavorite(next, true);
            setFavorites((current) => [
              next,
              ...current.filter((item) => item.id !== next.id),
            ]);
            await refreshLocalSummary();
          },
        });
      } catch (reason) {
        setFavorites((current) => [next, ...current]);
        notify(reason instanceof Error ? reason.message : "移除收藏失败。", {
          tone: "error",
        });
      }
    },
    [notify, refreshLocalSummary],
  );

  const copy = useCallback(
    async (target: ResultSnapshot = result!) => {
      if (!target) return;
      try {
        await copyResultText(target);
        notify("结果文本已复制。", { tone: "success" });
      } catch (reason) {
        notify(reason instanceof Error ? reason.message : "无法复制结果文本。", {
          tone: "error",
        });
      }
    },
    [notify, result],
  );

  const share = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(makeShareUrl(result));
      notify("分享链接已复制。", { tone: "success" });
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "无法复制分享链接。", {
        tone: "error",
      });
    }
  }, [notify, result]);

  const useEntry = useCallback(
    (entryId: string, recipeId: string, slotId: string) => {
      if (!pack) return;
      const entry = pack.entryById.get(entryId);
      const recipe = pack.recipeById.get(recipeId);
      if (!entry || !recipe) return;
      const seed = createRandomSeed();
      const nextSettings: GeneratorSettings = {
        ...(settings ?? defaultGeneratorSettings(pack)),
        recipeId: recipe.id,
        seed,
        lockedSlotIds: [slotId],
        excludedItemIds: (
          settings?.excludedItemIds ?? []
        ).filter((id) => id !== entryId),
        categoryOverrides: {},
      };
      const anchor = snapshotForEntry(
        pack,
        recipe.id,
        slotId,
        entry.id,
        seed,
      );
      generate(nextSettings, anchor);
      updateView("generate");
    },
    [generate, pack, settings, updateView],
  );

  const removeRecent = useCallback(
    async (next: ResultSnapshot) => {
      const temporary = pack?.origin === "temporary";
      const setter = temporary ? setSessionHistory : setHistory;
      setter((current) => current.filter((item) => item.id !== next.id));
      try {
        if (!temporary) await deleteHistory(next.id);
        await refreshLocalSummary();
        notify("历史记录已删除。", {
          actionLabel: "撤销",
          onAction: async () => {
            if (!temporary) await addHistory(next);
            setter((current) =>
              [next, ...current.filter((item) => item.id !== next.id)]
                .sort((left, right) => right.createdAt - left.createdAt)
                .slice(0, 100),
            );
            await refreshLocalSummary();
          },
        });
      } catch (reason) {
        setter((current) => [next, ...current]);
        notify(reason instanceof Error ? reason.message : "历史删除失败。", {
          tone: "error",
        });
      }
    },
    [notify, pack?.origin, refreshLocalSummary],
  );

  const clearCurrentHistory = useCallback(async () => {
    if (!pack) return;
    const checksum = pack.ref.checksum;
    if (pack.origin === "temporary") {
      setSessionHistory((current) =>
        current.filter((item) => item.pack.checksum !== checksum),
      );
    } else {
      const removed = history.filter(
        (item) => item.pack.checksum === checksum,
      );
      setHistory((current) =>
        current.filter((item) => item.pack.checksum !== checksum),
      );
      try {
        await clearHistoryByChecksum(checksum);
      } catch (reason) {
        setHistory((current) =>
          [...removed, ...current]
            .filter(
              (item, index, items) =>
                items.findIndex((candidate) => candidate.id === item.id) ===
                index,
            )
            .sort((left, right) => right.createdAt - left.createdAt),
        );
        throw reason;
      }
    }
    await refreshLocalSummary();
    notify("当前数据包历史已清空。", { tone: "success" });
  }, [history, notify, pack, refreshLocalSummary]);

  const clearEveryHistory = useCallback(async () => {
    const previousHistory = history;
    const previousSessionHistory = sessionHistory;
    setHistory([]);
    setSessionHistory([]);
    try {
      await clearAllHistory();
    } catch (reason) {
      setHistory(previousHistory);
      setSessionHistory(previousSessionHistory);
      throw reason;
    }
    await refreshLocalSummary();
    notify("全部历史已清空，收藏保持不变。", { tone: "success" });
  }, [history, notify, refreshLocalSummary, sessionHistory]);

  const resetCurrentSettings = useCallback(async () => {
    if (!pack) return;
    const next = defaultGeneratorSettings(pack);
    setSettings(next);
    setSettingsDirty(true);
    setGeneratorError("");
    if (pack.origin !== "temporary") {
      await saveGeneratorSettings(pack, next);
    }
    notify("当前包设置已恢复默认，将在下次生成时生效。", {
      tone: "success",
    });
  }, [notify, pack]);

  const exportBackup = useCallback(async () => {
    const backup = await exportLocalBackup();
    const date = backup.exportedAt.slice(0, 10);
    downloadJson(`tagforge-backup-${date}.json`, backup);
    notify("本地备份已导出。", { tone: "success" });
  }, [notify]);

  const clearLocalData = useCallback(async () => {
    await clearAllLocalData();
    setHistory([]);
    setSessionHistory([]);
    setFavorites([]);
    setInstalled([]);
    setLocalSummary(EMPTY_SUMMARY);
    if (officialPack) {
      const nextSettings = defaultGeneratorSettings(officialPack);
      setPack(officialPack);
      setSettings(nextSettings);
      setSettingsDirty(false);
      setResult(generateResult(officialPack, nextSettings, []));
      setResultSource("generated");
      setGeneratorError("");
    }
    notify("全部本地生成数据已清除。", { tone: "success" });
  }, [notify, officialPack]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
      ) {
        return;
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        forge();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [forge]);

  if (error) {
    return (
      <main className="view-shell">
        <section className="panel empty-state">
          <h1>TagForge could not start</h1>
          <p>{error}</p>
          <button
            className="secondary-button"
            onClick={() => setBootRetry((value) => value + 1)}
          >
            重新加载
          </button>
        </section>
      </main>
    );
  }

  if (!pack || !officialPack || !settings || !result) {
    return (
      <main className="view-shell">
        <section className="panel empty-state">
          <h1>Loading official dataset…</h1>
        </section>
      </main>
    );
  }

  const isFavorite = favorites.some((item) => item.id === result.id);

  return (
    <div className="app">
      <Header
        view={view}
        theme={theme}
        favoriteCount={favorites.length}
        packName={pack.data.manifest.name.zh}
        packOrigin={pack.origin}
        analysisEnabled={pack.capabilities.analysis}
        onViewChange={(next) => updateView(next)}
        onThemeToggle={() =>
          setTheme((current) => (current === "dark" ? "light" : "dark"))
        }
      />

      {view === "generate" ? (
        <>
          <div className="workbench">
            <PackWorkbench
              pack={pack}
              settings={settings}
              result={result}
              resultSource={resultSource}
              isFavorite={isFavorite}
              settingsDirty={settingsDirty}
              generatorError={generatorError}
              onSettingsChange={changeSettings}
              onGenerate={forge}
              onRerollSlot={(slotId) => {
                if (settings.lockedSlotIds.includes(slotId)) return;
                generate(
                  { ...settings, seed: createRandomSeed() },
                  result,
                  slotId,
                );
              }}
              onToggleLock={(slotId) =>
                persistSettings(
                  {
                    ...settings,
                    lockedSlotIds: settings.lockedSlotIds.includes(slotId)
                      ? settings.lockedSlotIds.filter((id) => id !== slotId)
                      : [...settings.lockedSlotIds, slotId],
                  },
                  settingsDirty,
                )
              }
              onExclude={(slotId, itemId) => {
                if (settings.lockedSlotIds.includes(slotId)) return;
                generate(
                  {
                    ...settings,
                    seed: createRandomSeed(),
                    excludedItemIds: [
                      ...new Set([...settings.excludedItemIds, itemId]),
                    ],
                  },
                  result,
                  slotId,
                );
              }}
              onFavorite={() => void toggleFavorite()}
              onCopy={() => void copy()}
              onShare={() => void share()}
              onRandomSeed={() =>
                persistSettings(
                  { ...settings, seed: createRandomSeed() },
                  true,
                )
              }
              onRemoveExclusion={(itemId) =>
                persistSettings(
                  {
                    ...settings,
                    excludedItemIds: settings.excludedItemIds.filter(
                      (id) => id !== itemId,
                    ),
                  },
                  true,
                )
              }
              onUndoExclusion={() =>
                persistSettings(
                  {
                    ...settings,
                    excludedItemIds: settings.excludedItemIds.slice(0, -1),
                  },
                  true,
                )
              }
              onClearExclusions={() =>
                persistSettings({ ...settings, excludedItemIds: [] }, true)
              }
              onResetGeneration={() => {
                const next = defaultGeneratorSettings(pack);
                generate(next);
              }}
            />
          </div>
          <ResultHistory
            pack={pack}
            history={activeHistory}
            currentResultId={result.id}
            onLoad={(next) => loadSnapshot(next, "history")}
            onDelete={removeRecent}
            onClear={clearCurrentHistory}
          />
        </>
      ) : null}

      <ViewErrorBoundary resetKey={view}>
        <Suspense
          fallback={
            <main className="view-shell">
              <section className="panel empty-state">Loading view…</section>
            </main>
          }
        >
        {view === "library" ? (
          <LibraryView
            pack={pack}
            currentRecipeId={settings.recipeId}
            onUseEntry={useEntry}
          />
        ) : null}
        {view === "favorites" ? (
          <FavoritesView
            pack={pack}
            officialChecksum={officialPack.ref.checksum}
            installed={installed}
            favorites={favorites}
            onLoad={openFavorite}
            onRemove={removeFavorite}
            onCopy={copy}
          />
        ) : null}
        {view === "packs" ? (
          <PackManagerView
            activePack={pack}
            installed={installed}
            onOpenTemporary={openTemporary}
            onInstall={installImported}
            onActivateOfficial={activateOfficial}
            onActivateInstalled={activateInstalled}
            onDeleteInstalled={removeInstalled}
            onExportInstalled={async (key) => {
              const target = await loadInstalledPack(key);
              if (!target) throw new Error("找不到已安装的数据包。");
              downloadCompiledPack(target);
            }}
            historyCountByChecksum={historyCountByChecksum}
            favoriteCountByChecksum={favoriteCountByChecksum}
          />
        ) : null}
        {view === "lab" && pack.capabilities.analysis ? (
          <DataLabView
            pack={pack}
            onUseEntry={(entryId) => {
              const recipe =
                pack.recipeById.get("collision") ?? pack.data.recipes[0];
              const slot = recipe?.slots.find(
                (item) =>
                  item.source === "entries" &&
                  (item.categoryIds?.includes(
                    pack.entryById.get(entryId)?.categoryId ?? "",
                  ) ??
                    false),
              );
              if (recipe && slot) useEntry(entryId, recipe.id, slot.id);
            }}
          />
        ) : null}
        {view === "about" ? (
          <AboutView
            pack={pack}
            summary={localSummary}
            sessionHistoryCount={sessionHistory.length}
            onClearAllHistory={clearEveryHistory}
            onResetSettings={resetCurrentSettings}
            onExportBackup={exportBackup}
            onClearAllLocalData={clearLocalData}
          />
        ) : null}
        </Suspense>
      </ViewErrorBoundary>

      <footer className="app-footer">
        <span>
          TagForge · 数据更新：{pack.data.manifest.dataVersion}
        </span>
        <button onClick={() => updateView("about")}>About data</button>
        <a
          href="https://github.com/2333qbyqby/tag-forge"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
      <ToastRegion
        message={toast}
        onDismiss={() => setToast(undefined)}
        onActionError={(reason) =>
          notify(reason instanceof Error ? reason.message : "撤销操作失败。", {
            tone: "error",
          })
        }
      />
    </div>
  );
}
