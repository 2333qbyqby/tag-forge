import type { DataPackV1 } from "./types";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

export function canonicalPackJson(pack: DataPackV1): string {
  return JSON.stringify(sortValue(pack));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function packChecksum(pack: DataPackV1): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPackJson(pack));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}
