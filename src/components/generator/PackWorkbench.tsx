import {
  Ban,
  Copy,
  Dice5,
  Lock,
  RefreshCw,
  Share2,
  Sparkles,
  Star,
  Unlock,
} from "lucide-react";
import type {
  CompiledPack,
  GeneratorSettings,
  ResultSnapshotV1,
} from "../../packs/types";

interface Props {
  pack: CompiledPack;
  settings: GeneratorSettings;
  result: ResultSnapshotV1;
  isFavorite: boolean;
  copied: boolean;
  onSettingsChange: (settings: GeneratorSettings) => void;
  onGenerate: () => void;
  onRerollSlot: (slotId: string) => void;
  onToggleLock: (slotId: string) => void;
  onExclude: (slotId: string, itemId: string) => void;
  onFavorite: () => void;
  onCopy: () => void;
  onShare: () => void;
  onRandomSeed: () => void;
}

export function PackWorkbench({
  pack,
  settings,
  result,
  isFavorite,
  copied,
  onSettingsChange,
  onGenerate,
  onRerollSlot,
  onToggleLock,
  onExclude,
  onFavorite,
  onCopy,
  onShare,
  onRandomSeed,
}: Props) {
  const recipe = pack.recipeById.get(settings.recipeId);
  const resultRecipe = pack.recipeById.get(result.recipeId);
  const readonly = Boolean(result.readOnly || !resultRecipe);
  const slotDefinition = (slotId: string) =>
    recipe?.slots.find((slot) => slot.id === slotId);

  return (
    <div className="pack-workbench">
      <aside className="settings-panel panel">
        <div className="panel-heading">
          <span className="eyebrow">RECIPE / PACK V1</span>
          <span className="keyboard-hint">{pack.data.manifest.version}</span>
        </div>
        <div className="control-group">
          <label htmlFor="recipe-select">生成配方</label>
          <select
            id="recipe-select"
            value={settings.recipeId}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                recipeId: event.target.value,
                lockedSlotIds: [],
                categoryOverrides: {},
              })
            }
          >
            {pack.data.recipes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.labels.zh}
              </option>
            ))}
          </select>
          <small>{recipe?.description.zh}</small>
        </div>

        {recipe?.slots
          .filter((slot) => slot.allowCategoryOverride)
          .map((slot) => (
            <div className="control-group" key={slot.id}>
              <label htmlFor={`category-${slot.id}`}>{slot.labels.zh}类别</label>
              <select
                id={`category-${slot.id}`}
                value={settings.categoryOverrides[slot.id]?.[0] ?? ""}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    categoryOverrides: {
                      ...settings.categoryOverrides,
                      [slot.id]: event.target.value
                        ? [event.target.value]
                        : [],
                    },
                  })
                }
              >
                <option value="">配方默认</option>
                {slot.categoryIds?.map((categoryId) => (
                  <option key={categoryId} value={categoryId}>
                    {pack.categoryById.get(categoryId)?.labels.zh ?? categoryId}
                  </option>
                ))}
              </select>
            </div>
          ))}

        <div className="control-group">
          <label className="switch-row">
            <span>
              <strong>避免近期重复</strong>
              <small>Entry、Family 与词对分别冷却。</small>
            </span>
            <input
              type="checkbox"
              checked={settings.avoidRecent}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  avoidRecent: event.target.checked,
                })
              }
            />
          </label>
        </div>

        <div className="control-group seed-control">
          <label htmlFor="pack-seed">随机种子</label>
          <div>
            <input
              id="pack-seed"
              value={settings.seed}
              onChange={(event) =>
                onSettingsChange({ ...settings, seed: event.target.value })
              }
              spellCheck={false}
            />
            <button
              className="icon-button"
              onClick={onRandomSeed}
              aria-label="随机生成 Seed"
            >
              <Dice5 size={16} />
            </button>
          </div>
        </div>
        <div className="settings-footnote">
          <span className="status-dot" />
          <span>数据与运算均留在当前浏览器。</span>
        </div>
      </aside>

      <main className="idea-workspace">
        <div className="idea-toolbar">
          <div>
            <span className="eyebrow">
              {readonly ? "MIGRATED / READ ONLY" : resultRecipe?.labels.en}
            </span>
            <p>
              {readonly
                ? "旧结果已作为快照保留，不能继续重抽。"
                : resultRecipe?.description.zh}
            </p>
          </div>
          <div className="idea-toolbar-actions">
            <button className="secondary-button" onClick={onCopy}>
              <Copy size={15} /> {copied ? "已复制" : "复制"}
            </button>
            <button
              className={`secondary-button ${isFavorite ? "is-favorite" : ""}`}
              onClick={onFavorite}
            >
              <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
              {isFavorite ? "已收藏" : "收藏"}
            </button>
            <button className="icon-button" onClick={onShare} aria-label="分享">
              <Share2 size={16} />
            </button>
          </div>
        </div>

        <section
          className={`idea-grid pack-result-grid slots-${Math.min(6, result.slots.length)}`}
          aria-label="生成结果"
        >
          {result.slots.map((slot, index) => {
            const definition = slotDefinition(slot.slotId);
            const locked = settings.lockedSlotIds.includes(slot.slotId);
            const color =
              slot.source === "entries"
                ? pack.categoryById.get(slot.categoryId ?? "")?.color ?? "slate"
                : "amber";
            return (
              <article
                key={`${slot.slotId}:${slot.itemId}`}
                className={`idea-tile color-${color} tile-${index + 1}`}
              >
                <div className="tile-topline">
                  <span>
                    {definition?.labels.zh ??
                      pack.categoryById.get(slot.categoryId ?? "")?.labels.zh ??
                      "迁移内容"}
                  </span>
                  <span className="tile-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="tile-copy">
                  <h2>{slot.labels.zh}</h2>
                  <p>{slot.labels.en}</p>
                </div>
                {!readonly ? (
                  <div className="tile-actions">
                    <button
                      onClick={() => onToggleLock(slot.slotId)}
                      aria-label={locked ? "解锁" : "锁定"}
                    >
                      {locked ? <Lock size={15} /> : <Unlock size={15} />}
                    </button>
                    <button
                      onClick={() => onRerollSlot(slot.slotId)}
                      disabled={locked}
                      aria-label="单独重抽"
                    >
                      <RefreshCw size={15} />
                    </button>
                    <button
                      onClick={() => onExclude(slot.slotId, slot.itemId)}
                      disabled={locked}
                      aria-label="排除并重抽"
                    >
                      <Ban size={15} />
                    </button>
                  </div>
                ) : null}
                {locked && !readonly ? (
                  <span className="pin-badge">
                    <Lock size={11} /> 已锁定
                  </span>
                ) : null}
              </article>
            );
          })}
        </section>

        {!readonly ? (
          <button className="generate-button" onClick={onGenerate}>
            <Sparkles size={18} />
            <span>生成新组合</span>
            <kbd>G</kbd>
          </button>
        ) : null}
      </main>
    </div>
  );
}
