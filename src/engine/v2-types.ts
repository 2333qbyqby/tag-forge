import type { GeneratedIdea as LegacyGeneratedIdea, TagKind } from "./types";

export const BASE_TAG_KINDS = [
  "genre",
  "mechanic",
  "theme",
  "mood",
  "presentation",
  "perspective",
] as const satisfies readonly TagKind[];

export type BaseTagKind = (typeof BASE_TAG_KINDS)[number];
export type BaseKindChoice = BaseTagKind | "gameplay" | "any";
export type GeneratorModeV2 = "single" | "challenge";

export const PROMPT_TYPES = [
  "open-choice",
  "abstract-metaphor",
  "change-consequence",
  "relationship-identity",
  "time-loop-rhythm",
  "space-scale-boundary",
  "perception-information",
  "object-material-sensory",
  "rule-resource-constraint",
  "goal-start-situation",
  "experimental-absurd",
] as const;

export type PromptType = (typeof PROMPT_TYPES)[number];

export const PROMPT_FAMILIES = [
  "choice-sacrifice",
  "loss-memory",
  "identity-change",
  "connection-separation",
  "truth-perception",
  "control-chaos",
  "time-repetition",
  "repair-decay",
  "belonging-departure",
  "responsibility-consequence",
  "nature-material",
  "play-absurdity",
] as const;

export type PromptFamily = (typeof PROMPT_FAMILIES)[number];

export interface PromptRecord {
  id: string;
  labels: {
    zh: string;
    en: string;
  };
  type: PromptType;
  family: PromptFamily;
  motifs: string[];
  baseWeight: number;
  origin: "jam-researched-original-v1";
  enabled: boolean;
}

export interface GeneratorConfigV2 {
  mode: GeneratorModeV2;
  selectedKinds: [BaseKindChoice, BaseKindChoice];
  locked: {
    left: boolean;
    right: boolean;
    prompt: boolean;
  };
  excludedTagIds: string[];
  excludedPromptIds: string[];
  avoidRecent: boolean;
  seed: string;
  /** One-time bridge for pinned Engine 1 tags; consumed by App on first V2 load. */
  migratedBaseTagIds?: [string, string?];
}

export interface IdeaHistoryEntryV2 {
  id: string;
  schemaVersion: 2;
  mode: GeneratorModeV2;
  baseTagIds: string[];
  promptId?: string;
  promptType?: PromptType;
  promptFamily?: PromptFamily;
  createdAt: number;
  legacyTagIds?: string[];
}

export interface GeneratedIdeaV2 {
  id: string;
  schemaVersion: 2;
  mode: GeneratorModeV2;
  seed: string;
  baseTagIds: [string, string?];
  promptId?: string;
  createdAt: number;
}

export interface LegacySavedIdea {
  id: string;
  schemaVersion?: 1;
  seed: string;
  mode: LegacyGeneratedIdea["mode"];
  tagIds: string[];
  createdAt: number;
  slots?: LegacyGeneratedIdea["slots"];
  metrics?: LegacyGeneratedIdea["metrics"];
  signals?: LegacyGeneratedIdea["signals"];
}

export type SavedIdea = GeneratedIdeaV2 | LegacySavedIdea;
export interface LegacyHistoryEntry {
  id: string;
  schemaVersion: 1;
  tagIds: string[];
  createdAt: number;
}

export type StoredHistoryEntry = IdeaHistoryEntryV2 | LegacyHistoryEntry;

export function isV2Idea(idea: SavedIdea): idea is GeneratedIdeaV2 {
  return idea.schemaVersion === 2;
}
