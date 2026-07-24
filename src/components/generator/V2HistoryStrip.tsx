import { ArrowRight } from "lucide-react";
import type { CompiledData } from "../../engine/types";
import type {
  PromptRecord,
  StoredHistoryEntry,
} from "../../engine/v2-types";

interface Props {
  history: StoredHistoryEntry[];
  data: CompiledData;
  prompts: PromptRecord[];
}

export function V2HistoryStrip({ history, data, prompts }: Props) {
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
        {history.slice(0, 8).map((entry, index) => {
          const ids =
            entry.schemaVersion === 2 ? entry.baseTagIds : entry.tagIds;
          const prompt =
            entry.schemaVersion === 2
              ? prompts.find((item) => item.id === entry.promptId)
              : undefined;
          return (
            <article key={`${entry.id}:${index}`}>
              <span className="history-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                {ids.slice(0, 4).map((id) => (
                  <span key={id}>{data.tagById.get(id)?.labels.zh ?? id}</span>
                ))}
                {prompt ? (
                  <span>{prompt.labels.zh}</span>
                ) : entry.schemaVersion === 2 && entry.promptId ? (
                  <span>{entry.promptId}</span>
                ) : null}
              </div>
              <ArrowRight size={15} />
            </article>
          );
        })}
        {history.length === 0 ? (
          <p className="empty-note">生成过的组合会保存在本机，并用于降低近期重复。</p>
        ) : null}
      </div>
    </section>
  );
}
