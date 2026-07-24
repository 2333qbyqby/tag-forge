import manifestJson from "../data-src/manifest.json";
import categoriesJson from "../data-src/categories.json";
import catalogJson from "../data-src/catalog.json";
import promptsJson from "../data-src/prompts.json";
import historicalJson from "../data-src/historical-prompts.json";
import recipesJson from "../data-src/recipes.json";
import { packChecksum } from "../src/packs/canonical";
import { compilePack } from "../src/packs/compile";
import type { CompiledPack, DataPackV1 } from "../src/packs/types";

export const officialData = {
  manifest: manifestJson,
  categories: categoriesJson.categories,
  entries: catalogJson.entries,
  promptDecks: [
    {
      id: "original-prompts",
      labels: { zh: "原创开放命题", en: "Original Open Prompts" },
      prompts: promptsJson.prompts,
    },
    {
      id: "historical-jam",
      labels: { zh: "历史 Jam 主题", en: "Historical Jam Themes" },
      prompts: historicalJson.prompts,
    },
  ],
  recipes: recipesJson.recipes,
} as unknown as DataPackV1;

export async function officialTestPack(): Promise<CompiledPack> {
  const checksum = await packChecksum(officialData);
  return compilePack({
    data: officialData,
    ref: {
      packId: officialData.manifest.packId,
      version: officialData.manifest.version,
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
