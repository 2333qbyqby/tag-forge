import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { compiledData } from "../data";
import { TAG_KINDS, type TagKind } from "../engine/types";
import { KIND_COLORS, KIND_LABELS } from "../utils/format";

interface LibraryViewProps {
  onUseTag: (tagId: string) => void;
}

export default function LibraryView({ onUseTag }: LibraryViewProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<TagKind | "all">("all");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return compiledData.tags.filter((tag) => {
      if (kind !== "all" && tag.kind !== kind) return false;
      if (!normalized) return true;
      return (
        tag.labels.en.toLowerCase().includes(normalized) ||
        tag.labels.zh.includes(query.trim()) ||
        tag.id.includes(normalized) ||
        tag.clusters.some((cluster) => cluster.includes(normalized))
      );
    });
  }, [kind, query]);

  return (
    <main className="view-shell">
      <header className="view-hero">
        <span className="eyebrow">TAG LIBRARY / {compiledData.tags.length} NODES</span>
        <h1>浏览完整创意词库。</h1>
        <p>分类、搜索并把一个词设为下一次生成的锚点。</p>
      </header>

      <div className="library-toolbar panel">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索中文、英文或语义集群…"
          />
        </label>
        <div className="kind-filter">
          <SlidersHorizontal size={15} />
          <select value={kind} onChange={(event) => setKind(event.target.value as TagKind | "all")}>
            <option value="all">全部类别</option>
            {TAG_KINDS.map((item) => (
              <option key={item} value={item}>{KIND_LABELS[item]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="library-summary">
        <span>显示 {visible.length} 个 Tag</span>
        <span>点击卡片加入生成器</span>
      </div>
      <section className="tag-library-grid">
        {visible.map((tag) => (
          <button
            key={tag.id}
            className={`tag-library-card color-${KIND_COLORS[tag.kind]}`}
            onClick={() => onUseTag(tag.id)}
          >
            <span className="eyebrow">{KIND_LABELS[tag.kind]}</span>
            <strong>{tag.labels.zh}</strong>
            <small>{tag.labels.en}</small>
            <div>
              <span>稀有 {Math.round(tag.rarity * 100)}</span>
              <span>{tag.clusters[0]}</span>
            </div>
          </button>
        ))}
      </section>
    </main>
  );
}

