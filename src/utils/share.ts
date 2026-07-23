import { DATA_VERSION } from "../data";
import type { GeneratedIdea, GeneratorMode } from "../engine/types";

export function makeShareUrl(idea: GeneratedIdea): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("view", "generate");
  url.searchParams.set("mode", idea.mode);
  url.searchParams.set("seed", idea.seed);
  url.searchParams.set("tags", idea.tagIds.join(","));
  url.searchParams.set("data", DATA_VERSION);
  url.searchParams.set("engine", "1");
  return url.toString();
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

