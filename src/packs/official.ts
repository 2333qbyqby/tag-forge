import { packChecksum } from "./canonical";
import { compilePack } from "./compile";
import type { CompiledPack, DataPackV1, LoadedPack } from "./types";
import { validatePack } from "./validate";

interface OfficialRegistry {
  packId: string;
  version: string;
  checksum: string;
  packPath: string;
  analysisPath: string;
}

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\/+/, "")}`;
}

export async function loadOfficialPack(): Promise<CompiledPack> {
  const registryResponse = await fetch(assetUrl("packs/official-registry.json"));
  if (!registryResponse.ok) throw new Error("无法读取官方数据包注册表。");
  const registry = (await registryResponse.json()) as OfficialRegistry;
  const packResponse = await fetch(assetUrl(registry.packPath));
  if (!packResponse.ok) throw new Error("无法读取官方 V2 数据包。");
  const data = (await packResponse.json()) as DataPackV1;
  const report = validatePack(data);
  if (!report.valid) {
    throw new Error(`官方数据包校验失败：${report.issues[0]?.message ?? "未知错误"}`);
  }
  const checksum = await packChecksum(data);
  if (checksum !== registry.checksum) {
    throw new Error("官方数据包哈希与注册表不一致。");
  }
  const loaded: LoadedPack = {
    data,
    ref: {
      packId: registry.packId,
      version: registry.version,
      checksum,
    },
    origin: "official",
    capabilities: {
      generate: true,
      browse: true,
      history: true,
      export: true,
      analysis: true,
    },
  };
  return compilePack(loaded);
}

export function officialAssetUrl(path: string): string {
  return assetUrl(path);
}
