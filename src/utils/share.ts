import type { CompiledPack, ResultSnapshotV1 } from "../packs/types";

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function makeShareUrl(result: ResultSnapshotV1): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("view", "generate");
  url.hash = `result=${toBase64Url(JSON.stringify(result))}`;
  return url.toString();
}

function legacySlot(pack: CompiledPack, id: string, index: number) {
  const entry = pack.entryById.get(id);
  const prompt = pack.promptById.get(id);
  if (entry) {
    const canonical = entry.deprecatedBy
      ? pack.entryById.get(entry.deprecatedBy) ?? entry
      : entry;
    return {
      slotId: `legacy-${index + 1}`,
      source: "entries" as const,
      itemId: canonical.id,
      categoryId: canonical.categoryId,
      family: canonical.family,
      labels: canonical.labels,
    };
  }
  if (prompt) {
    return {
      slotId: `legacy-${index + 1}`,
      source: "promptDeck" as const,
      itemId: id,
      family: prompt.family,
      labels: prompt.labels,
    };
  }
  return {
    slotId: `legacy-${index + 1}`,
    source: "entries" as const,
    itemId: id,
    family: id,
    labels: { zh: id, en: id },
  };
}

export function parseSharedResult(pack: CompiledPack): ResultSnapshotV1 | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const encoded = hash.get("result");
  if (encoded) {
    try {
      const parsed = JSON.parse(fromBase64Url(encoded)) as ResultSnapshotV1;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.slots)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams(window.location.search);
  const engine = params.get("engine");
  const seed = params.get("seed");
  if (!seed) return null;
  const ids =
    engine === "2"
      ? [
          ...(params.get("base")?.split(",").filter(Boolean) ?? []),
          ...(params.get("prompt") ? [params.get("prompt")!] : []),
        ]
      : params.get("tags")?.split(",").filter(Boolean) ?? [];
  if (ids.length === 0) return null;
  return {
    id: `legacy-link:${seed}:${ids.join("|")}`,
    schemaVersion: 1,
    pack: pack.ref,
    recipeId: "migrated-result",
    seed,
    slots: ids.map((id, index) => legacySlot(pack, id, index)),
    createdAt: Date.now(),
    readOnly: true,
    migratedFrom: "legacy-link",
  };
}

export async function copyResultText(result: ResultSnapshotV1): Promise<void> {
  const text = [
    "TAGFORGE / IDEA",
    "",
    ...result.slots.map(
      (slot) => `${slot.slotId.toUpperCase()}: ${slot.labels.zh}`,
    ),
    "",
    `Recipe: ${result.recipeId}`,
    `Seed: ${result.seed}`,
    makeShareUrl(result),
  ].join("\n");
  await navigator.clipboard.writeText(text);
}
