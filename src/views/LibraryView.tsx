import { ExternalLink, Info, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CompiledPack, EntryRecord } from "../packs/types";

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
  const [group, setGroup] = useState<"all" | "design" | "motif">("all");
  const [facet, setFacet] = useState("all");
  const [detailEntry, setDetailEntry] = useState<EntryRecord | null>(null);
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
      const category = pack.categoryById.get(entry.categoryId);
      if (group !== "all" && category?.group !== group) return false;
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
  }, [categoryId, facet, group, pack, query]);
  const groupedCategories = useMemo(
    () => ({
      design: pack.data.categories.filter((category) => category.group === "design"),
      motif: pack.data.categories.filter((category) => category.group === "motif"),
    }),
    [pack],
  );
  const detailCategory = detailEntry
    ? pack.categoryById.get(detailEntry.categoryId)
    : undefined;
  const detailObservations = detailEntry
    ? pack.observationsByEntry.get(detailEntry.id) ?? []
    : [];

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
          <div className="group-filter" aria-label="词库分组">
            {([
              ["all", "全部"],
              ["design", "设计坐标"],
              ["motif", "意象元素"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={group === value ? "active" : ""}
                onClick={() => {
                  setGroup(value);
                  if (
                    categoryId !== "all" &&
                    pack.categoryById.get(categoryId)?.group !== value &&
                    value !== "all"
                  ) {
                    setCategoryId("all");
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="all">全部类别</option>
            <optgroup label="设计坐标">
              {groupedCategories.design.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.labels.zh}
                </option>
              ))}
            </optgroup>
            <optgroup label="意象元素">
              {groupedCategories.motif.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.labels.zh}
                </option>
              ))}
            </optgroup>
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
              <div className="library-card-actions">
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
                {category?.group === "motif" ? (
                  <button
                    className="secondary-button source-detail-button"
                    onClick={() => setDetailEntry(entry)}
                  >
                    <Info size={14} /> 来源
                  </button>
                ) : null}
              </div>
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
              setGroup("all");
              setFacet("all");
            }}
          >
            清除筛选
          </button>
        </section>
      ) : null}
      {detailEntry ? (
        <div className="source-detail-backdrop" role="presentation">
          <section
            className="source-detail-panel panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-detail-title"
          >
            <button
              className="icon-button source-detail-close"
              aria-label="关闭来源详情"
              onClick={() => setDetailEntry(null)}
            >
              <X size={17} />
            </button>
            <span className="eyebrow">MOTIF PROVENANCE</span>
            <h2 id="source-detail-title">{detailEntry.labels.zh}</h2>
            <p className="source-detail-en">{detailEntry.labels.en}</p>
            <dl className="source-detail-meta">
              <div><dt>Category</dt><dd>{detailCategory?.labels.zh ?? detailEntry.categoryId}</dd></div>
              <div><dt>Family</dt><dd>{detailEntry.family}</dd></div>
              <div><dt>Facet</dt><dd>{detailEntry.facets.join(" · ") || "—"}</dd></div>
            </dl>
            {detailObservations.length > 0 ? (
              <div className="source-observation-list">
                {detailObservations.map((observation, index) => {
                  const source = pack.sourceById.get(observation.sourceId);
                  return (
                    <article key={`${observation.sourceId}:${index}`}>
                      <div>
                        <strong>{source?.labels.zh ?? observation.sourceId}</strong>
                        <span>{observation.salience === "core" ? "核心意象" : "反复出现"}</span>
                      </div>
                      <p>{observation.note.zh}</p>
                      <small>{observation.channels.join(" · ")}</small>
                      <a href={observation.evidenceUrl} target="_blank" rel="noreferrer">
                        官方页面 <ExternalLink size={13} />
                      </a>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="source-detail-missing">该词条未附来源证据。</p>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
