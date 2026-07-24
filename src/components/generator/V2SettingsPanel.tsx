import { Check, Dice5, SlidersHorizontal } from "lucide-react";
import { createRandomSeed } from "../../engine/rng";
import type {
  BaseKindChoice,
  GeneratorConfigV2,
  GeneratorModeV2,
} from "../../engine/v2-types";

interface Props {
  config: GeneratorConfigV2;
  onChange: (next: GeneratorConfigV2) => void;
}

const modes: Array<{
  id: GeneratorModeV2;
  label: string;
  description: string;
}> = [
  {
    id: "single",
    label: "逐词模式",
    description: "两个槽位分别抽取，保留喜欢的方向再继续碰撞。",
  },
  {
    id: "challenge",
    label: "挑战模式",
    description: "基础方向与开放命题一次出现，但彼此独立抽取。",
  },
];

const kindOptions: Array<{ value: BaseKindChoice; label: string }> = [
  { value: "gameplay", label: "类型 / 机制" },
  { value: "any", label: "任意补充" },
  { value: "genre", label: "类型" },
  { value: "mechanic", label: "机制" },
  { value: "theme", label: "主题" },
  { value: "mood", label: "氛围" },
  { value: "presentation", label: "表现" },
  { value: "perspective", label: "视角" },
];

export function V2SettingsPanel({ config, onChange }: Props) {
  const patch = (next: Partial<GeneratorConfigV2>) =>
    onChange({ ...config, ...next });

  const patchKind = (index: 0 | 1, value: BaseKindChoice) => {
    const selectedKinds: [BaseKindChoice, BaseKindChoice] = [
      ...config.selectedKinds,
    ];
    selectedKinds[index] = value;
    patch({ selectedKinds });
  };

  return (
    <aside className="settings-panel panel">
      <div className="panel-heading">
        <span className="eyebrow">
          <SlidersHorizontal size={13} /> 生成方式
        </span>
        <span className="keyboard-hint">E2</span>
      </div>

      <div className="control-group">
        <label>模式</label>
        <div className="mode-list">
          {modes.map((mode) => (
            <button
              key={mode.id}
              className={config.mode === mode.id ? "selected" : ""}
              onClick={() =>
                patch({
                  mode: mode.id,
                  locked: { left: false, right: false, prompt: false },
                })
              }
            >
              <span>
                <strong>{mode.label}</strong>
                <small>{mode.description}</small>
              </span>
              {config.mode === mode.id ? <Check size={16} /> : null}
            </button>
          ))}
        </div>
      </div>

      {config.mode === "single" ? (
        <div className="control-group slot-kind-controls">
          <label>
            方向 A
            <select
              value={config.selectedKinds[0]}
              onChange={(event) =>
                patchKind(0, event.target.value as BaseKindChoice)
              }
            >
              {kindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            方向 B
            <select
              value={config.selectedKinds[1]}
              onChange={(event) =>
                patchKind(1, event.target.value as BaseKindChoice)
              }
            >
              {kindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="control-group">
        <label className="switch-row">
          <span>
            <strong>避免近期重复</strong>
            <small>分别控制基础词、词对、命题和语义家族。</small>
          </span>
          <input
            type="checkbox"
            checked={config.avoidRecent}
            onChange={(event) => patch({ avoidRecent: event.target.checked })}
          />
        </label>
      </div>

      <div className="control-group seed-control">
        <label htmlFor="seed-v2">随机种子</label>
        <div>
          <input
            id="seed-v2"
            value={config.seed}
            onChange={(event) => patch({ seed: event.target.value })}
            spellCheck={false}
          />
          <button
            className="icon-button"
            onClick={() => patch({ seed: createRandomSeed() })}
            aria-label="随机生成种子"
          >
            <Dice5 size={16} />
          </button>
        </div>
      </div>

      <div className="settings-footnote">
        <span className="status-dot" />
        <span>命题不会参与基础方向评分；相同数据与种子可复现。</span>
      </div>
    </aside>
  );
}
