import type {
  CategoryDefinition,
  DataPack,
  EntryObservation,
  EntryRecord,
  PackManifest,
  PromptDeck,
  PromptRecord,
  PackSource,
  RecipeDefinition,
  RecipeSlot,
  RecipeVariant,
} from "./types";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function localized(value: unknown) {
  const raw = value as { zh?: unknown; en?: unknown } | undefined;
  return { zh: text(raw?.zh), en: text(raw?.en) };
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes"].includes(text(value).toLowerCase());
}

export function normalizeManifest(value: unknown): PackManifest {
  const raw = value as Partial<PackManifest> | undefined;
  const files = raw?.files as Partial<PackManifest["files"]> | undefined;
  return {
    packId: text(raw?.packId),
    dataVersion: text(raw?.dataVersion),
    name: localized(raw?.name),
    ...(raw?.description
      ? { description: localized(raw.description) }
      : {}),
    defaultLocale: text(raw?.defaultLocale) as "zh" | "en",
    locales: (Array.isArray(raw?.locales)
      ? raw.locales.map(text)
      : []) as Array<"zh" | "en">,
    files: {
      categories: text(files?.categories) as "categories.csv",
      entries: text(files?.entries) as "entries.csv",
      recipes: text(files?.recipes) as "recipes.json",
      ...(files?.prompts
        ? { prompts: text(files.prompts) as "prompts.csv" }
        : {}),
      ...(files?.provenance
        ? { provenance: text(files.provenance) as "provenance.json" }
        : {}),
    },
    ...(typeof raw?.official === "boolean" ? { official: raw.official } : {}),
  };
}

function normalizeCategory(value: unknown): CategoryDefinition {
  const raw = value as Partial<CategoryDefinition>;
  return {
    id: text(raw.id),
    labels: localized(raw.labels),
    group:
      raw.group === undefined
        ? "design"
        : (text(raw.group) as CategoryDefinition["group"]),
    ...(raw.color ? { color: text(raw.color) } : {}),
    enabled: bool(raw.enabled),
  };
}

function normalizeSource(value: unknown): PackSource {
  const raw = value as Partial<PackSource>;
  const releaseYear = numberValue(raw.releaseYear, Number.NaN);
  return {
    id: text(raw.id),
    kind: text(raw.kind) as PackSource["kind"],
    labels: localized(raw.labels),
    url: text(raw.url),
    ...(raw.developer ? { developer: text(raw.developer) } : {}),
    ...(raw.releaseYear !== undefined ? { releaseYear } : {}),
    retrievedAt: text(raw.retrievedAt),
  };
}

function normalizeObservation(value: unknown): EntryObservation {
  const raw = value as Partial<EntryObservation>;
  return {
    entryId: text(raw.entryId),
    sourceId: text(raw.sourceId),
    evidenceUrl: text(raw.evidenceUrl),
    channels: list(raw.channels) as EntryObservation["channels"],
    salience: text(raw.salience) as EntryObservation["salience"],
    note: localized(raw.note),
  };
}

function normalizeEntry(value: unknown): EntryRecord {
  const raw = value as Partial<EntryRecord>;
  const compositeOf = list(raw.compositeOf);
  const sourceRefs = list(raw.sourceRefs);
  return {
    id: text(raw.id),
    labels: localized(raw.labels),
    categoryId: text(raw.categoryId),
    aliases: list(raw.aliases),
    family: text(raw.family),
    facets: list(raw.facets),
    baseWeight: numberValue(raw.baseWeight, Number.NaN),
    rarity: numberValue(raw.rarity, Number.NaN),
    scopeImpact: numberValue(raw.scopeImpact, Number.NaN),
    implementationRisk: numberValue(raw.implementationRisk, Number.NaN),
    ...(compositeOf.length > 0 ? { compositeOf } : {}),
    ...(raw.deprecatedBy ? { deprecatedBy: text(raw.deprecatedBy) } : {}),
    ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
    enabled: bool(raw.enabled),
  };
}

