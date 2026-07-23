import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import { compiledData } from "../../data";
import { KIND_COLORS } from "../../utils/format";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  kind: string;
  radius: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relation: string;
  strength: number;
}

interface GraphCanvasProps {
  centerId: string;
  onSelect: (tagId: string) => void;
}

export default function GraphCanvas({ centerId, onSelect }: GraphCanvasProps) {
  const [tick, setTick] = useState(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);

  const graph = useMemo(() => {
    const related = compiledData.relations
      .filter((relation) => relation.a === centerId || relation.b === centerId)
      .sort((a, b) => b.strength * b.confidence - a.strength * a.confidence)
      .slice(0, 28);
    const ids = [
      centerId,
      ...related.map((relation) =>
        relation.a === centerId ? relation.b : relation.a,
      ),
    ];
    const nodes = [...new Set(ids)]
      .map((id) => compiledData.tagById.get(id))
      .filter((tag) => tag !== undefined)
      .map<GraphNode>((tag) => ({
        id: tag.id,
        label: tag.labels.zh,
        kind: tag.kind,
        radius: tag.id === centerId ? 34 : 18,
      }));
    const links = related.map<GraphLink>((relation) => ({
      source: relation.a,
      target: relation.b,
      relation: relation.kind,
      strength: relation.strength * relation.confidence,
    }));
    return { nodes, links };
  }, [centerId]);

  useEffect(() => {
    nodesRef.current = graph.nodes.map((node) => ({ ...node }));
    linksRef.current = graph.links.map((link) => ({ ...link }));
    const simulation = forceSimulation(nodesRef.current)
      .force("charge", forceManyBody().strength(-160))
      .force("center", forceCenter(400, 270))
      .force("collision", forceCollide<GraphNode>().radius((node) => node.radius + 18))
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(linksRef.current)
          .id((node) => node.id)
          .distance((link) => 78 + (1 - link.strength) * 90)
          .strength((link) => Math.max(0.12, link.strength)),
      )
      .alphaDecay(0.05)
      .on("tick", () => setTick((value) => value + 1));
    return () => {
      simulation.stop();
    };
  }, [graph]);

  void tick;

  return (
    <div className="graph-canvas">
      <svg viewBox="0 0 800 540" role="img" aria-label="Tag 关系图">
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
                className={link.relation}
                opacity={0.3 + link.strength * 0.55}
              />
            );
          })}
        </g>
        <g className="graph-nodes">
          {nodesRef.current.map((node) => (
            <g
              key={node.id}
              transform={`translate(${node.x ?? 0} ${node.y ?? 0})`}
              className={`graph-node color-${KIND_COLORS[node.kind as keyof typeof KIND_COLORS]}`}
              onClick={() => onSelect(node.id)}
              role="button"
              tabIndex={0}
            >
              <circle r={node.radius} />
              <text textAnchor="middle" dy={node.id === centerId ? 4 : 3}>
                {node.label.length > 6 ? `${node.label.slice(0, 6)}…` : node.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
