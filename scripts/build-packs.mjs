import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import Papa from "papaparse";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL(".tmp/public/", ROOT);
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
const writeJson = async (path, value) => {
  const target = new URL(path, OUT);
  await mkdir(new URL("./", target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

function checksum(pack) {
  const canonical = JSON.stringify(sortValue(pack));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

const manifest = await readJson("data-src/manifest.json");
const categories = (await readJson("data-src/categories.json")).categories;
const entries = (await readJson("data-src/catalog.json")).entries;
const originalPrompts = (await readJson("data-src/prompts.json")).prompts;
const historicalPrompts = (
  await readJson("data-src/historical-prompts.json")
).prompts;
const recipes = (await readJson("data-src/recipes.json")).recipes;

const officialPack = {
  manifest,
  categories,
  entries,
  promptDecks: [
    {
      id: "original-prompts",
      labels: { zh: "原创开放命题", en: "Original Open Prompts" },
      prompts: originalPrompts.map((prompt) => ({
        ...prompt,
        facets: prompt.motifs ?? [],
      })),
    },
    {
      id: "historical-jam",
      labels: { zh: "历史 Jam 主题", en: "Historical Jam Themes" },
      prompts: historicalPrompts,
    },
  ],
  recipes,
};

const officialChecksum = checksum(officialPack);
const officialPackPath = `packs/${manifest.packId}.tagforge.json`;
const officialAnalysisPath = `analysis/${manifest.packId}/analysis.json`;
await writeJson(officialPackPath, officialPack);
await writeJson("packs/official-registry.json", {
  packId: manifest.packId,
  dataVersion: manifest.dataVersion,
  checksum: officialChecksum,
  packPath: officialPackPath,
  analysisPath: officialAnalysisPath,
});

const commonCooldown = { entryWindow: 5, familyWindow: 3, pairWindow: 30 };
const minimalPack = {
  manifest: {
    packId: "example-minimal",
    dataVersion: manifest.dataVersion,
    name: { zh: "极简二词碰撞", en: "Minimal Collision" },
    defaultLocale: "zh",
    locales: ["zh", "en"],
    files: {
      categories: "categories.csv",
      entries: "entries.csv",
      recipes: "recipes.json",
    },
  },
  categories: [
    {
      id: "direction",
      labels: { zh: "方向", en: "Direction" },
      color: "acid",
      enabled: true,
    },
    {
      id: "modifier",
      labels: { zh: "修饰", en: "Modifier" },
      color: "violet",
      enabled: true,
    },
  ],
  entries: [
    {
      id: "movement",
      labels: { zh: "移动", en: "Movement" },
      categoryId: "direction",
      aliases: [],
      family: "movement",
      facets: ["action"],
      baseWeight: 1,
      rarity: 0.2,
      scopeImpact: 0,
      implementationRisk: 0.2,
      enabled: true,
    },
    {
      id: "memory",
      labels: { zh: "记忆", en: "Memory" },
      categoryId: "modifier",
      aliases: [],
      family: "memory",
      facets: ["identity"],
      baseWeight: 1,
      rarity: 0.4,
      scopeImpact: 0,
      implementationRisk: 0.3,
      enabled: true,
    },
  ],
  promptDecks: [],
  recipes: [
    {
      id: "collision",
      labels: { zh: "二词碰撞", en: "Collision" },
      description: { zh: "组合两个方向。", en: "Combine two directions." },
      cooldown: commonCooldown,
      riskPolicy: "neutral",
      slots: [
        {
          id: "left",
          labels: { zh: "方向 A", en: "Direction A" },
          source: "entries",
          categoryIds: ["direction"],
          required: true,
        },
        {
          id: "right",
          labels: { zh: "方向 B", en: "Direction B" },
          source: "entries",
          categoryIds: ["modifier"],
          required: true,
        },
      ],
    },
  ],
};

const jamTemplate = {
  ...minimalPack,
  manifest: {
    ...minimalPack.manifest,
    packId: "example-game-jam",
    name: { zh: "Game Jam 模板", en: "Game Jam Template" },
    files: {
      ...minimalPack.manifest.files,
      prompts: "prompts.csv",
    },
  },
  promptDecks: [
    {
      id: "prompts",
      labels: { zh: "命题", en: "Prompts" },
      prompts: [
        {
          id: "something-is-missing",
          labels: { zh: "有些东西消失了", en: "Something is missing" },
          family: "absence",
          facets: ["change"],
          baseWeight: 1,
          origin: "user",
          enabled: true,
        },
      ],
    },
  ],
  recipes: [
    {
      ...minimalPack.recipes[0],
      id: "jam",
      labels: { zh: "Jam 挑战", en: "Jam Challenge" },
      slots: [
        ...minimalPack.recipes[0].slots,
        {
          id: "prompt",
          labels: { zh: "命题", en: "Prompt" },
          source: "promptDeck",
          deckId: "prompts",
          required: true,
        },
      ],
    },
  ],
};

const multiDeckTemplate = {
  ...minimalPack,
  manifest: {
    ...minimalPack.manifest,
    packId: "example-multi-deck",
    name: { zh: "通用多卡组", en: "Generic Multi-deck" },
  },
  categories: [
    ...minimalPack.categories,
    {
      id: "constraint",
      labels: { zh: "限制", en: "Constraint" },
      color: "coral",
      enabled: true,
    },
  ],
  entries: [
    ...minimalPack.entries,
    {
      id: "one-input",
      labels: { zh: "单一输入", en: "One Input" },
      categoryId: "constraint",
      aliases: [],
      family: "one-input",
      facets: ["restriction"],
      baseWeight: 1,
      rarity: 0.4,
      scopeImpact: -0.2,
      implementationRisk: 0.2,
      enabled: true,
    },
  ],
  recipes: [
    {
      ...minimalPack.recipes[0],
      id: "multi-deck",
      labels: { zh: "多卡组", en: "Multi-deck" },
      slots: [
        ...minimalPack.recipes[0].slots,
        {
          id: "constraint",
          labels: { zh: "限制", en: "Constraint" },
          source: "entries",
          categoryIds: ["constraint"],
          required: true,
        },
      ],
    },
  ],
};

await writeJson("templates/minimal-collision.tagforge.json", minimalPack);
await writeJson("templates/game-jam.tagforge.json", jamTemplate);
await writeJson("templates/multi-deck.tagforge.json", multiDeckTemplate);

const categoryCsv = Papa.unparse(
  minimalPack.categories.map((category) => ({
    id: category.id,
    label_zh: category.labels.zh,
    label_en: category.labels.en,
    color: category.color ?? "",
    enabled: category.enabled,
  })),
);
const entryCsv = Papa.unparse(
  minimalPack.entries.map((entry) => ({
    id: entry.id,
    category_id: entry.categoryId,
    label_zh: entry.labels.zh,
    label_en: entry.labels.en,
    aliases: entry.aliases.join("|"),
    family: entry.family,
    facets: entry.facets.join("|"),
    base_weight: entry.baseWeight,
    rarity: entry.rarity,
    scope_impact: entry.scopeImpact,
    implementation_risk: entry.implementationRisk,
    composite_of: "",
    deprecated_by: "",
    enabled: entry.enabled,
  })),
);
const zip = zipSync({
  "manifest.json": strToU8(JSON.stringify(minimalPack.manifest, null, 2)),
  "categories.csv": strToU8(categoryCsv),
  "entries.csv": strToU8(entryCsv),
  "recipes.json": strToU8(JSON.stringify(minimalPack.recipes, null, 2)),
});
await mkdir(new URL("templates/", OUT), { recursive: true });
await writeFile(new URL("templates/minimal-collision.zip", OUT), zip);

console.log(
  JSON.stringify(
    {
      packId: manifest.packId,
      dataVersion: manifest.dataVersion,
      checksum: officialChecksum,
      entries: entries.length,
      prompts: originalPrompts.length + historicalPrompts.length,
      recipes: recipes.length,
    },
    null,
    2,
  ),
);
