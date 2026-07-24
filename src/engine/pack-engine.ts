import type {
  CompiledPack,
  EntryRecord,
  GeneratorSettings,
  PromptRecord,
  RecipeDefinition,
  RecipeSlot,
  ResultSlotSnapshot,
  ResultSnapshotV1,
} from "../packs/types";
import { createSeededRng, weightedPick, type SeededRng } from "./rng";

function familyFor(value: EntryRecord | PromptRecord): string {
  return value.family || value.id;
}

function hasCompositeOverlap(left: EntryRecord, right: EntryRecord): boolean {
  const leftParts = new Set([left.id, ...(left.compositeOf ?? [])]);
  const rightParts = new Set([right.id, ...(right.compositeOf ?? [])]);
  return [...leftParts].some((part) => rightParts.has(part));
}

export function isValidEntryPair(left: EntryRecord, right: EntryRecord): boolean {
  return (
    left.id !== right.id &&
    familyFor(left) !== familyFor(right) &&
    !hasCompositeOverlap(left, right)
  );
}

function recentWeight(
  itemId: string,
  family: string,
  history: ResultSnapshotV1[],
  recipe: RecipeDefinition,
  avoidRecent: boolean,
): number {
  if (!avoidRecent) return 1;
  const recent = history.filter((result) => result.recipeId === recipe.id);
  const exact = recent
    .slice(0, recipe.cooldown.entryWindow)
    .some((result) => result.slots.some((slot) => slot.itemId === itemId));
  const familyHit = recent
    .slice(0, recipe.cooldown.familyWindow)
    .some((result) => result.slots.some((slot) => slot.family === family));
  return (exact ? 0.15 : 1) * (familyHit ? 0.35 : 1);
}

function pairWasRecent(
  candidateId: string,
  selectedIds: string[],
  history: ResultSnapshotV1[],
  recipe: RecipeDefinition,
): boolean {
  if (selectedIds.length === 0) return false;
  const targetPairs = selectedIds.map((id) => [candidateId, id].sort().join("|"));
  return history
    .filter((result) => result.recipeId === recipe.id)
    .slice(0, recipe.cooldown.pairWindow)
    .some((result) => {
      const ids = result.slots
        .filter((slot) => slot.source === "entries")
        .map((slot) => slot.itemId);
      for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) {
          if (targetPairs.includes([ids[left], ids[right]].sort().join("|"))) {
            return true;
          }
        }
      }
      return false;
    });
}

function entrySnapshot(
  slot: RecipeSlot,
  entry: EntryRecord,
): ResultSlotSnapshot {
  return {
    slotId: slot.id,
    source: "entries",
    itemId: entry.id,
    categoryId: entry.categoryId,
    family: familyFor(entry),
    labels: entry.labels,
  };
}

function promptSnapshot(
  slot: RecipeSlot,
  prompt: PromptRecord,
): ResultSlotSnapshot {
  return {
    slotId: slot.id,
    source: "promptDeck",
    itemId: prompt.id,
    deckId: slot.deckId,
    family: familyFor(prompt),
    labels: prompt.labels,
  };
}

function pickEntry(
  pack: CompiledPack,
  recipe: RecipeDefinition,
  slot: RecipeSlot,
  categoryIds: string[],
  selected: EntryRecord[],
  settings: GeneratorSettings,
  history: ResultSnapshotV1[],
  rng: SeededRng,
  previousId?: string,
): EntryRecord | undefined {
  const excluded = new Set([
    ...settings.excludedItemIds,
    ...selected.map((entry) => entry.id),
    ...(previousId ? [previousId] : []),
  ]);
  const semantic = categoryIds
    .flatMap((categoryId) => pack.entriesByCategory.get(categoryId) ?? [])
    .filter(
      (entry) =>
        entry.enabled !== false &&
        !entry.deprecatedBy &&
        !excluded.has(entry.id) &&
        selected.every((other) => isValidEntryPair(entry, other)),
    );
  const cooldown =
    settings.avoidRecent && selected.length > 0
      ? semantic.filter(
          (entry) =>
            !pairWasRecent(
              entry.id,
              selected.map((item) => item.id),
              history,
              recipe,
            ),
        )
      : semantic;
  const candidates = cooldown.length > 0 ? cooldown : semantic;
  const weights = candidates.map((entry) => {
    const historyWeight = recentWeight(
      entry.id,
      familyFor(entry),
      history,
      recipe,
      settings.avoidRecent,
    );
    const riskWeight =
      recipe.riskPolicy === "prefer-lower"
        ? Math.max(0.25, 1 - entry.implementationRisk * 0.45)
        : 1;
    return entry.baseWeight * historyWeight * riskWeight;
  });
  return weightedPick(candidates, weights, rng);
}

