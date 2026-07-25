import { Copy, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CompiledPack, ResultSnapshot } from "../packs/types";
import type { InstalledPackMeta } from "../storage/db";

interface Props {
  pack: CompiledPack;
  officialChecksum: string;
  installed: InstalledPackMeta[];
  favorites: ResultSnapshot[];
  onLoad: (result: ResultSnapshot) => void | Promise<void>;
  onRemove: (result: ResultSnapshot) => void | Promise<void>;
  onCopy: (result: ResultSnapshot) => void | Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default function FavoritesView({
  pack,
  officialChecksum,
  installed,
  favorites,
  onLoad,
  onRemove,
  onCopy,
}: Props) {
  const [query, setQuery] = useState("");
  const [checksum, setChecksum] = useState("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const packOptions = useMemo(
    () =>
      [...new Map(favorites.map((item) => [item.pack.checksum, item.pack])).values()],
    [favorites],
  );
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return favorites
      .filter((result) => {
        if (checksum !== "all" && result.pack.checksum !== checksum) return false;
        if (!normalized) return true;
        return (
          result.recipeId.toLocaleLowerCase().includes(normalized) ||
          result.pack.packId.toLocaleLowerCase().includes(normalized) ||
          result.slots.some(
            (slot) =>
              slot.labels.zh.includes(query.trim()) ||
              slot.labels.en.toLocaleLowerCase().includes(normalized),
          )
        );
      })
      .sort((left, right) =>
        sort === "newest"
          ? right.createdAt - left.createdAt
          : left.createdAt - right.createdAt,
      );
  }, [checksum, favorites, query, sort]);

  const runFor = async (
    result: ResultSnapshot,
    action: () => void | Promise<void>,
  ) => {
    setBusyIds((current) => [...current, result.id]);
    setActionError("");
    try {
      await action();
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "收藏操作失败。",
      );
    } finally {
      setBusyIds((current) => current.filter((id) => id !== result.id));
    }
  };

  return (
    <main className="view-shell">
      <header className="view-hero">
        <span className="eyebrow">FAVORITES / {favorites.length}</span>
        <h1>收藏的灵感快照。</h1>
        <p>快照保存数据包标识和显示文本，即使原数据包缺失也不会消失。</p>
      </header>
      {favorites.length === 0 ? (
        <section className="panel empty-state">
          <h2>还没有收藏</h2>
          <p>在生成结果中点击收藏，之后会出现在这里。</p>
        </section>
      ) : (
        <>
          <div className="favorites-toolbar panel">
            <label className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索结果、Recipe 或数据包…"
              />
            </label>
            <select value={checksum} onChange={(event) => setChecksum(event.target.value)}>
              <option value="all">全部数据包</option>
              {packOptions.map((item) => (
                <option key={item.checksum} value={item.checksum}>
                  {item.packId} · {item.dataVersion}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "newest" | "oldest")}
            >
              <option value="newest">最新优先</option>
              <option value="oldest">最早优先</option>
            </select>
          </div>
          {actionError ? (
            <p className="panel action-error" role="alert">
              {actionError}
            </p>
          ) : null}
          {visible.length > 0 ? (
            <section className="favorites-grid">
              {visible.map((result) => {
                const isCurrent = result.pack.checksum === pack.ref.checksum;
                const available =
                  result.pack.checksum === officialChecksum ||
                  installed.some(
                    (item) => item.ref.checksum === result.pack.checksum,
                  );
                const status = isCurrent
                  ? "当前包"
                  : available
                    ? "可切换"
                    : "缺包只读";
                const recipe =
                  isCurrent
                    ? pack.recipeById.get(result.recipeId)?.labels.zh
                    : undefined;
                return (
                  <article className="panel favorite-card" key={result.id}>
                    <div className="favorite-card-top">
                      <span>{recipe ?? result.recipeId}</span>
                      <span className={`snapshot-status status-${status}`}>
                        {status}
                      </span>
                    </div>
                    <div className="favorite-tags">
                      {result.slots.map((slot) => (
                        <span key={`${slot.slotId}:${slot.itemId}`}>
                          {slot.labels.zh}
                        </span>
                      ))}
                    </div>
                    <small>
                      {result.pack.packId} · 数据更新 {result.pack.dataVersion} ·{" "}
                      {dateFormatter.format(result.createdAt)}
                    </small>
                    <div className="favorite-actions">
                      <button
                        disabled={busyIds.includes(result.id)}
                        onClick={() =>
                          void runFor(result, () => onLoad(result))
                        }
                      >
                        {available && !isCurrent ? "切换并打开" : "打开快照"}
                      </button>
                      <button
                        disabled={busyIds.includes(result.id)}
                        onClick={() =>
                          void runFor(result, () => onCopy(result))
                        }
                        aria-label="复制收藏"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        disabled={busyIds.includes(result.id)}
                        onClick={() =>
                          void runFor(result, () => onRemove(result))
                        }
                        aria-label="移除收藏"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="panel empty-state">
              <h2>没有匹配的收藏</h2>
              <p>清除搜索和数据包筛选后可以查看全部收藏。</p>
              <button
                className="secondary-button"
                onClick={() => {
                  setQuery("");
                  setChecksum("all");
                }}
              >
                清除筛选
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
