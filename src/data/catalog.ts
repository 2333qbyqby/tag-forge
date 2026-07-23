import catalog from "../../data-src/catalog.json";
import type { TagKind, TagNode } from "../engine/types";

type CatalogTuple = [
  id: string,
  en: string,
  zh: string,
  clusters: string,
  rarity: number,
  scopeImpact: number,
  implementationRisk: number,
];

interface CatalogFile {
  dataVersion: string;
  groups: Partial<Record<TagKind, CatalogTuple[]>>;
}

const typedCatalog = catalog as unknown as CatalogFile;

export const DATA_VERSION = typedCatalog.dataVersion;

export const tags: TagNode[] = Object.entries(typedCatalog.groups).flatMap(
  ([kind, entries]) =>
    (entries ?? []).map(
      ([id, en, zh, clusterString, rarity, scopeImpact, implementationRisk]) => ({
        id,
        labels: { en, zh },
        kind: kind as TagKind,
        baseWeight: 1,
        rarity,
        scopeImpact,
        implementationRisk,
        clusters: clusterString.split("|"),
        sourceRefs:
          kind === "jamPrompt"
            ? ["ggj-history-2026-07", "curated-2026-07"]
            : ["steam-tags-2026-07", "curated-2026-07"],
        enabled: true,
      }),
    ),
);
