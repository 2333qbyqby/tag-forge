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

interface LegacyCatalogFile {
  dataVersion: string;
  groups: Partial<Record<TagKind, CatalogTuple[]>>;
}

interface ObjectCatalogFile {
  dataVersion: string;
  tags: Array<{
    id: string;
    labels: { en: string; zh: string };
    kind: TagKind;
    aliases?: string[];
    family?: string;
    clusters: string[];
    baseWeight?: number;
    rarity: number;
    scopeImpact: number;
    implementationRisk: number;
    compositeOf?: string[];
    deprecatedBy?: string;
    generationEligible?: boolean;
    sourceRefs?: string[];
    enabled?: boolean;
  }>;
}

const typedCatalog = catalog as unknown as LegacyCatalogFile | ObjectCatalogFile;

export const DATA_VERSION = typedCatalog.dataVersion;

export const tags: TagNode[] =
  "tags" in typedCatalog
    ? typedCatalog.tags.map((tag) => ({
        ...tag,
        aliases: tag.aliases ?? [],
        family: tag.family ?? tag.id,
        baseWeight: tag.baseWeight ?? 1,
        sourceRefs: tag.sourceRefs ?? ["curated-2026-07"],
        enabled: tag.enabled ?? true,
      }))
    : Object.entries(typedCatalog.groups).flatMap(([kind, entries]) =>
        (entries ?? []).map(
          ([id, en, zh, clusterString, rarity, scopeImpact, implementationRisk]) => ({
            id,
            labels: { en, zh },
            kind: kind as TagKind,
            aliases: [],
            family: id,
            baseWeight: 1,
            rarity,
            scopeImpact,
            implementationRisk,
            clusters: clusterString.split("|"),
            generationEligible: [
              "genre",
              "mechanic",
              "theme",
              "mood",
              "presentation",
              "perspective",
            ].includes(kind),
            sourceRefs:
              kind === "jamPrompt"
                ? ["ggj-history-2026-07", "curated-2026-07"]
                : ["steam-tags-2026-07", "curated-2026-07"],
            enabled: true,
          }),
        ),
      );
