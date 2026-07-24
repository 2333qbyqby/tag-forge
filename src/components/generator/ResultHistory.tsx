import type { ResultSnapshotV1 } from "../../packs/types";

interface Props {
  history: ResultSnapshotV1[];
  onLoad: (result: ResultSnapshotV1) => void;
}

export function ResultHistory({ history, onLoad }: Props) {
  if (history.length === 0) return null;
  return (
    <section className="history-section">
      <div className="history-heading">
        <span className="eyebrow">RECENT / LOCAL</span>
        <span>{history.length} 条</span>
      </div>
      <div className="history-strip">
        {history.slice(0, 20).map((result) => (
          <button key={result.id} onClick={() => onLoad(result)}>
            <small>{result.recipeId}</small>
            <strong>
              {result.slots
                .slice(0, 3)
                .map((slot) => slot.labels.zh)
                .join(" × ")}
            </strong>
          </button>
        ))}
      </div>
    </section>
  );
}
