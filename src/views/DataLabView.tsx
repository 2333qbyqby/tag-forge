import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { FlaskConical } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadOfficialRegistry, officialAssetUrl } from "../packs/official";
import type {
  AnalysisEdge,
  CompiledPack,
  OfficialAnalysis,
} from "../packs/types";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  radius: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
  sources: AnalysisEdge["sources"];
}

interface Props {
  pack: CompiledPack;
  onUseEntry: (entryId: string) => void;
}

export default function DataLabView({ pack, onUseEntry }: Props) {
  const [analysis, setAnalysis] = useState<OfficialAnalysis | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [centerId, setCenterId] = useState("");
  const [, setTick] = useState(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setAnalysis(null);
    loadOfficialRegistry()
      .then((registry) => fetch(officialAssetUrl(registry.analysisPath)))
      .then((response) => {
        if (!response.ok) throw new Error("无法加载官方分析文件。");
        return response.json() as Promise<OfficialAnalysis>;
      })
      .then((value) => {
        if (
          value.manifest.pack.packId !== pack.ref.packId ||
          value.manifest.pack.dataVersion !== pack.ref.dataVersion ||
          value.manifest.pack.checksum !== pack.ref.checksum
        ) {
          throw new Error("分析文件与当前官方数据集不匹配。");
        }
        if (!cancelled) {
          setAnalysis(value);
          const top = [...value.metrics].sort(
            (left, right) => right.pageRank - left.pageRank,
          )[0];
          setCenterId(top?.id ?? pack.data.entries[0]?.id ?? "");
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "分析加载失败。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pack, retry]);

  const graph = useMemo(() => {
    if (!analysis || !centerId) return { nodes: [], links: [] };
    const related = analysis.edges
      .filter((edge) => edge.source === centerId || edge.target === centerId)
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 28);
    const ids = new Set([
      centerId,
      ...related.flatMap((edge) => [edge.source, edge.target]),
    ]);
    const nodes = [...ids]
      .map((id) => pack.entryById.get(id))
      .filter((entry) => entry !== undefined)
      .map<GraphNode>((entry) => ({
        id: entry.id,
        label: entry.labels.zh,
        radius: entry.id === centerId ? 32 : 18,
      }));
    const links = related.map<GraphLink>((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      sources: edge.sources,
    }));
    return { nodes, links };
  }, [analysis, centerId, pack]);

  useEffect(() => {
    nodesRef.current = graph.nodes.map((node) => ({ ...node }));
    linksRef.current = graph.links.map((link) => ({ ...link }));
    const simulation = forceSimulation(nodesRef.current)
      .force("charge", forceManyBody().strength(-150))
      .force("center", forceCenter(400, 260))
      .force(
        "collision",
        forceCollide<GraphNode>().radius((node) => node.radius + 14),
      )
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(linksRef.current)
          .id((node) => node.id)
          .distance((link) => 80 + (1 - link.weight) * 90)
          .strength((link) => Math.max(0.1, link.weight)),
      )
      .alphaDecay(0.06)
      .on("tick", () => setTick((value) => value + 1));
    return () => {
      simulation.stop();
    };
  }, [graph]);

  if (error) {
    return (
      <main className="view-shell">
        <section className="panel empty-state">
          <h1>数据实验室不可用</h1>
          <p>{error}</p>
          <button className="secondary-button" onClick={() => setRetry((value) => value + 1)}>
            重新加载
          </button>
        </section>
      </main>
    );
  }
  if (!analysis) {
    return (
      <main className="view-shell">
        <section className="panel empty-state">
          <h1>正在加载官方分析…</h1>
        </section>
      </main>
    );
  }

  const center = pack.entryById.get(centerId);
  const topPageRank = [...analysis.metrics]
    .sort((left, right) => right.pageRank - left.pageRank)
    .slice(0, 8);
  const topBridges = [...analysis.metrics]
    .sort((left, right) => right.betweenness - left.betweenness)
    .slice(0, 8);
  const isolated = analysis.metrics.filter((metric) => metric.degree === 0);
  const topFacets = Object.entries(analysis.facetCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12);

  return (
    <main className="view-shell">
      <header className="view-hero">
        <span className="eyebrow">
          <FlaskConical size={14} /> OFFICIAL DATA LAB
        </span>
        <h1>观察官方数据集的结构。</h1>
        <p>图谱由 Family、Composite、Facet 与固定 Seed 共现确定性派生，不参与生成。</p>
      </header>

      <section className="lab-summary-grid">
        <article className="panel">
          <strong>{analysis.manifest.nodeCount}</strong>
          <span>有效节点</span>
        </article>
        <article className="panel">
          <strong>{analysis.manifest.edgeCount}</strong>
          <span>派生边</span>
        </article>
        <article className="panel">
          <strong>{analysis.manifest.communityCount}</strong>
          <span>Louvain 社区</span>
        </article>
        <article className="panel">
          <strong>{Object.keys(analysis.facetCounts).length}</strong>
          <span>Facet</span>
        </article>
      </section>

      <section className="explore-layout">
        <div className="graph-panel panel">
          <div className="graph-panel-heading">
            <span>{center?.labels.zh ?? centerId}</span>
            <button
              className="primary-compact"
              onClick={() => center && onUseEntry(center.id)}
            >
              用作生成锚点
            </button>
          </div>
          <div className="graph-canvas">
            <svg viewBox="0 0 800 520" role="img" aria-label="官方派生图谱">
              <g className="graph-links">
                {linksRef.current.map((link, index) => {
                  const source = link.source as GraphNode;
                  const target = link.target as GraphNode;
                  return (
                    <line
                      key={`${source.id}:${target.id}:${index}`}
                      x1={source.x ?? 0}
                      y1={source.y ?? 0}
                      x2={target.x ?? 0}
                      y2={target.y ?? 0}
                      opacity={0.25 + link.weight * 0.65}
                    />
                  );
                })}
              </g>
              <g className="graph-nodes">
                {nodesRef.current.map((node) => (
                  <g
                    key={node.id}
                    transform={`translate(${node.x ?? 0} ${node.y ?? 0})`}
                    className="graph-node"
                    role="button"
                    tabIndex={0}
                    onClick={() => setCenterId(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setCenterId(node.id);
                      }
                    }}
                  >
                    <title>{node.label}</title>
                    <circle r={node.radius} />
                    <text textAnchor="middle" dy="4">
                      {node.label.length > 6
                        ? `${node.label.slice(0, 6)}…`
                        : node.label}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
          <div className="graph-neighbor-list" aria-label="当前节点的相关词条">
            {graph.nodes
              .filter((node) => node.id !== centerId)
              .map((node) => (
                <button key={node.id} onClick={() => setCenterId(node.id)}>
                  {node.label}
                </button>
              ))}
          </div>
        </div>

        <aside className="neighbor-panel panel lab-rankings">
          <span className="eyebrow">CENTRALITY</span>
          <h2>中心节点</h2>
          <ol>
            {topPageRank.map((metric) => (
              <li key={metric.id}>
                <button onClick={() => setCenterId(metric.id)}>
                  <span>{pack.entryById.get(metric.id)?.labels.zh ?? metric.id}</span>
                  <small>{metric.pageRank.toFixed(4)}</small>
                </button>
              </li>
            ))}
          </ol>
          <span className="eyebrow">BRIDGES</span>
          <h2>桥接节点</h2>
          <ol>
            {topBridges.map((metric) => (
              <li key={metric.id}>
                <button onClick={() => setCenterId(metric.id)}>
                  <span>{pack.entryById.get(metric.id)?.labels.zh ?? metric.id}</span>
                  <small>{metric.betweenness.toFixed(4)}</small>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="panel community-panel">
        <span className="eyebrow">COMMUNITIES</span>
        <div className="community-grid">
          {analysis.communities.map((community) => (
            <article key={community.id}>
              <strong>{community.label}</strong>
              <span>{community.memberIds.length} 个节点</span>
              <p>
                {community.memberIds
                  .slice(0, 8)
                  .map((id) => pack.entryById.get(id)?.labels.zh ?? id)
                  .join("、")}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="lab-distribution-grid">
        <article className="panel distribution-card">
          <span className="eyebrow">GROUPS</span>
          <h2>词库分组</h2>
          <dl>
            <div><dt>设计坐标</dt><dd>{analysis.groupCounts.design}</dd></div>
            <div><dt>意象元素</dt><dd>{analysis.groupCounts.motif}</dd></div>
          </dl>
          <p>分组统计只用于分析展示，不影响生成概率。</p>
        </article>
        <article className="panel distribution-card">
          <span className="eyebrow">CATEGORIES</span>
          <h2>类别分布</h2>
          <dl>
            {Object.entries(analysis.categoryCounts).map(([id, count]) => (
              <div key={id}>
                <dt>{pack.categoryById.get(id)?.labels.zh ?? id}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
        </article>
        <article className="panel distribution-card">
          <span className="eyebrow">FACETS</span>
          <h2>高频 Facet</h2>
          <dl>
            {topFacets.map(([id, count]) => (
              <div key={id}>
                <dt>{id}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
        </article>
        <article className="panel distribution-card">
          <span className="eyebrow">RECIPE CO-OCCURRENCE</span>
          <h2>Recipe 共现</h2>
          <dl>
            {Object.entries(analysis.recipeCooccurrence).map(([id, count]) => (
              <div key={id}>
                <dt>{pack.recipeById.get(id)?.labels.zh ?? id}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
        </article>
        <article className="panel distribution-card">
          <span className="eyebrow">ISOLATED</span>
          <h2>孤立节点</h2>
          {isolated.length === 0 ? (
            <p>当前派生图没有孤立节点。</p>
          ) : (
            <p>
              {isolated
                .map(
                  (metric) =>
                    pack.entryById.get(metric.id)?.labels.zh ?? metric.id,
                )
                .join("、")}
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
