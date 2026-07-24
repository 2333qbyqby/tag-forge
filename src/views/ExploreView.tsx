import { ArrowRight, Orbit, Plus } from "lucide-react";
import { useState } from "react";
import { compiledData } from "../data";
import GraphCanvas from "../components/graph/GraphCanvas";
import { KIND_LABELS } from "../utils/format";

interface ExploreViewProps {
  onUseTag: (tagId: string) => void;
}

export default function ExploreView({ onUseTag }: ExploreViewProps) {
  const [centerId, setCenterId] = useState("time-loop");
  const center = compiledData.tagById.get(centerId)!;
  const neighbors = compiledData.relations
    .filter((relation) => relation.a === centerId || relation.b === centerId)
    .sort((a, b) => b.strength * b.confidence - a.strength * a.confidence)
    .slice(0, 8);

  return (
    <main className="view-shell">
      <header className="view-hero explore-hero">
        <div>
          <span className="eyebrow">GRAPH EXPLORER</span>
          <h1>在游戏设计空间里散步。</h1>
          <p>点击节点切换中心，实线表示关联，虚线表示创意反差。</p>
        </div>
        <button
          className="primary-compact"
          onClick={() => onUseTag(centerId)}
          disabled={!center.generationEligible || Boolean(center.deprecatedBy)}
          title={
            center.generationEligible && !center.deprecatedBy
              ? "带入逐词模式"
              : "资料库保留标签，不参与 Engine 2 生成"
          }
        >
          <Plus size={16} /> 用作生成锚点
        </button>
      </header>

      <section className="explore-layout">
        <div className="graph-panel panel">
          <div className="graph-panel-heading">
            <span><Orbit size={15} /> {center.labels.zh}</span>
            <small>{KIND_LABELS[center.kind]} · {neighbors.length} 条显式关系</small>
          </div>
          <GraphCanvas centerId={centerId} onSelect={setCenterId} />
          <div className="graph-legend">
            <span><i className="line-solid" /> 强关联</span>
            <span><i className="line-dashed" /> 创意反差</span>
            <span><i className="line-faint" /> 冲突 / 接近</span>
          </div>
        </div>

        <aside className="neighbor-panel panel">
          <span className="eyebrow">NEIGHBORS</span>
          <h2>{center.labels.zh}</h2>
          <p>{center.labels.en}</p>
          <div className="cluster-list">
            {center.clusters.map((cluster) => <span key={cluster}>{cluster}</span>)}
          </div>
          <ul>
            {neighbors.map((relation) => {
              const otherId = relation.a === centerId ? relation.b : relation.a;
              const other = compiledData.tagById.get(otherId);
              if (!other) return null;
              return (
                <li key={`${relation.a}:${relation.b}`}>
                  <button onClick={() => setCenterId(otherId)}>
                    <span>
                      <small>{relation.kind}</small>
                      <strong>{other.labels.zh}</strong>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </section>
    </main>
  );
}
