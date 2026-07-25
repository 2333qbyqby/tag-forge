import type { CompiledPack, ResultSnapshot } from "../packs/types";

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

export function makeShareUrl(result: ResultSnapshot): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("view", "generate");
  url.hash = `result=${toBase64Url(
    JSON.stringify({ ...result, readOnly: undefined }),
  )}`;
  return url.toString();
}

export function parseSharedResult(_pack: CompiledPack): ResultSnapshot | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const encoded = hash.get("result");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as ResultSnapshot;
    return typeof parsed.id === "string" &&
      typeof parsed.pack?.packId === "string" &&
      typeof parsed.pack?.dataVersion === "string" &&
      typeof parsed.pack?.checksum === "string" &&
      typeof parsed.recipeId === "string" &&
      typeof parsed.seed === "string" &&
      Number.isFinite(parsed.createdAt) &&
      Array.isArray(parsed.slots)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function copyResultText(result: ResultSnapshot): Promise<void> {
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
