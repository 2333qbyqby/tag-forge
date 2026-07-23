import { contextualLogit } from "./contextual-weight";
import { getEdge } from "./indexes";
import { softmaxPick, type SeededRng } from "./rng";
import type {
  CompiledData,
  GeneratorConfig,
  GeneratorTemplate,
  IdeaCandidate,
  IdeaHistoryEntry,
  TemplateSlot,
} from "./types";

interface BuildCandidateOptions {
  template: GeneratorTemplate;
  config: GeneratorConfig;
  data: CompiledData;
  history: IdeaHistoryEntry[];
  rng: SeededRng;
  fixedSlots?: Record<string, string>;
}

function selectForSlot(
  slot: TemplateSlot,
  selectedIds: string[],
  config: GeneratorConfig,
  data: CompiledData,
  history: IdeaHistoryEntry[],
  rng: SeededRng,
  excludedForSlot: string[] = [],
): string | undefined {
  const excluded = new Set([
    ...config.excludedTagIds,
    ...selectedIds,
    ...excludedForSlot,
  ]);
  const candidates = (data.tagsByKind.get(slot.kind) ?? []).filter(
    (tag) => tag.enabled && !excluded.has(tag.id),
  );
  const logits = candidates.map((tag) =>
    contextualLogit(tag, selectedIds, config, data, history),
  );
  const validCandidates = candidates.filter((_, index) =>
    Number.isFinite(logits[index]),
  );
  const validLogits = logits.filter(Number.isFinite);
  const temperature = 0.72 + 0.55 * config.surprise;
  return softmaxPick(validCandidates, validLogits, temperature, rng)?.id;
}

export function passesHardValidation(
  candidate: IdeaCandidate,
  data: CompiledData,
): boolean {
  if (new Set(candidate.tagIds).size !== candidate.tagIds.length) return false;
  for (let a = 0; a < candidate.tagIds.length; a += 1) {
    for (let b = a + 1; b < candidate.tagIds.length; b += 1) {
      if (getEdge(data, candidate.tagIds[a], candidate.tagIds[b]).hardConflict) {
        return false;
      }
    }
  }
  return true;
}

export function buildCandidate({
  template,
  config,
  data,
  history,
  rng,
  fixedSlots = {},
}: BuildCandidateOptions): IdeaCandidate | undefined {
  const slots: Record<string, string> = {
    ...config.pinnedBySlot,
    ...fixedSlots,
  };

  for (const slotId of template.selectionOrder) {
    if (slots[slotId]) continue;
    const slot = template.slots.find((item) => item.id === slotId);
    if (!slot) continue;
    const selected = Object.values(slots);
    const picked = selectForSlot(
      slot,
      selected,
      config,
      data,
      history,
      rng.fork(`slot:${slotId}`),
    );
    if (!picked && !slot.optional) return undefined;
    if (picked) slots[slotId] = picked;
  }

  const tagIds = template.slots
    .map((slot) => slots[slot.id])
    .filter((id): id is string => Boolean(id));
  const candidate = { slots, tagIds };
  return passesHardValidation(candidate, data) ? candidate : undefined;
}

export function rerollSlot(
  current: IdeaCandidate,
  slotId: string,
  template: GeneratorTemplate,
  config: GeneratorConfig,
  data: CompiledData,
  history: IdeaHistoryEntry[],
  rng: SeededRng,
): IdeaCandidate | undefined {
  const slot = template.slots.find((item) => item.id === slotId);
  if (!slot) return current;
  const fixedSlots = Object.fromEntries(
    Object.entries(current.slots).filter(([id]) => id !== slotId),
  );
  const selected = Object.values(fixedSlots);
  const replacement = selectForSlot(
    slot,
    selected,
    config,
    data,
    history,
    rng,
    [current.slots[slotId]],
  );
  if (!replacement) return undefined;
  const slots = { ...fixedSlots, [slotId]: replacement };
  const tagIds = template.slots
    .map((item) => slots[item.id])
    .filter((id): id is string => Boolean(id));
  const candidate = { slots, tagIds };
  return passesHardValidation(candidate, data) ? candidate : undefined;
}

