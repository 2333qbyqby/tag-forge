import { Copy, Sparkles, Star, Trash2 } from "lucide-react";
import { compiledData } from "../data";
import type { GeneratedIdea } from "../engine/types";
import { TEMPLATES } from "../engine/templates";

interface FavoritesViewProps {
  favorites: GeneratedIdea[];
  onRemove: (id: string) => void;
  onLoad: (idea: GeneratedIdea) => void;
  onCopy: (idea: GeneratedIdea) => void;
}

export default function FavoritesView({
  favorites,
  onRemove,
  onLoad,
  onCopy,
}: FavoritesViewProps) {
  return (
    <main className="view-shell">
      <header className="view-hero">
        <span className="eyebrow">FAVORITES / LOCAL ONLY</span>
        <h1>值得继续推演的组合。</h1>
        <p>收藏保存在当前浏览器中，不需要账号，也不会上传。</p>
      </header>

      {favorites.length === 0 ? (
        <section className="empty-state panel">
          <Star size={28} />
          <h2>还没有收藏</h2>
          <p>在生成页遇到有感觉的组合时，按 F 或点击“收藏”。</p>
        </section>
      ) : (
        <section className="favorites-grid">
          {favorites.map((idea) => (
            <article className="favorite-card panel" key={idea.id}>
              <div className="favorite-card-top">
                <span className="eyebrow">{TEMPLATES[idea.mode].label}</span>
                <span>{new Date(idea.createdAt).toLocaleDateString("zh-CN")}</span>
              </div>
              <div className="favorite-tags">
                {idea.tagIds.map((id) => {
                  const tag = compiledData.tagById.get(id);
                  return tag ? <span key={id}>{tag.labels.zh}</span> : null;
                })}
              </div>
              <div className="favorite-metrics">
                <span>连贯 {Math.round(idea.metrics.coherence * 100)}</span>
                <span>意外 {Math.round(idea.metrics.novelty * 100)}</span>
                <span>规模 {Math.round(idea.metrics.scope * 100)}</span>
              </div>
              <div className="favorite-actions">
                <button onClick={() => onLoad(idea)}>
                  <Sparkles size={15} /> 载入
                </button>
                <button onClick={() => onCopy(idea)}>
                  <Copy size={15} /> 复制
                </button>
                <button onClick={() => onRemove(idea.id)} aria-label="删除收藏">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

