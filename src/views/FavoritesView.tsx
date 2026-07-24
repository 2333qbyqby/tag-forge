import { Copy, Sparkles, Star, Trash2 } from "lucide-react";
import type { CompiledData } from "../engine/types";
import {
  isV2Idea,
  type PromptRecord,
  type SavedIdea,
} from "../engine/v2-types";

interface FavoritesViewProps {
  favorites: SavedIdea[];
  data: CompiledData;
  prompts: PromptRecord[];
  onRemove: (id: string) => void;
  onLoad: (idea: SavedIdea) => void;
  onCopy: (idea: SavedIdea) => void;
  onExtractLegacy: (idea: SavedIdea) => void;
}

export default function FavoritesView({
  favorites,
  data,
  prompts,
  onRemove,
  onLoad,
  onCopy,
  onExtractLegacy,
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
          {favorites.map((idea) => {
            const v2 = isV2Idea(idea);
            const ids = v2
              ? idea.baseTagIds.filter((id): id is string => Boolean(id))
              : idea.tagIds;
            const prompt = v2
              ? prompts.find((item) => item.id === idea.promptId)
              : undefined;
            return (
              <article className="favorite-card panel" key={idea.id}>
                <div className="favorite-card-top">
                  <span className="eyebrow">
                    {v2
                      ? idea.mode === "challenge"
                        ? "挑战模式"
                        : "逐词模式"
                      : "旧版结果"}
                  </span>
                  <span>{new Date(idea.createdAt).toLocaleDateString("zh-CN")}</span>
                </div>
                <div className="favorite-tags">
                  {ids.map((id) => (
                    <span key={id}>{data.tagById.get(id)?.labels.zh ?? id}</span>
                  ))}
                  {prompt ? (
                    <span>{prompt.labels.zh}</span>
                  ) : v2 && idea.promptId ? (
                    <span>{idea.promptId}</span>
                  ) : null}
                </div>
                <div className="favorite-actions">
                  <button onClick={() => onLoad(idea)}>
                    <Sparkles size={15} /> 载入
                  </button>
                  {!v2 ? (
                    <button onClick={() => onExtractLegacy(idea)}>
                      <Sparkles size={15} /> 提取
                    </button>
                  ) : null}
                  <button onClick={() => onCopy(idea)}>
                    <Copy size={15} /> 复制
                  </button>
                  <button onClick={() => onRemove(idea.id)} aria-label="删除收藏">
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
