import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Header, type AppView } from "./components/Header";
import { PackWorkbench } from "./components/generator/PackWorkbench";
import { ResultHistory } from "./components/generator/ResultHistory";
import { createRandomSeed } from "./engine/rng";
import {
  defaultGeneratorSettings,
  generateResult,
} from "./engine/pack-engine";
import { compilePack } from "./packs/compile";
import { loadOfficialPack } from "./packs/official";
import type {
  CompiledPack,
  GeneratorSettings,
  ResultSnapshotV1,
} from "./packs/types";
import type { ImportedPack } from "./packs/importer";
import {
  addHistory,
  deleteInstalledPack,
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
} from "./storage/db";
import { migrateLegacyStorage } from "./storage/legacy-migration";
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

function viewFromUrl(): AppView {
  const value = new URLSearchParams(window.location.search).get("view");
  return ["generate", "library", "favorites", "packs", "lab", "about"].includes(
    value ?? "",
  )
    ? (value as AppView)
    : "generate";
}

function themeFromStorage(): "dark" | "light" {
  const stored =
    localStorage.getItem("tagforge:theme") ??
    localStorage.getItem("tagforge:theme:v1");
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
): ResultSnapshotV1 {
  const entry = pack.entryById.get(entryId);
  if (!entry) throw new Error(`Unknown entry: ${entryId}`);
  return {
    id: `anchor:${entryId}:${seed}`,
    schemaVersion: 1,
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

export default function App() {
  const [view, setView] = useState<AppView>(viewFromUrl);
  const [officialPack, setOfficialPack] = useState<CompiledPack>();
  const [pack, setPack] = useState<CompiledPack>();
  const [settings, setSettings] = useState<GeneratorSettings>();
  const [result, setResult] = useState<ResultSnapshotV1>();
  const [history, setHistory] = useState<ResultSnapshotV1[]>([]);
  const [favorites, setFavorites] = useState<ResultSnapshotV1[]>([]);
  const [installed, setInstalled] = useState<InstalledPackMeta[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">(themeFromStorage);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const official = await loadOfficialPack();
        await migrateLegacyStorage(official);
        const [installedPacks, storedHistory, storedFavorites, activeKey] =
          await Promise.all([
            listInstalledPacks(),
            loadHistory(),
            loadFavorites(),
            getSetting<string>("active-pack"),
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
        setHistory(storedHistory);
        setFavorites(storedFavorites);
        setInstalled(installedPacks);
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
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tagforge:theme", theme);
  }, [theme]);

  const activeHistory = useMemo(
    () =>
      pack
        ? history.filter((item) => item.pack.checksum === pack.ref.checksum)
        : [],
    [history, pack],
  );

  const updateView = useCallback((next: AppView) => {
    setView(next);
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("view", next);
    window.history.replaceState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const persistSettings = useCallback(
    (next: GeneratorSettings) => {
      setSettings(next);
      if (pack && pack.origin !== "temporary") {
        void saveGeneratorSettings(pack, next);
      }
    },
    [pack],
  );

  const record = useCallback((next: ResultSnapshotV1) => {
    setResult(next);
    setHistory((current) => [
      next,
      ...current.filter((item) => item.id !== next.id),
    ].slice(0, 100));
    void addHistory(next);
  }, []);

  const generate = useCallback(
    (
      nextSettings: GeneratorSettings,
      current?: ResultSnapshotV1,
      onlySlotId?: string,
    ) => {
      if (!pack) return;
      const next = generateResult(
        pack,
        nextSettings,
        activeHistory,
        current,
        onlySlotId,
      );
      persistSettings(nextSettings);
      record(next);
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
        const seeded = { ...next, seed: createRandomSeed() };
        generate(seeded);
      } else {
        persistSettings(next);
      }
    },
    [generate, pack, persistSettings, settings],
  );

  const activate = useCallback(
    async (nextPack: CompiledPack, persist: boolean) => {
      const fallback = defaultGeneratorSettings(nextPack);
      const nextSettings =
        nextPack.origin === "temporary"
          ? fallback
          : await loadGeneratorSettings(nextPack, fallback);
      const validSettings = nextPack.recipeById.has(nextSettings.recipeId)
        ? nextSettings
        : fallback;
      const relevant = history.filter(
        (item) => item.pack.checksum === nextPack.ref.checksum,
      );
      setPack(nextPack);
      setSettings(validSettings);
      setResult(generateResult(nextPack, validSettings, relevant));
      if (persist) {
        await setSetting("active-pack", packStorageKey(nextPack.ref));
      }
      updateView("generate");
    },
    [history, updateView],
  );

  const activateOfficial = useCallback(async () => {
    if (!officialPack) return;
    await setSetting("active-pack", "official");
    await activate(officialPack, false);
  }, [activate, officialPack]);

  const activateInstalled = useCallback(
    async (key: string) => {
      const nextPack = await loadInstalledPack(key);
      if (nextPack) await activate(nextPack, true);
    },
    [activate],
  );

  const openTemporary = useCallback(
    (imported: ImportedPack) => {
      const temporary = compilePack({
        data: imported.pack,
        ref: {
          packId: imported.pack.manifest.packId,
          version: imported.pack.manifest.version,
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
      void activate(temporary, false);
    },
    [activate],
  );

  const installImported = useCallback(
    async (imported: ImportedPack) => {
      const nextPack = await installPack(imported.pack, imported.checksum);
      setInstalled(await listInstalledPacks());
      await activate(nextPack, true);
    },
    [activate],
  );

  const removeInstalled = useCallback(
    async (key: string) => {
      await deleteInstalledPack(key);
      setInstalled(await listInstalledPacks());
      if (pack && packStorageKey(pack.ref) === key) {
        await activateOfficial();
      }
    },
    [activateOfficial, pack],
  );

  const toggleFavorite = useCallback(async () => {
    if (!result) return;
    const exists = favorites.some((item) => item.id === result.id);
    await setFavorite(result, !exists);
    setFavorites((current) =>
      exists
        ? current.filter((item) => item.id !== result.id)
        : [result, ...current],
    );
  }, [favorites, result]);

  const copy = useCallback(
    async (target: ResultSnapshotV1 = result!) => {
      if (!target) return;
      await copyResultText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    },
    [result],
  );

  const share = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(makeShareUrl(result));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [result]);

  const useEntry = useCallback(
    (entryId: string) => {
      if (!pack) return;
      const entry = pack.entryById.get(entryId);
      const recipe = pack.recipeById.get("collision") ?? pack.data.recipes[0];
      if (!entry || !recipe) return;
      const compatible = recipe.slots.filter(
        (slot) =>
          slot.source === "entries" &&
          (slot.categoryIds?.includes(entry.categoryId) ?? false),
      );
      const slot = compatible.at(-1);
      if (!slot) return;
      const seed = createRandomSeed();
      const nextSettings: GeneratorSettings = {
        ...(settings ?? defaultGeneratorSettings(pack)),
        recipeId: recipe.id,
        seed,
        lockedSlotIds: [slot.id],
        excludedItemIds: [],
        categoryOverrides: {},
      };
      const anchor = snapshotForEntry(pack, recipe.id, slot.id, entry.id, seed);
      generate(nextSettings, anchor);
      updateView("generate");
    },
    [generate, pack, settings, updateView],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
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
        </section>
      </main>
    );
  }

  if (!pack || !officialPack || !settings || !result) {
    return (
      <main className="view-shell">
        <section className="panel empty-state">
          <h1>Loading official V2 data pack…</h1>
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
        onViewChange={updateView}
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
              isFavorite={isFavorite}
              copied={copied}
              onSettingsChange={changeSettings}
              onGenerate={forge}
              onRerollSlot={(slotId) => {
                if (settings.lockedSlotIds.includes(slotId)) return;
                const nextSettings = { ...settings, seed: createRandomSeed() };
                generate(nextSettings, result, slotId);
              }}
              onToggleLock={(slotId) =>
                persistSettings({
                  ...settings,
                  lockedSlotIds: settings.lockedSlotIds.includes(slotId)
                    ? settings.lockedSlotIds.filter((id) => id !== slotId)
                    : [...settings.lockedSlotIds, slotId],
                })
              }
              onExclude={(slotId, itemId) => {
                if (settings.lockedSlotIds.includes(slotId)) return;
                const nextSettings = {
                  ...settings,
                  seed: createRandomSeed(),
                  excludedItemIds: [
                    ...new Set([...settings.excludedItemIds, itemId]),
                  ],
                };
                generate(nextSettings, result, slotId);
              }}
              onFavorite={() => void toggleFavorite()}
              onCopy={() => void copy()}
              onShare={() => void share()}
              onRandomSeed={() =>
                persistSettings({ ...settings, seed: createRandomSeed() })
              }
            />
          </div>
          <ResultHistory
            history={activeHistory}
            onLoad={(next) => setResult(next)}
          />
        </>
      ) : null}

      <Suspense
        fallback={
          <main className="view-shell">
            <section className="panel empty-state">Loading view…</section>
          </main>
        }
      >
        {view === "library" ? (
          <LibraryView pack={pack} onUseEntry={useEntry} />
        ) : null}
        {view === "favorites" ? (
          <FavoritesView
            favorites={favorites}
            onLoad={(next) => {
              setResult(
                next.pack.checksum === pack.ref.checksum
                  ? next
                  : { ...next, readOnly: true },
              );
              updateView("generate");
            }}
            onRemove={(next) => {
              void setFavorite(next, false);
              setFavorites((current) =>
                current.filter((item) => item.id !== next.id),
              );
            }}
            onCopy={(next) => void copy(next)}
          />
        ) : null}
        {view === "packs" ? (
          <PackManagerView
            activePack={pack}
            installed={installed}
            onOpenTemporary={openTemporary}
            onInstall={(imported) => void installImported(imported)}
            onActivateOfficial={() => void activateOfficial()}
            onActivateInstalled={(key) => void activateInstalled(key)}
            onDeleteInstalled={(key) => void removeInstalled(key)}
          />
        ) : null}
        {view === "lab" && pack.capabilities.analysis ? (
          <DataLabView pack={pack} onUseEntry={useEntry} />
        ) : null}
        {view === "about" ? <AboutView pack={pack} /> : null}
      </Suspense>

      <footer className="app-footer">
        <span>
          TagForge · Pack Schema 1 · Data {pack.data.manifest.dataVersion}
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
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}
