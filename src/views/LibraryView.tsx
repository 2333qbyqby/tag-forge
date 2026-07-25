import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { CompiledPack } from "../packs/types";

interface Props {
  pack: CompiledPack;
  currentRecipeId: string;
  onUseEntry: (
    entryId: string,
    recipeId: string,
    slotId: string,
  ) => void | Promise<void>;
}

function anchorTarget(
  pack: CompiledPack,
  currentRecipeId: string,
  categoryId: string,
) {
  const preferredIds = [
    currentRecipeId,
    "collision",
    ...pack.data.recipes.map((recipe) => recipe.id),
  ];
  const recipes = [...new Set(preferredIds)]
    .map((id) => pack.recipeById.get(id))
    .filter((recipe) => recipe !== undefined);
  for (const recipe of recipes) {
    for (const slot of recipe.slots) {
      if (slot.source !== "entries") continue;
      const direct = slot.categoryIds?.includes(categoryId) ?? false;
      const variant = recipe.variants?.some((item) =>
        item.slotCategoryIds[slot.id]?.includes(categoryId),
      );
      if (direct || variant) return { recipeId: recipe.id, slotId: slot.id };
    }
  }
  return null;
}

export default function LibraryView({
  pack,
  currentRecipeId,
  onUseEntry,
}: Props) {
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
          const target = anchorTarget(pack, currentRecipeId, entry.categoryId);
          return (
            <article
              key={entry.id}
              className={`tag-library-card color-${category?.color ?? "slate"}`}
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
              <button
                className="primary-compact"
                disabled={!target}
                title={target ? undefined : "当前数据包没有兼容的 Recipe 槽位"}
                onClick={() =>
                  target &&
                  void onUseEntry(entry.id, target.recipeId, target.slotId)
                }
              >
                {target ? "用作生成锚点" : "无兼容槽位"}
              </button>
            </article>
          );
        })}
      </section>
      {visible.length === 0 ? (
        <section className="panel empty-state library-empty">
          <h2>没有匹配的 Entry</h2>
          <p>可以清除搜索词和筛选条件后重新浏览。</p>
          <button
            className="secondary-button"
            onClick={() => {
              setQuery("");
              setCategoryId("all");
              setFacet("all");
            }}
          >
            清除筛选
          </button>
        </section>
      ) : null}
    </main>
  );
}
