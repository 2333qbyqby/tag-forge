import type {
  CategoryDefinition,
  CompiledPack,
  EntryRecord,
  LoadedPack,
} from "./types";

export function compilePack(pack: LoadedPack): CompiledPack {
  const categoryById = new Map<string, CategoryDefinition>(
    pack.data.categories.map((category) => [category.id, category]),
  );
  const entryById = new Map<string, EntryRecord>(
    pack.data.entries.map((entry) => [entry.id, entry]),
  );
  const promptDeckById = new Map(
    pack.data.promptDecks.map((deck) => [deck.id, deck]),
  );
  const promptById = new Map(
    pack.data.promptDecks.flatMap((deck) =>
      deck.prompts.map((prompt) => [prompt.id, prompt] as const),
    ),
  );
  const recipeById = new Map(
    pack.data.recipes.map((recipe) => [recipe.id, recipe]),
  );
  const entriesByCategory = new Map<string, EntryRecord[]>();
  for (const entry of pack.data.entries) {
    const bucket = entriesByCategory.get(entry.categoryId) ?? [];
    bucket.push(entry);
    entriesByCategory.set(entry.categoryId, bucket);
  }
  const sourceById = new Map(
    (pack.data.provenance?.sources ?? []).map((source) => [source.id, source]),
  );
  const observationsByEntry = new Map();
  for (const observation of pack.data.provenance?.observations ?? []) {
    const bucket = observationsByEntry.get(observation.entryId) ?? [];
    bucket.push(observation);
    observationsByEntry.set(observation.entryId, bucket);
  }
  return {
    ...pack,
    categoryById,
    entryById,
    promptDeckById,
    promptById,
    recipeById,
    entriesByCategory,
    sourceById,
    observationsByEntry,
  };
}
