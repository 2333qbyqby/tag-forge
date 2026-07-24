import { DATA_VERSION } from "../data";
import type { GeneratedIdea, GeneratorMode } from "../engine/types";
import {
  isV2Idea,
  type GeneratedIdeaV2,
  type SavedIdea,
} from "../engine/v2-types";

export function makeShareUrl(idea: SavedIdea): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("view", "generate");
  if (isV2Idea(idea)) {
    url.searchParams.set("engine", "2");
    url.searchParams.set("mode", idea.mode);
    url.searchParams.set("seed", idea.seed);
    url.searchParams.set("base", idea.baseTagIds.filter(Boolean).join(","));
    if (idea.promptId) url.searchParams.set("prompt", idea.promptId);
  } else {
    url.searchParams.set("engine", "1");
    url.searchParams.set("mode", idea.mode);
    url.searchParams.set("seed", idea.seed);
    url.searchParams.set("tags", idea.tagIds.join(","));
  }
  url.searchParams.set("data", DATA_VERSION);
  return url.toString();
}

export type SharedIdeaPayload =
  | {
      engine: 2;
      mode: GeneratedIdeaV2["mode"];
      seed: string;
      baseTagIds: [string, string?];
      promptId?: string;
    }
  | {
      engine: 1;
      mode: GeneratorMode;
      seed: string;
      tagIds: string[];
    };

export function parseSharedIdeaPayload(): SharedIdeaPayload | null {
  const params = new URLSearchParams(window.location.search);
  const engine = params.get("engine");
  const mode = params.get("mode");
  const seed = params.get("seed");
  if (!mode || !seed) return null;
  if (engine === "2") {
    const base = params.get("base")?.split(",").filter(Boolean) ?? [];
    if (
      !["single", "challenge"].includes(mode) ||
      base.length < 1 ||
      base.length > 2
    ) {
      return null;
    }
    return {
      engine: 2,
      mode: mode as GeneratedIdeaV2["mode"],
      seed,
      baseTagIds: [base[0], base[1]],
      promptId: params.get("prompt") ?? undefined,
    };
  }
  const tags = params.get("tags");
  if (
    !tags ||
    !["quick", "jam", "prototype", "wild"].includes(mode)
  ) {
    return null;
  }
  return {
    engine: 1,
    mode: mode as GeneratorMode,
    seed,
    tagIds: tags.split(",").filter(Boolean),
  };
}

export function parseSharedIdea(): {
  mode: GeneratorMode;
  seed: string;
  tagIds: string[];
} | null {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") as GeneratorMode | null;
  const seed = params.get("seed");
  const tags = params.get("tags");
  if (!mode || !seed || !tags) return null;
  if (!["quick", "jam", "prototype", "wild"].includes(mode)) return null;
  return { mode, seed, tagIds: tags.split(",").filter(Boolean) };
}

export async function copyIdeaText(
  idea: GeneratedIdea,
  labels: { kind: string; value: string }[],
): Promise<void> {
  const text = [
    "TAGFORGE / IDEA SEED",
    "",
    ...labels.map(({ kind, value }) => `${kind}: ${value}`),
    "",
    `Seed: ${idea.seed}`,
    makeShareUrl(idea),
  ].join("\n");
  await navigator.clipboard.writeText(text);
}

export async function copySavedIdeaText(
  idea: SavedIdea,
  labels: { kind: string; value: string }[],
): Promise<void> {
  const text = [
    isV2Idea(idea) ? "TAGFORGE / ENGINE 2" : "TAGFORGE / LEGACY IDEA",
    "",
    ...labels.map(({ kind, value }) => `${kind}: ${value}`),
    "",
    `Seed: ${idea.seed}`,
    makeShareUrl(idea),
  ].join("\n");
  await navigator.clipboard.writeText(text);
}