function pickPrompt(
  pack: CompiledPack,
  recipe: RecipeDefinition,
  slot: RecipeSlot,
  settings: GeneratorSettings,
  history: ResultSnapshotV1[],
  rng: SeededRng,
  previousId?: string,
): PromptRecord | undefined {
  const deck = pack.promptDeckById.get(slot.deckId ?? "");
  if (!deck) return undefined;
  const excluded = new Set([
    ...settings.excludedItemIds,
    ...(previousId ? [previousId] : []),
  ]);
  let candidates = deck.prompts.filter(
    (prompt) => prompt.enabled && !excluded.has(prompt.id),
  );
  const lastTypes = history
    .filter((result) => result.recipeId === recipe.id)
    .slice(0, 3)
    .map((result) => {
      const id = result.slots.find((item) => item.slotId === slot.id)?.itemId;
      return id ? pack.promptById.get(id)?.type : undefined;
    });
  const repeatedType =
    slot.balanceBy === "type" &&
    lastTypes.length === 3 &&
    lastTypes.every((type) => type && type === lastTypes[0])
      ? lastTypes[0]
      : undefined;
  const recent = history
    .filter((result) => result.recipeId === recipe.id)
    .slice(0, recipe.cooldown.entryWindow)
    .flatMap((result) => result.slots.map((item) => item.itemId));
  if (settings.avoidRecent) {
    const cooled = candidates.filter((prompt) => !recent.includes(prompt.id));
    if (cooled.length > 0) candidates = cooled;
  }
  const weights = candidates.map((prompt) => {
    let value =
      prompt.baseWeight *
      recentWeight(
        prompt.id,
        familyFor(prompt),
        history,
        recipe,
        settings.avoidRecent,
      );
    if (repeatedType && prompt.type === repeatedType) value *= 0.3;
    return value;
  });
  return weightedPick(candidates, weights, rng);
}

function variantFor(
  recipe: RecipeDefinition,
  rng: SeededRng,
  current?: ResultSnapshotV1,
  preserveCurrent = false,
) {
  if (!recipe.variants?.length) return undefined;
  const currentVariant = preserveCurrent
    ? recipe.variants.find((variant) => variant.id === current?.variantId)
    : undefined;
  if (currentVariant) return currentVariant;
  return weightedPick(
    recipe.variants,
    recipe.variants.map((variant) => variant.weight),
    rng,
  );
}

export function defaultGeneratorSettings(
  pack: CompiledPack,
): GeneratorSettings {
  return {
    recipeId: pack.data.recipes[0]?.id ?? "",
    seed: "first-spark-pack-v1",
    avoidRecent: true,
    lockedSlotIds: [],
    excludedItemIds: [],
    categoryOverrides: {},
  };
}

export function generateResult(
  pack: CompiledPack,
  settings: GeneratorSettings,
  history: ResultSnapshotV1[],
  current?: ResultSnapshotV1,
  onlySlotId?: string,
): ResultSnapshotV1 {
  const recipe =
    pack.recipeById.get(settings.recipeId) ?? pack.data.recipes[0];
  if (!recipe) throw new Error("当前数据包没有可用 Recipe。");
  const rng = createSeededRng(settings.seed);
  const variant = variantFor(
    recipe,
    rng.fork("variant"),
    current,
    onlySlotId !== undefined || settings.lockedSlotIds.length > 0,
  );
  const slots: ResultSlotSnapshot[] = [];
  const shouldKeep = (slot: RecipeSlot) => {
    const previous = current?.slots.find((item) => item.slotId === slot.id);
    return Boolean(
      previous &&
        current?.recipeId === recipe.id &&
        (settings.lockedSlotIds.includes(slot.id) ||
          (onlySlotId !== undefined && slot.id !== onlySlotId)),
    );
  };
  const selectedEntries = recipe.slots
    .filter(shouldKeep)
    .map((slot) => current?.slots.find((item) => item.slotId === slot.id))
    .filter(
      (slot): slot is ResultSlotSnapshot =>
        slot?.source === "entries" && pack.entryById.has(slot.itemId),
    )
    .map((slot) => pack.entryById.get(slot.itemId)!);

  for (const slot of recipe.slots) {
    const previous = current?.slots.find((item) => item.slotId === slot.id);
    const keep = previous && shouldKeep(slot);
    if (keep) {
      slots.push(previous);
      continue;
    }
    if (slot.source === "entries") {
      const override = settings.categoryOverrides[slot.id];
      const categoryIds =
        slot.allowCategoryOverride && override?.length
          ? override
          : variant?.slotCategoryIds[slot.id] ?? slot.categoryIds ?? [];
      const picked = pickEntry(
        pack,
        recipe,
        slot,
        categoryIds,
        selectedEntries,
        settings,
        history,
        rng.fork(`slot:${slot.id}`),
        previous?.itemId,
      );
      if (!picked && slot.required) {
        throw new Error(`槽位“${slot.labels.zh}”没有可用 Entry。`);
      }
      if (picked) {
        slots.push(entrySnapshot(slot, picked));
        selectedEntries.push(picked);
      }
    } else {
      const picked = pickPrompt(
        pack,
        recipe,
        slot,
        settings,
        history,
        rng.fork(`slot:${slot.id}`),
        previous?.itemId,
      );
      if (!picked && slot.required) {
        throw new Error(`槽位“${slot.labels.zh}”没有可用 Prompt。`);
      }
      if (picked) slots.push(promptSnapshot(slot, picked));
    }
  }

  const parts = slots.map((slot) => slot.itemId).join("|");
  return {
    id: `result:${pack.ref.checksum.slice(-12)}:${recipe.id}:${settings.seed}:${parts}`,
    schemaVersion: 1,
    pack: pack.ref,
    recipeId: recipe.id,
    seed: settings.seed,
    variantId: variant?.id,
    slots,
    createdAt: Date.now(),
  };
}
