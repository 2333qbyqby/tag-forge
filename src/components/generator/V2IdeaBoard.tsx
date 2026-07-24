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
import type { CompiledData } from "../../engine/types";
import {
  isV2Idea,
  type GeneratorConfigV2,
  type PromptRecord,
  type SavedIdea,
} from "../../engine/v2-types";
import { KIND_COLORS, KIND_LABELS } from "../../utils/format";

interface Props {
  idea: SavedIdea;
  config: GeneratorConfigV2;
  data: CompiledData;
  prompts: PromptRecord[];
  isFavorite: boolean;
  copied: boolean;
  onGenerate: () => void;
  onRerollSlot: (slot: 0 | 1) => void;
  onRerollBase: () => void;
  onRerollPrompt: () => void;
  onToggleLock: (part: "left" | "right" | "prompt") => void;
  onExcludeTag: (slot: 0 | 1, tagId: string) => void;
  onExcludePrompt: (promptId: string) => void;
  onFavorite: () => void;
  onCopy: () => void;
  onShare: () => void;
  onExtractLegacy: () => void;
}

export function V2IdeaBoard({
  idea,
  config,
  data,
  prompts,
  isFavorite,
  copied,
  onGenerate,
  onRerollSlot,
  onRerollBase,
  onRerollPrompt,
  onToggleLock,
  onExcludeTag,
  onExcludePrompt,
  onFavorite,
  onCopy,
  onShare,
  onExtractLegacy,
}: Props) {
  const legacy = !isV2Idea(idea);
  const title = legacy
    ? "LEGACY / ENGINE 1"
    : idea.mode === "challenge"
      ? "CHALLENGE / ENGINE 2"
      : "ONE BY ONE / ENGINE 2";

  const legacyTags = legacy
    ? idea.tagIds.map((id) => ({ id, tag: data.tagById.get(id) }))
    : [];
  const prompt = isV2Idea(idea)
    ? prompts.find((item) => item.id === idea.promptId)
    : undefined;
  const tileCount = legacy
    ? Math.max(1, legacyTags.length)
    : idea.mode === "challenge"
      ? 3
      : 2;

  return (
    <main className="idea-workspace">
      <div className="idea-toolbar">
        <div>
          <span className="eyebrow">{title}</span>
          <p>
            {legacy
              ? "旧结果原样保留；可提取其中的基础标签进入新版。"
              : "保留有感觉的词，其余部分可以独立重抽。"}
          </p>
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
          className={`idea-grid idea-grid-${tileCount}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          aria-label="生成的游戏灵感组合"
        >
          {legacy
            ? legacyTags.map(({ id, tag }, index) =>
                tag ? (
                  <article
                    key={`${id}:${index}`}
                    className={`idea-tile color-${KIND_COLORS[tag.kind]} tile-${index + 1}`}
                    data-kind={tag.kind}
                  >
                    <div className="tile-topline">
                      <span>{KIND_LABELS[tag.kind]}</span>
                      <span className="tile-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="tile-copy">
                      <h2>{tag.labels.zh}</h2>
                      <p>{tag.labels.en}</p>
                    </div>
                  </article>
                ) : (
                  <article
                    key={`${id}:${index}`}
                    className={`idea-tile color-slate tile-${index + 1}`}
                    data-kind="legacy"
                  >
                    <div className="tile-topline">
                      <span>旧版标签</span>
                      <span className="tile-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="tile-copy">
                      <h2>{id}</h2>
                      <p>该标签不在当前数据版本中，已按原 ID 保留。</p>
                    </div>
                  </article>
                ),
              )
            : [0, 1].map((slot) => {
                const id = idea.baseTagIds[slot];
                const tag = id ? data.tagById.get(id) : undefined;
                const part = slot === 0 ? "left" : "right";
                const locked = config.locked[part];
                if (!tag) {
                  return (
                    <button
                      key={part}
                      className={`idea-tile empty-idea-tile tile-${slot + 1}`}
                      onClick={() => onRerollSlot(slot as 0 | 1)}
                    >
                      <Sparkles size={24} />
                      <strong>抽取方向 {slot === 0 ? "A" : "B"}</strong>
                      <span>点击填入一个词</span>
                    </button>
                  );
                }
                return (
                  <article
                    key={part}
                    className={`idea-tile color-${KIND_COLORS[tag.kind]} tile-${slot + 1}`}
                    data-kind={tag.kind}
                  >
                    <div className="tile-topline">
                      <span>方向 {slot === 0 ? "A" : "B"} · {KIND_LABELS[tag.kind]}</span>
                      <span className="tile-index">0{slot + 1}</span>
                    </div>
                    <div className="tile-copy">
                      <h2>{tag.labels.zh}</h2>
                      <p>{tag.labels.en}</p>
                    </div>
                    <div className="tile-actions">
                      <button
                        onClick={() => onToggleLock(part)}
                        aria-label={locked ? "解锁" : "锁定"}
                        title={locked ? "解锁" : "锁定"}
                      >
                        {locked ? <Lock size={15} /> : <Unlock size={15} />}
                      </button>
                      <button
                        onClick={() => onRerollSlot(slot as 0 | 1)}
                        disabled={locked}
                        aria-label="单独重抽"
                        title="单独重抽"
                      >
                        <RefreshCw size={15} />
                      </button>
                      <button
                        onClick={() => onExcludeTag(slot as 0 | 1, tag.id)}
                        disabled={locked}
                        aria-label="排除并重抽"
                        title="排除并重抽"
                      >
                        <Ban size={15} />
                      </button>
                    </div>
                    {locked ? (
                      <span className="pin-badge">
                        <Lock size={11} /> 已锁定
                      </span>
                    ) : null}
                  </article>
                );
              })}

          {!legacy && idea.mode === "challenge" && prompt ? (
            <article
              className="idea-tile color-amber tile-3 prompt-tile"
              data-kind="jamPrompt"
            >
              <div className="tile-topline">
                <span>开放命题</span>
                <span className="tile-index">03</span>
              </div>
              <div className="tile-copy">
                <h2>{prompt.labels.zh}</h2>
                <p>{prompt.labels.en}</p>
              </div>
              <div className="tile-actions">
                <button
                  onClick={() => onToggleLock("prompt")}
                  aria-label={config.locked.prompt ? "解锁" : "锁定"}
                >
                  {config.locked.prompt ? (
                    <Lock size={15} />
                  ) : (
                    <Unlock size={15} />
                  )}
                </button>
                <button
                  onClick={onRerollPrompt}
                  disabled={config.locked.prompt}
                  aria-label="重抽命题"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  onClick={() => onExcludePrompt(prompt.id)}
                  disabled={config.locked.prompt}
                  aria-label="排除并重抽命题"
                >
                  <Ban size={15} />
                </button>
              </div>
              {config.locked.prompt ? (
                <span className="pin-badge">
                  <Lock size={11} /> 已锁定
                </span>
              ) : null}
            </article>
          ) : !legacy && idea.mode === "challenge" ? (
            <article
              className="idea-tile color-amber tile-3 prompt-tile"
              data-kind="jamPrompt"
            >
              <div className="tile-topline">
                <span>开放命题</span>
                <span className="tile-index">03</span>
              </div>
              <div className="tile-copy">
                <h2>{idea.promptId ?? "尚未抽取"}</h2>
                <p>
                  {idea.promptId
                    ? "该命题不在当前数据版本中，已按原 ID 保留。"
                    : "重抽命题以填入一个开放命题。"}
                </p>
              </div>
              <div className="tile-actions">
                <button onClick={onRerollPrompt} aria-label="重抽命题">
                  <RefreshCw size={15} />
                </button>
              </div>
            </article>
          ) : null}
        </motion.section>
      </AnimatePresence>

      {legacy ? (
        <button className="generate-button" onClick={onExtractLegacy}>
          <Sparkles size={18} />
          <span>提取基础方向</span>
        </button>
      ) : idea.mode === "challenge" ? (
        <div className="challenge-actions">
          <button
            className="secondary-button"
            onClick={onRerollBase}
            disabled={config.locked.left && config.locked.right}
          >
            <RefreshCw size={15} /> 重抽基础方向
          </button>
          <button
            className="secondary-button"
            onClick={onRerollPrompt}
            disabled={config.locked.prompt}
          >
            <RefreshCw size={15} /> 重抽命题
          </button>
          <button className="generate-button" onClick={onGenerate}>
            <Sparkles size={18} />
            <span>生成新挑战</span>
            <kbd>G</kbd>
          </button>
        </div>
      ) : (
        <button className="generate-button" onClick={onGenerate}>
          <Sparkles size={18} />
          <span>重抽未锁定方向</span>
          <kbd>G</kbd>
        </button>
      )}
    </main>
  );
}
