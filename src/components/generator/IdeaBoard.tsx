import { AnimatePresence, motion } from "motion/react";
import {
  Ban,
  Copy,
  Lock,
  RefreshCw,
  Share2,
  Sparkles,
  Star,
  Unlock,
} from "lucide-react";
import { compiledData } from "../../data";
import { TEMPLATES } from "../../engine/templates";
import type { GeneratedIdea, GeneratorConfig } from "../../engine/types";
import { KIND_COLORS, KIND_LABELS } from "../../utils/format";

interface IdeaBoardProps {
  idea: GeneratedIdea;
  config: GeneratorConfig;
  isFavorite: boolean;
  copied: boolean;
  onGenerate: () => void;
  onRerollSlot: (slotId: string) => void;
  onTogglePin: (slotId: string, tagId: string) => void;
  onExclude: (slotId: string, tagId: string) => void;
  onFavorite: () => void;
  onCopy: () => void;
  onShare: () => void;
}

export function IdeaBoard({
  idea,
  config,
  isFavorite,
  copied,
  onGenerate,
  onRerollSlot,
  onTogglePin,
  onExclude,
  onFavorite,
  onCopy,
  onShare,
}: IdeaBoardProps) {
  const template = TEMPLATES[idea.mode];

  return (
    <main className="idea-workspace">
      <div className="idea-toolbar">
        <div>
          <span className="eyebrow">IDEA SEED / {template.label}</span>
          <p>锁住想保留的部分，再单独重抽其余卡片。</p>
        </div>
        <div className="idea-toolbar-actions">
          <button className="secondary-button" onClick={onCopy}>
            <Copy size={15} />
            {copied ? "已复制" : "复制"}
          </button>
          <button
            className={`secondary-button ${isFavorite ? "is-favorite" : ""}`}
            onClick={onFavorite}
          >
            <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
            {isFavorite ? "已收藏" : "收藏"}
          </button>
          <button className="icon-button" onClick={onShare} aria-label="复制分享链接">
            <Share2 size={16} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={idea.id}
          className={`idea-grid idea-grid-${template.slots.length}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          aria-label="生成的游戏灵感组合"
        >
          {template.slots.map((slot, index) => {
            const tagId = idea.slots[slot.id];
            const tag = compiledData.tagById.get(tagId);
            if (!tag) return null;
            const pinned = config.pinnedBySlot[slot.id] === tagId;
            return (
              <article
                key={slot.id}
                className={`idea-tile color-${KIND_COLORS[tag.kind]} tile-${index + 1}`}
                data-kind={tag.kind}
              >
                <div className="tile-topline">
                  <span>{KIND_LABELS[tag.kind]}</span>
                  <span className="tile-index">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="tile-copy">
                  <h2>{tag.labels.zh}</h2>
                  <p>{tag.labels.en}</p>
                </div>
                <div className="tile-actions">
                  <button
                    onClick={() => onTogglePin(slot.id, tag.id)}
                    aria-label={pinned ? `解锁${tag.labels.zh}` : `锁定${tag.labels.zh}`}
                    title={pinned ? "解锁" : "锁定"}
                  >
                    {pinned ? <Lock size={15} /> : <Unlock size={15} />}
                  </button>
                  <button
                    onClick={() => onRerollSlot(slot.id)}
                    disabled={pinned}
                    aria-label={`重新抽取${slot.label}`}
                    title="单独重抽"
                  >
                    <RefreshCw size={15} />
                  </button>
                  <button
                    onClick={() => onExclude(slot.id, tag.id)}
                    disabled={pinned}
                    aria-label={`排除${tag.labels.zh}`}
                    title="排除并重抽"
                  >
                    <Ban size={15} />
                  </button>
                </div>
                {pinned ? <span className="pin-badge"><Lock size={11} /> 已锁定</span> : null}
              </article>
            );
          })}
        </motion.section>
      </AnimatePresence>

      <button className="generate-button" onClick={onGenerate}>
        <Sparkles size={18} />
        <span>锻造新组合</span>
        <kbd>G</kbd>
      </button>
    </main>
  );
}

