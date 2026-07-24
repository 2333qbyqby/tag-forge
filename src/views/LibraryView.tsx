import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { CompiledPack } from "../packs/types";

interface Props {
  pack: CompiledPack;
  onUseEntry: (entryId: string) => void;
}

export default function LibraryView({ pack, onUseEntry }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [facet, setFacet] = useState("all");
  const facets = useMemo(
    () =>
      [...new Set(pack.data.entries.flatMap((entry) => entry.facets))].sort(
        (left, right) => left.localeCompare(right),
      ),
    [pack],
  );
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return pack.data.entries.filter((entry) => {
      if (entry.enabled === false || entry.deprecatedBy) return false;
      if (categoryId !== "all" && entry.categoryId !== categoryId) return false;
      if (facet !== "all" && !entry.facets.includes(facet)) return false;
      if (!normalized) return true;
      return (
        entry.labels.zh.includes(query.trim()) ||
        entry.labels.en.toLocaleLowerCase().includes(normalized) ||
        entry.id.includes(normalized) ||
        entry.aliases.some((alias) =>
          alias.toLocaleLowerCase().includes(normalized),
        ) ||
        entry.facets.some((facet) =>
          facet.toLocaleLowerCase().includes(normalized),
        )
      );
    });
  }, [categoryId, facet, pack, query]);

  return (
    <main className="view-shell">
      <header className="view-hero">
        <span className="eyebrow">
          ENTRY LIBRARY / {pack.data.entries.length}
        </span>
        <h1>浏览当前数据包。</h1>
        <p>分类、搜索并把一个 Entry 设为生成锚点。</p>
      </header>
      <div className="library-toolbar panel">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索中文、英文、别名或 Facet…"
          />
        </label>
        <div className="kind-filter">
          <SlidersHorizontal size={15} />
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="all">全部类别</option>
            {pack.data.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.labels.zh}
              </option>
            ))}
          </select>
          <select value={facet} onChange={(event) => setFacet(event.target.value)}>
            <option value="all">全部 Facet</option>
            {facets.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="library-summary">
        <span>显示 {visible.length} 个 Entry</span>
        <span>Facet 仅用于浏览，不影响生成合法性</span>
      </div>
      <section className="tag-library-grid">
        {visible.map((entry) => {
          const category = pack.categoryById.get(entry.categoryId);
          return (
            <button
              key={entry.id}
              className={`tag-library-card color-${category?.color ?? "slate"}`}
              onClick={() => onUseEntry(entry.id)}
            >
              <span className="eyebrow">
                {category?.labels.zh ?? entry.categoryId}
              </span>
              <strong>{entry.labels.zh}</strong>
              <small>{entry.labels.en}</small>
              <div>
                <span>权重 {entry.baseWeight.toFixed(2)}</span>
                <span>{entry.facets[0] ?? "—"}</span>
              </div>
            </button>
          );
        })}
      </section>
    </main>
  );
}
