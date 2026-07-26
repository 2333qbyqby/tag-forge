import {
  Ban,
  Copy,
  Dice5,
  Lock,
  RefreshCw,
  Share2,
  Sparkles,
  Star,
  Undo2,
  Unlock,
  X,
} from "lucide-react";
import type {
  CompiledPack,
  GeneratorSettings,
  ResultDisplaySource,
  ResultSnapshot,
} from "../../packs/types";

interface Props {
  pack: CompiledPack;
  settings: GeneratorSettings;
  result: ResultSnapshot;
  resultSource: ResultDisplaySource;
  isFavorite: boolean;
  settingsDirty: boolean;
  generatorError: string;
  onSettingsChange: (settings: GeneratorSettings) => void;
  onGenerate: () => void;
  onRerollSlot: (slotId: string) => void;
  onToggleLock: (slotId: string) => void;
  onExclude: (slotId: string, itemId: string) => void;
  onFavorite: () => void;
  onCopy: () => void;
  onShare: () => void;
  onRandomSeed: () => void;
  onRemoveExclusion: (itemId: string) => void;
  onUndoExclusion: () => void;
  onClearExclusions: () => void;
  onResetGeneration: () => void;
}

export function PackWorkbench({
  pack,
  settings,
  result,
  resultSource,
  isFavorite,
  settingsDirty,
  generatorError,
  onSettingsChange,
  onGenerate,
  onRerollSlot,
  onToggleLock,
  onExclude,
  onFavorite,
  onCopy,
  onShare,
  onRandomSeed,
  onRemoveExclusion,
  onUndoExclusion,
  onClearExclusions,
  onResetGeneration,
}: Props) {
  const recipe = pack.recipeById.get(settings.recipeId);
  const resultRecipe = pack.recipeById.get(result.recipeId);
  const readonly = Boolean(result.readOnly || !resultRecipe);
  const slotDefinition = (slotId: string) =>
    recipe?.slots.find((slot) => slot.id === slotId);
  const exclusionLabel = (itemId: string) =>
    pack.entryById.get(itemId)?.labels.zh ??
    pack.promptById.get(itemId)?.labels.zh ??
    itemId;
  const sourceCopy =
    resultSource === "shared"
        ? readonly
          ? {
              eyebrow: "SHARED SNAPSHOT / READ ONLY",
              description: "当前数据包与分享快照不匹配，可继续复制或收藏。",
            }
          : {
              eyebrow: "SHARED SNAPSHOT",
              description: "已找到匹配的数据包，可以继续调整或生成。",
            }
        : resultSource === "favorite"
          ? readonly
            ? {
                eyebrow: "FAVORITE SNAPSHOT / READ ONLY",
                description: "缺少匹配的数据包，当前按收藏快照只读展示。",
              }
            : {
                eyebrow: `FAVORITE / ${resultRecipe?.labels.en ?? result.recipeId}`,
                description: "已恢复收藏快照的 Recipe 与 Seed。",
              }
          : resultSource === "history"
            ? {
                eyebrow: `RECENT / ${resultRecipe?.labels.en ?? result.recipeId}`,
                description: "已恢复历史结果的 Recipe 与 Seed。",
              }
          : {
              eyebrow: resultRecipe?.labels.en ?? "RESULT SNAPSHOT",
              description: resultRecipe?.description.zh ?? "",
            };

  return (
    <div className="pack-workbench">
      <aside className="settings-panel panel">
        <div className="panel-heading">
          <span className="eyebrow">RECIPE / DATA PACK</span>
          <span
            className="keyboard-hint data-version-badge"
            aria-label={`数据更新：${pack.data.manifest.dataVersion}`}
          >
            <span>数据更新</span>
            <span>{pack.data.manifest.dataVersion}</span>
          </span>
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
                {(["design", "motif"] as const).map((group) => {
                  const categoryIds = (slot.categoryIds ?? []).filter(
                    (categoryId) => pack.categoryById.get(categoryId)?.group === group,
                  );
                  return categoryIds.length > 0 ? (
                    <optgroup
                      key={group}
                      label={group === "design" ? "设计坐标" : "意象元素"}
                    >
                      {categoryIds.map((categoryId) => (
                        <option key={categoryId} value={categoryId}>
                          {pack.categoryById.get(categoryId)?.labels.zh ?? categoryId}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
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

        <div className="control-group exclusion-control">
          <div className="control-label-row">
            <div>
              <strong>已排除 {settings.excludedItemIds.length} 项</strong>
              <small>排除项作用于当前数据包的后续生成。</small>
            </div>
            {settings.excludedItemIds.length > 0 ? (
              <button
                className="text-button"
                onClick={onUndoExclusion}
                aria-label="撤销最近一次排除"
              >
                <Undo2 size={13} /> 撤销
              </button>
            ) : null}
          </div>
          {settings.excludedItemIds.length > 0 ? (
            <>
              <div className="exclusion-list">
                {settings.excludedItemIds.map((itemId) => (
                  <span key={itemId}>
                    {exclusionLabel(itemId)}
                    <button
                      onClick={() => onRemoveExclusion(itemId)}
                      aria-label={`恢复 ${exclusionLabel(itemId)}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <button className="text-button danger-text" onClick={onClearExclusions}>
                清空全部排除
              </button>
            </>
          ) : (
            <small className="empty-note">尚未排除任何 Entry 或 Prompt。</small>
          )}
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
          <span>
            {settingsDirty
              ? "设置已更新，将在下次生成时生效。"
              : "数据与运算均留在当前浏览器。"}
          </span>
        </div>
      </aside>

      <main className="idea-workspace">
        <div className="idea-toolbar">
          <div>
            <span className="eyebrow">
              {sourceCopy.eyebrow}
            </span>
            <p>{sourceCopy.description}</p>
          </div>
          <div className="idea-toolbar-actions">
            <button className="secondary-button" onClick={onCopy}>
              <Copy size={15} /> <span>复制文本</span>
            </button>
            <button
              className={`secondary-button ${isFavorite ? "is-favorite" : ""}`}
              onClick={onFavorite}
            >
              <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
              <span>{isFavorite ? "已收藏" : "收藏"}</span>
            </button>
            <button
              className="icon-button"
              onClick={onShare}
              aria-label="复制分享链接"
            >
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

        {generatorError ? (
          <section className="generator-error" role="alert">
            <div>
              <strong>当前设置无法完成生成</strong>
              <p>{generatorError}</p>
            </div>
            <button className="secondary-button" onClick={onResetGeneration}>
              恢复可用设置
            </button>
          </section>
        ) : null}

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
