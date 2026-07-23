import { Activity, ArrowUpRight, CircleGauge, Scale } from "lucide-react";
import { compiledData } from "../../data";
import type { GeneratedIdea } from "../../engine/types";
import { metricLevel } from "../../utils/format";

interface MetricsPanelProps {
  idea: GeneratedIdea;
}

const metrics = [
  { key: "coherence", label: "连贯性", icon: CircleGauge },
  { key: "novelty", label: "意外程度", icon: Activity },
  { key: "scope", label: "项目规模", icon: Scale },
  { key: "risk", label: "实现风险", icon: ArrowUpRight },
] as const;

export function MetricsPanel({ idea }: MetricsPanelProps) {
  return (
    <aside className="metrics-panel panel">
      <div className="panel-heading">
        <span className="eyebrow">组合特征</span>
        <span className="score-chip">{Math.round(idea.metrics.total * 100)}</span>
      </div>

      <div className="metric-list">
        {metrics.map(({ key, label, icon: Icon }) => {
          const value = idea.metrics[key];
          return (
            <div className="metric" key={key}>
              <div className="metric-label">
                <span><Icon size={14} />{label}</span>
                <strong>{metricLevel(value)}</strong>
              </div>
              <div className="meter" aria-label={`${label} ${Math.round(value * 100)}%`}>
                <span style={{ width: `${Math.round(value * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="signal-section">
        <h3>关系依据</h3>
        {idea.signals.length === 0 ? (
          <p className="empty-note">这组词之间没有强关系，属于开放式组合。</p>
        ) : (
          <ul>
            {idea.signals.slice(0, 4).map((signal) => {
              const a = compiledData.tagById.get(signal.a);
              const b = compiledData.tagById.get(signal.b);
              if (!a || !b) return null;
              const label =
                signal.kind === "synergy"
                  ? "强关联"
                  : signal.kind === "tension"
                    ? "创意反差"
                    : signal.kind === "redundancy"
                      ? "语义接近"
                      : "轻微冲突";
              return (
                <li key={`${signal.a}:${signal.b}`}>
                  <span className={`signal-dot ${signal.kind}`} />
                  <div>
                    <small>{label}</small>
                    <strong>{a.labels.zh} × {b.labels.zh}</strong>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="scope-note">
        <span>规模拟合</span>
        <strong>{Math.round(idea.metrics.scopeFit * 100)}%</strong>
        <p>这是组合属性，不是“游戏质量分”。</p>
      </div>
    </aside>
  );
}

