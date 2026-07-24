export const TAG_KINDS = [
  "genre",
  "mechanic",
  "theme",
  "setting",
  "mood",
  "goal",
  "constraint",
  "presentation",
  "perspective",
  "jamPrompt",
] as const;

export type TagKind = (typeof TAG_KINDS)[number];
export type RelationKind =
  | "synergy"
  | "tension"
  | "redundancy"
  | "soft-conflict"
  | "hard-conflict";
export type GeneratorMode = "quick" | "jam" | "prototype" | "wild";

export interface TagNode {
  id: string;
  labels: {
    en: string;
    zh: string;
  };
  kind: TagKind;
  aliases?: string[];
  baseWeight: number;
  rarity: number;
  scopeImpact: number;
  implementationRisk: number;
  clusters: string[];
  family?: string;
  compositeOf?: string[];
  deprecatedBy?: string;
  generationEligible?: boolean;
  facets?: string[];
  sourceRefs: string[];
  enabled: boolean;
}

export interface TagRelation {
  a: string;
  b: string;
  kind: RelationKind;
  strength: number;
  confidence: number;
  note?: string;
}

export interface CompiledEdge {
  compatibility: number;
  tension: number;
  redundancy: number;
  softConflict: number;
  hardConflict: boolean;
  confidence: number;
}

export interface CompiledData {
  tags: TagNode[];
  relations: TagRelation[];
  tagById: Map<string, TagNode>;
  tagsByKind: Map<TagKind, TagNode[]>;
  edgeByPair: Map<string, CompiledEdge>;
  clusterIndex: Map<string, Set<string>>;
}

export interface TemplateSlot {
  id: string;
  kind: TagKind;
  label: string;
  optional?: boolean;
}

export interface GeneratorTemplate {
  id: GeneratorMode;
  label: string;
  description: string;
  slots: TemplateSlot[];
  selectionOrder: string[];
}

export interface GeneratorConfig {
  mode: GeneratorMode;
  surprise: number;
  targetScope: number;
  seed: string;
  pinnedBySlot: Record<string, string>;
  excludedTagIds: string[];
  avoidRecent: boolean;
}

export interface IdeaHistoryEntry {
  id: string;
  tagIds: string[];
  createdAt: number;
}

export interface PairSignal {
  a: string;
  b: string;
  kind: "synergy" | "tension" | "conflict" | "redundancy";
  strength: number;
}

export interface IdeaMetrics {
  coherence: number;
  novelty: number;
  tension: number;
  scope: number;
  scopeFit: number;
  risk: number;
  freshness: number;
  total: number;
}

export interface IdeaCandidate {
  slots: Record<string, string>;
  tagIds: string[];
}

export interface GeneratedIdea extends IdeaCandidate {
  id: string;
  seed: string;
  mode: GeneratorMode;
  metrics: IdeaMetrics;
  signals: PairSignal[];
  createdAt: number;
}
