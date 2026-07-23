import { ArrowRight } from "lucide-react";
import { compiledData } from "../../data";
import type { IdeaHistoryEntry } from "../../engine/types";

interface HistoryStripProps {
  history: IdeaHistoryEntry[];
}

export function HistoryStrip({ history }: HistoryStripProps) {
  return (
    <section className="history-strip">
      <div className="section-heading">
        <div>
          <span className="eyebrow">RECENT RUNS</span>
          <h2>最近生成</h2>
        </div>
        <span>{history.length} / 100</span>
      </div>
      <div className="history-list">
        {history.slice(0, 8).map((entry, index) => (
          <article key={`${entry.id}:${index}`}>
            <span className="history-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              {entry.tagIds.slice(0, 4).map((id) => (
                <span key={id}>{compiledData.tagById.get(id)?.labels.zh ?? id}</span>
              ))}
            </div>
            <ArrowRight size={15} />
          </article>
        ))}
        {history.length === 0 ? (
          <p className="empty-note">生成过的组合会留在这里，并用于降低近期重复。</p>
        ) : null}
      </div>
    </section>
  );
}

