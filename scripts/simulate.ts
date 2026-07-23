import process from "node:process";
import { compiledData } from "../src/data";
import { generateIdea } from "../src/engine/generate";
import { getEdge } from "../src/engine/indexes";
import { createSeededRng } from "../src/engine/rng";
import type {
  GeneratorConfig,
  GeneratorMode,
  IdeaHistoryEntry,
} from "../src/engine/types";

function argument(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const count = Math.max(100, Number(argument("count", "10000")));
const mode = argument("mode", "jam") as GeneratorMode;
const surprise = Math.max(0, Math.min(1, Number(argument("surprise", "0.5"))));
const config: GeneratorConfig = {
  mode,
  surprise,
  targetScope: Number(argument("scope", "0.3")),
  seed: "simulation",
  pinnedBySlot: {},
  excludedTagIds: [],
  avoidRecent: true,
};

const frequencies = new Map<string, number>();
const seenIdeas = new Set<string>();
const history: IdeaHistoryEntry[] = [];
let hardConflicts = 0;
let coherence = 0;
let novelty = 0;
let risk = 0;
let nearDuplicates = 0;

for (let index = 0; index < count; index += 1) {
  const seed = `simulation:${mode}:${surprise}:${index}`;
  const idea = generateIdea(
    { ...config, seed },
    compiledData,
    history,
    createSeededRng(seed),
    48,
  );
  const key = [...idea.tagIds].sort().join("|");
  if (seenIdeas.has(key)) nearDuplicates += 1;
  seenIdeas.add(key);
  coherence += idea.metrics.coherence;
  novelty += idea.metrics.novelty;
  risk += idea.metrics.risk;
  for (const id of idea.tagIds) {
    frequencies.set(id, (frequencies.get(id) ?? 0) + 1);
  }
  for (let a = 0; a < idea.tagIds.length; a += 1) {
    for (let b = a + 1; b < idea.tagIds.length; b += 1) {
      if (getEdge(compiledData, idea.tagIds[a], idea.tagIds[b]).hardConflict) {
        hardConflicts += 1;
      }
    }
  }
  history.unshift({ id: idea.id, tagIds: idea.tagIds, createdAt: idea.createdAt });
  if (history.length > 100) history.pop();
}

const mostCommon = [...frequencies.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([id, uses]) => ({
    tag: compiledData.tagById.get(id)?.labels.en ?? id,
    uses,
    rate: `${((uses / count) * 100).toFixed(2)}%`,
  }));

console.log(
  JSON.stringify(
    {
      runs: count,
      mode,
      surprise,
      uniqueIdeas: seenIdeas.size,
      repeatedExactRate: nearDuplicates / count,
      hardConflicts,
      average: {
        coherence: coherence / count,
        novelty: novelty / count,
        risk: risk / count,
      },
      mostCommon,
    },
    null,
    2,
  ),
);

if (hardConflicts > 0) process.exit(1);

