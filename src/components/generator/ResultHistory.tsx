import { Eraser, List, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CompiledPack, ResultSnapshot } from "../../packs/types";
import { ConfirmDialog } from "../Feedback";

interface Props {
  pack: CompiledPack;
  history: ResultSnapshot[];
  currentResultId?: string;
  onLoad: (result: ResultSnapshot) => void | Promise<void>;
  onDelete: (result: ResultSnapshot) => void | Promise<void>;
  onClear: () => void | Promise<void>;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function ResultHistory({
  pack,
  history,
  currentResultId,
  onLoad,
  onDelete,
  onClear,
}: Props) {
  const [clearOpen, setClearOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const allDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = allDialogRef.current;
    if (!dialog) return;
    if (showAll && !dialog.open) dialog.showModal();
    if (!showAll && dialog.open) dialog.close();
  }, [showAll]);

  if (history.length === 0) return null;

  const remove = async (result: ResultSnapshot) => {
    setBusyIds((current) => [...current, result.id]);
    try {
      await onDelete(result);
    } finally {
      setBusyIds((current) => current.filter((id) => id !== result.id));
    }
  };

  const cards = (items: ResultSnapshot[]) =>
    items.map((result) => {
      const active = result.id === currentResultId;
      const recipe =
        pack.recipeById.get(result.recipeId)?.labels.zh ?? result.recipeId;
      return (
        <article
          className={`history-card ${active ? "is-current" : ""}`}
          key={result.id}
        >
          <button
            className="history-load"
            onClick={() => void onLoad(result)}
            aria-current={active ? "true" : undefined}
          >
            <span>
              <small>{recipe}</small>
              <time dateTime={new Date(result.createdAt).toISOString()}>
                {timeFormatter.format(result.createdAt)}
              </time>
            </span>
            <strong>
              {result.slots
                .slice(0, 3)
                .map((slot) => slot.labels.zh)
                .join(" × ")}
            </strong>
          </button>
          <button
            className="history-delete"
            onClick={() => void remove(result)}
            disabled={busyIds.includes(result.id)}
            aria-label={`删除历史：${result.slots
              .slice(0, 2)
              .map((slot) => slot.labels.zh)
              .join(" × ")}`}
          >
            <Trash2 size={14} />
          </button>
        </article>
      );
    });

  return (
    <section className="history-section">
      <div className="history-heading">
        <div>
          <span className="eyebrow">RECENT / LOCAL</span>
          <span>{history.length} 条</span>
        </div>
        <div>
          {history.length > 20 ? (
            <button className="text-button" onClick={() => setShowAll(true)}>
              <List size={14} /> 查看全部
            </button>
          ) : null}
          <button className="text-button danger-text" onClick={() => setClearOpen(true)}>
            <Eraser size={14} /> 清空当前包
          </button>
        </div>
      </div>
      <div className="history-strip">{cards(history.slice(0, 20))}</div>

      <dialog
        ref={allDialogRef}
        className="history-all-dialog"
        onCancel={(event) => {
          event.preventDefault();
          setShowAll(false);
        }}
        onClose={() => setShowAll(false)}
      >
        <div className="history-all-heading">
          <div>
            <span className="eyebrow">ALL RECENT</span>
            <h2>{pack.data.manifest.name.zh}</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => setShowAll(false)}
            aria-label="关闭全部历史"
          >
            <X size={17} />
          </button>
        </div>
        <div className="history-all-list">{cards(history)}</div>
      </dialog>

      <ConfirmDialog
        open={clearOpen}
        title="清空当前数据包历史？"
        description={`将删除 ${history.length} 条记录。收藏和当前展示结果不会受到影响。`}
        confirmLabel="清空历史"
        destructive
        onCancel={() => setClearOpen(false)}
        onConfirm={async () => {
          await onClear();
          setClearOpen(false);
          setShowAll(false);
        }}
      />
    </section>
  );
}
