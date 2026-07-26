import manifestJson from "../data-src/manifest.json";
import categoriesJson from "../data-src/categories.json";
import catalogJson from "../data-src/catalog.json";
import historicalJson from "../data-src/historical-prompts.json";
import recipesJson from "../data-src/recipes.json";
import provenanceJson from "../data-src/provenance.json";
import { packChecksum } from "../src/packs/canonical";
import { compilePack } from "../src/packs/compile";
import type { CompiledPack, DataPack } from "../src/packs/types";

export const officialData = {
  manifest: manifestJson,
  categories: categoriesJson.categories,
  entries: catalogJson.entries,
  promptDecks: [
    {
      id: "historical-jam",
      labels: { zh: "历史 Jam 主题", en: "Historical Jam Themes" },
      prompts: historicalJson.prompts,
    },
  ],
  recipes: recipesJson.recipes,
  provenance: provenanceJson,
} as unknown as DataPack;

export async function officialTestPack(): Promise<CompiledPack> {
  const checksum = await packChecksum(officialData);
  return compilePack({
    data: officialData,
    ref: {
      packId: officialData.manifest.packId,
      dataVersion: officialData.manifest.dataVersion,
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
  });
}
