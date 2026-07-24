import { Copy, Trash2 } from "lucide-react";
import type { ResultSnapshotV1 } from "../packs/types";

interface Props {
  favorites: ResultSnapshotV1[];
  onLoad: (result: ResultSnapshotV1) => void;
  onRemove: (result: ResultSnapshotV1) => void;
  onCopy: (result: ResultSnapshotV1) => void;
}

export default function FavoritesView({
  favorites,
  onLoad,
  onRemove,
  onCopy,
}: Props) {
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
        <section className="favorites-grid">
          {favorites.map((result) => (
            <article className="panel favorite-card" key={result.id}>
              <button className="favorite-main" onClick={() => onLoad(result)}>
                <span className="eyebrow">{result.recipeId}</span>
                <strong>
                  {result.slots.map((slot) => slot.labels.zh).join(" × ")}
                </strong>
                <small>{result.pack.packId}</small>
              </button>
              <div>
                <button onClick={() => onCopy(result)} aria-label="复制">
                  <Copy size={15} />
                </button>
                <button onClick={() => onRemove(result)} aria-label="移除收藏">
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
