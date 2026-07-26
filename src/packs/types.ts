export interface LocalizedText {
  zh: string;
  en: string;
}

export interface PackManifest {
  packId: string;
  dataVersion: string;
  name: LocalizedText;
  description?: LocalizedText;
  defaultLocale: "zh" | "en";
  locales: Array<"zh" | "en">;
  files: {
    categories: "categories.csv";
    entries: "entries.csv";
    recipes: "recipes.json";
    prompts?: "prompts.csv";
    provenance?: "provenance.json";
  };
  official?: boolean;
}

export interface CategoryDefinition {
  id: string;
  labels: LocalizedText;
  group: "design" | "motif";
  color?: string;
  enabled: boolean;
}

export interface PackSource {
  id: string;
  kind: "game" | "taxonomy" | "jam";
  labels: LocalizedText;
  url: string;
  developer?: string;
  releaseYear?: number;
  retrievedAt: string;
}

export type ObservationChannel =
  | "visual"
  | "interactive"
  | "systemic"
  | "narrative"
  | "auditory"
  | "spatial";

export interface EntryObservation {
  entryId: string;
  sourceId: string;
  evidenceUrl: string;
  channels: ObservationChannel[];
  salience: "core" | "recurring";
  note: LocalizedText;
}

export interface EntryRecord {
  id: string;
  labels: LocalizedText;
  categoryId: string;
  aliases: string[];
  family: string;
  facets: string[];
  baseWeight: number;
  rarity: number;
  scopeImpact: number;
  implementationRisk: number;
  compositeOf?: string[];
  deprecatedBy?: string;
  sourceRefs?: string[];
  enabled?: boolean;
}

export interface PromptRecord {
  id: string;
  labels: LocalizedText;
  family: string;
  facets?: string[];
  motifs?: string[];
  type?: string;
  baseWeight: number;
  origin?: string;
  sourceRefs?: string[];
  enabled: boolean;
}

export interface PromptDeck {
  id: string;
  labels: LocalizedText;
  prompts: PromptRecord[];
}

export interface RecipeSlot {
  id: string;
  labels: LocalizedText;
  source: "entries" | "promptDeck";
  categoryIds?: string[];
  deckId?: string;
  required: boolean;
  allowCategoryOverride?: boolean;
  balanceBy?: "type";
}

export interface RecipeVariant {
  id: string;
  weight: number;
  slotCategoryIds: Record<string, string[]>;
}

export interface RecipeDefinition {
  id: string;
  labels: LocalizedText;
  description: LocalizedText;
  slots: RecipeSlot[];
  variants?: RecipeVariant[];
  cooldown: {
    entryWindow: number;
    familyWindow: number;
    pairWindow: number;
  };
  riskPolicy: "neutral" | "prefer-lower";
}

export interface DataPack {
  manifest: PackManifest;
  categories: CategoryDefinition[];
  entries: EntryRecord[];
  promptDecks: PromptDeck[];
  recipes: RecipeDefinition[];
  provenance?: {
    sources: PackSource[];
    observations: EntryObservation[];
  };
}

export interface PackRef {
  packId: string;
  dataVersion: string;
  checksum: string;
}

export interface PackCapabilities {
  generate: true;
  browse: true;
  history: true;
  export: true;
  analysis: boolean;
}

export type PackOrigin = "official" | "installed" | "temporary";

export interface LoadedPack {
  data: DataPack;
  ref: PackRef;
  origin: PackOrigin;
  capabilities: PackCapabilities;
}

export interface CompiledPack extends LoadedPack {
  categoryById: Map<string, CategoryDefinition>;
  entryById: Map<string, EntryRecord>;
  promptDeckById: Map<string, PromptDeck>;
  promptById: Map<string, PromptRecord>;
  recipeById: Map<string, RecipeDefinition>;
  entriesByCategory: Map<string, EntryRecord[]>;
  sourceById: Map<string, PackSource>;
  observationsByEntry: Map<string, EntryObservation[]>;
}

export interface ResultSlotSnapshot {
  slotId: string;
  source: "entries" | "promptDeck";
  itemId: string;
  categoryId?: string;
  deckId?: string;
  family: string;
  labels: LocalizedText;
}

export interface ResultSnapshot {
  id: string;
  pack: PackRef;
  recipeId: string;
  seed: string;
  variantId?: string;
  slots: ResultSlotSnapshot[];
  createdAt: number;
  readOnly?: boolean;
}

export type ResultDisplaySource =
  | "generated"
  | "history"
  | "favorite"
  | "shared";

export interface GeneratorSettings {
  recipeId: string;
  seed: string;
  avoidRecent: boolean;
  lockedSlotIds: string[];
  excludedItemIds: string[];
  categoryOverrides: Record<string, string[]>;
}

export interface HistoryEntry {
  result: ResultSnapshot;
}

export interface PackValidationIssue {
  level: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface PackValidationReport {
  valid: boolean;
  issues: PackValidationIssue[];
  summary: {
    categories: number;
    entries: number;
    prompts: number;
    recipes: number;
  };
}

export interface OfficialAnalysisManifest {
  pack: PackRef;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
}

export interface AnalysisEdge {
  source: string;
  target: string;
  weight: number;
  sources: Array<"family" | "composite" | "facet" | "cooccurrence">;
}

export interface AnalysisNodeMetric {
  id: string;
  degree: number;
  weightedDegree: number;
  pageRank: number;
  betweenness: number;
  community: number;
}

export interface OfficialAnalysis {
  manifest: OfficialAnalysisManifest;
  edges: AnalysisEdge[];
  metrics: AnalysisNodeMetric[];
  communities: Array<{
    id: number;
    label: string;
    memberIds: string[];
  }>;
  categoryCounts: Record<string, number>;
  groupCounts: Record<"design" | "motif", number>;
  facetCounts: Record<string, number>;
  recipeCooccurrence: Record<string, number>;
}