function normalizePrompt(value: unknown): PromptRecord {
  const raw = value as Partial<PromptRecord>;
  const facets = list(raw.facets);
  const motifs = list(raw.motifs);
  const sourceRefs = list(raw.sourceRefs);
  return {
    id: text(raw.id),
    labels: localized(raw.labels),
    family: text(raw.family),
    ...(facets.length > 0 ? { facets } : {}),
    ...(motifs.length > 0 ? { motifs } : {}),
    ...(raw.type ? { type: text(raw.type) } : {}),
    baseWeight: numberValue(raw.baseWeight, Number.NaN),
    ...(raw.origin ? { origin: text(raw.origin) } : {}),
    ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
    enabled: bool(raw.enabled),
  };
}

function normalizeDeck(value: unknown): PromptDeck {
  const raw = value as Partial<PromptDeck>;
  return {
    id: text(raw.id),
    labels: localized(raw.labels),
    prompts: Array.isArray(raw.prompts)
      ? raw.prompts.map(normalizePrompt)
      : [],
  };
}

function normalizeSlot(value: unknown): RecipeSlot {
  const raw = value as Partial<RecipeSlot>;
  const categoryIds = list(raw.categoryIds);
  return {
    id: text(raw.id),
    labels: localized(raw.labels),
    source: text(raw.source) as RecipeSlot["source"],
    ...(categoryIds.length > 0 ? { categoryIds } : {}),
    ...(raw.deckId ? { deckId: text(raw.deckId) } : {}),
    required: bool(raw.required),
    ...(raw.allowCategoryOverride !== undefined
      ? { allowCategoryOverride: bool(raw.allowCategoryOverride, false) }
      : {}),
    ...(raw.balanceBy ? { balanceBy: text(raw.balanceBy) as "type" } : {}),
  };
}

function normalizeVariant(value: unknown): RecipeVariant {
  const raw = value as Partial<RecipeVariant>;
  const pools =
    raw.slotCategoryIds && typeof raw.slotCategoryIds === "object"
      ? Object.fromEntries(
          Object.entries(raw.slotCategoryIds).map(([slotId, ids]) => [
            text(slotId),
            list(ids),
          ]),
        )
      : {};
  return {
    id: text(raw.id),
    weight: numberValue(raw.weight, Number.NaN),
    slotCategoryIds: pools,
  };
}

function normalizeRecipe(value: unknown): RecipeDefinition {
  const raw = value as Partial<RecipeDefinition>;
  return {
    id: text(raw.id),
    labels: localized(raw.labels),
    description: localized(raw.description),
    slots: Array.isArray(raw.slots) ? raw.slots.map(normalizeSlot) : [],
    ...(Array.isArray(raw.variants)
      ? { variants: raw.variants.map(normalizeVariant) }
      : {}),
    cooldown: {
      entryWindow: numberValue(raw.cooldown?.entryWindow, Number.NaN),
      familyWindow: numberValue(raw.cooldown?.familyWindow, Number.NaN),
      pairWindow: numberValue(raw.cooldown?.pairWindow, Number.NaN),
    },
    riskPolicy: text(raw.riskPolicy) as RecipeDefinition["riskPolicy"],
  };
}

export function normalizePack(value: unknown): DataPack {
  const raw = value as Partial<DataPack>;
  return {
    manifest: normalizeManifest(raw.manifest),
    categories: Array.isArray(raw.categories)
      ? raw.categories.map(normalizeCategory)
      : [],
    entries: Array.isArray(raw.entries) ? raw.entries.map(normalizeEntry) : [],
    promptDecks: Array.isArray(raw.promptDecks)
      ? raw.promptDecks.map(normalizeDeck)
      : [],
    recipes: Array.isArray(raw.recipes) ? raw.recipes.map(normalizeRecipe) : [],
    ...(raw.provenance
      ? {
          provenance: {
            sources: Array.isArray(raw.provenance.sources)
              ? raw.provenance.sources.map(normalizeSource)
              : [],
            observations: Array.isArray(raw.provenance.observations)
              ? raw.provenance.observations.map(normalizeObservation)
              : [],
          },
        }
      : {}),
  };
}
