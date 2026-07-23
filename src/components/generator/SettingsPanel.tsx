import { Check, Dice5, SlidersHorizontal } from "lucide-react";
import { TEMPLATES } from "../../engine/templates";
import type { GeneratorConfig, GeneratorMode } from "../../engine/types";

interface SettingsPanelProps {
  config: GeneratorConfig;
  onChange: (next: GeneratorConfig) => void;
}

const modes = Object.keys(TEMPLATES) as GeneratorMode[];

export function SettingsPanel({ config, onChange }: SettingsPanelProps) {
  const patch = (next: Partial<GeneratorConfig>) =>
    onChange({ ...config, ...next });

  return (
    <aside className="settings-panel panel">
      <div className="panel-heading">
        <span className="eyebrow">
          <SlidersHorizontal size={13} /> 生成设置
        </span>
        <span className="keyboard-hint">E</span>
      </div>

      <div className="control-group">
        <label>模式</label>
        <div className="mode-list">
          {modes.map((mode) => {
            const template = TEMPLATES[mode];
            return (
              <button
                key={mode}
                className={config.mode === mode ? "selected" : ""}
                onClick={() => patch({ mode, pinnedBySlot: {} })}
              >
                <span>
                  <strong>{template.label}</strong>
                  <small>{template.description}</small>
                </span>
                {config.mode === mode ? <Check size={16} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="control-group range-control">
        <div className="control-label-row">
          <label htmlFor="surprise">惊喜程度</label>
          <output htmlFor="surprise">{Math.round(config.surprise * 100)}%</output>
        </div>
        <input
          id="surprise"
          type="range"
          min="0"
          max="100"
          value={Math.round(config.surprise * 100)}
          onChange={(event) => patch({ surprise: Number(event.target.value) / 100 })}
        />
        <div className="range-ends">
          <span>更连贯</span>
          <span>更意外</span>
        </div>
      </div>

      <div className="control-group range-control">
        <div className="control-label-row">
          <label htmlFor="scope">项目规模</label>
          <output htmlFor="scope">{Math.round(config.targetScope * 100)}%</output>
        </div>
        <input
          id="scope"
          type="range"
          min="0"
          max="100"
          value={Math.round(config.targetScope * 100)}
          onChange={(event) =>
            patch({ targetScope: Number(event.target.value) / 100 })
          }
        />
        <div className="range-ends">
          <span>周末原型</span>
          <span>长期项目</span>
        </div>
      </div>

      <div className="control-group">
        <label className="switch-row">
          <span>
            <strong>避免近期重复</strong>
            <small>对最近 100 次组合使用指数衰减</small>
          </span>
          <input
            type="checkbox"
            checked={config.avoidRecent}
            onChange={(event) => patch({ avoidRecent: event.target.checked })}
          />
        </label>
      </div>

      <div className="control-group seed-control">
        <label htmlFor="seed">随机种子</label>
        <div>
          <input
            id="seed"
            value={config.seed}
            onChange={(event) => patch({ seed: event.target.value })}
            spellCheck={false}
          />
          <button
            className="icon-button"
            onClick={() =>
              patch({ seed: Math.random().toString(36).slice(2, 10) })
            }
            aria-label="随机生成种子"
          >
            <Dice5 size={16} />
          </button>
        </div>
      </div>

      <div className="settings-footnote">
        <span className="status-dot" />
        <span>同一数据版本、设置和种子可复现结果</span>
      </div>
    </aside>
  );
}

