import { packChecksum } from "./canonical";
import { compilePack } from "./compile";
import type { CompiledPack, DataPack, LoadedPack } from "./types";
import { validatePack } from "./validate";

export interface OfficialRegistry {
  packId: string;
  dataVersion: string;
  checksum: string;
  packPath: string;
  analysisPath: string;
}

let registryPromise: Promise<OfficialRegistry> | undefined;

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\/+/, "")}`;
}

export async function loadOfficialRegistry(): Promise<OfficialRegistry> {
  registryPromise ??= fetch(assetUrl("packs/official-registry.json")).then(
    async (response) => {
      if (!response.ok) throw new Error("无法读取官方数据集注册表。");
      return response.json() as Promise<OfficialRegistry>;
    },
  );
  return registryPromise;
}

export async function loadOfficialPack(): Promise<CompiledPack> {
  const registry = await loadOfficialRegistry();
  const packResponse = await fetch(assetUrl(registry.packPath));
  if (!packResponse.ok) throw new Error("无法读取官方数据集。");
  const data = (await packResponse.json()) as DataPack;
  const report = validatePack(data);
  if (!report.valid) {
    throw new Error(`官方数据集校验失败：${report.issues[0]?.message ?? "未知错误"}`);
  }
  if (
    registry.packId !== data.manifest.packId ||
    registry.dataVersion !== data.manifest.dataVersion
  ) {
    throw new Error("官方数据集身份与注册表不一致。");
  }
  const checksum = await packChecksum(data);
  if (checksum !== registry.checksum) {
    throw new Error("官方数据集哈希与注册表不一致。");
  }
  const loaded: LoadedPack = {
    data,
    ref: {
      packId: registry.packId,
      dataVersion: registry.dataVersion,
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
