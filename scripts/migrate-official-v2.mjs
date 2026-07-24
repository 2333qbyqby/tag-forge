import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const ROOT = new URL("../", import.meta.url);
const DATA_VERSION = "2026.07.3";

const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
const writeJson = async (path, value) =>
  writeFile(
    new URL(path, ROOT),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );

const catalog = await readJson("data-src/catalog.json");
const promptFile = await readJson("data-src/prompts.json");

const categoryRows = [
  ["genre", "类型", "Genre", "coral"],
  ["mechanic", "机制", "Mechanic", "acid"],
  ["theme", "主题", "Theme", "violet"],
  ["setting", "场景", "Setting", "cyan"],
  ["mood", "氛围", "Mood", "amber"],
  ["goal", "目标", "Goal", "green"],
  ["constraint", "限制", "Constraint", "red"],
  ["presentation", "表现", "Presentation", "blue"],
  ["perspective", "视角", "Perspective", "slate"],
];

const categories = categoryRows.map(([id, zh, en, color]) => ({
  id,
  labels: { zh, en },
  color,
  enabled: true,
}));

let historicalPrompts = [];
let regularTags = catalog.tags ?? catalog.entries ?? [];
if (regularTags.some((tag) => tag.kind === "jamPrompt")) {
  historicalPrompts = regularTags
    .filter((tag) => tag.kind === "jamPrompt")
    .map((tag) => ({
      id: tag.id,
      labels: tag.labels,
      family: tag.family ?? tag.id,
      facets: tag.clusters,
      baseWeight: tag.baseWeight ?? 1,
      origin: "historical-jam-theme",
      sourceRefs: tag.sourceRefs,
      enabled: !tag.deprecatedBy && tag.enabled !== false,
    }));
  regularTags = regularTags.filter((tag) => tag.kind !== "jamPrompt");
} else {
  const historicalFile = await readJson("data-src/historical-prompts.json");
  historicalPrompts = historicalFile.prompts;
}

const entries = regularTags.map((record) => {
  if ("categoryId" in record) return record;
  const {
    generationEligible: _generationEligible,
    kind,
    clusters,
    ...tag
  } = record;
  return {
    ...tag,
    categoryId: kind,
    facets: clusters,
  };
});

let legacyIds;
try {
  const legacyCatalog = JSON.parse(
    execFileSync(
      "git",
      ["show", "7244a80:data-src/catalog.json"],
      {
        cwd: new URL("../", import.meta.url),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  legacyIds = (
    legacyCatalog.tags ??
    Object.values(legacyCatalog.groups ?? {}).flat()
  )
    .map((record) => (Array.isArray(record) ? record[0] : record.id))
    .filter(Boolean)
    .sort();
} catch {
  legacyIds = (await readJson("data-src/migration-map.json")).legacyIds;
}

const prompts = (promptFile.prompts ?? []).map((prompt) => ({
  ...prompt,
  origin:
    prompt.origin === "jam-researched-original-v1"
      ? "jam-researched-original-v2"
      : prompt.origin,
}));

const commonCooldown = {
  entryWindow: 5,
  familyWindow: 3,
  pairWindow: 30,
};

const entrySlot = (id, zh, en, categoryIds, overrides = {}) => ({
  id,
  labels: { zh, en },
  source: "entries",
  categoryIds,
  required: true,
  ...overrides,
});

const promptSlot = (id, zh, en, deckId, overrides = {}) => ({
  id,
  labels: { zh, en },
  source: "promptDeck",
  deckId,
  required: true,
  ...overrides,
});

const recipes = [
  {
    id: "collision",
    labels: { zh: "二词碰撞", en: "Collision" },
    description: {
      zh: "用一个玩法方向撞上任意补充维度。",
      en: "Collide a gameplay direction with any supporting dimension.",
    },
    cooldown: commonCooldown,
    riskPolicy: "neutral",
    slots: [
      entrySlot("left", "方向 A", "Direction A", ["genre", "mechanic"], {
        allowCategoryOverride: true,
      }),
      entrySlot(
        "right",
        "方向 B",
        "Direction B",
        categoryRows.map(([id]) => id),
        { allowCategoryOverride: true },
      ),
    ],
  },
  {
    id: "challenge",
    labels: { zh: "开放挑战", en: "Open Challenge" },
    description: {
      zh: "两个基础方向与一条独立原创命题。",
      en: "Two base directions and an independently drawn original prompt.",
    },
    cooldown: commonCooldown,
    riskPolicy: "neutral",
    slots: [
      entrySlot("left", "方向 A", "Direction A", ["genre"]),
      entrySlot("right", "方向 B", "Direction B", ["mechanic"]),
      promptSlot("prompt", "开放命题", "Open Prompt", "original-prompts", {
        balanceBy: "type",
      }),
    ],
    variants: [
      {
        id: "genre-mechanic",
        weight: 35,
        slotCategoryIds: {
          left: ["genre"],
          right: ["mechanic"],
        },
      },
      {
        id: "mechanic-mechanic",
        weight: 20,
        slotCategoryIds: {
          left: ["mechanic"],
          right: ["mechanic"],
        },
      },
      {
        id: "mechanic-theme-mood",
        weight: 20,
        slotCategoryIds: {
          left: ["mechanic"],
          right: ["theme", "mood"],
        },
      },
      {
        id: "genre-theme-mood",
        weight: 15,
        slotCategoryIds: {
          left: ["genre"],
          right: ["theme", "mood"],
        },
      },
      {
        id: "gameplay-presentation-perspective",
        weight: 10,
        slotCategoryIds: {
          left: ["genre", "mechanic"],
          right: ["presentation", "perspective"],
        },
      },
    ],
  },
  {
    id: "prototype",
    labels: { zh: "独立原型", en: "Prototype" },
    description: {
      zh: "机制、玩法框架、玩家目标与开发限制。",
      en: "Mechanics, gameplay frame, player goal, and production constraint.",
    },
    cooldown: commonCooldown,
    riskPolicy: "prefer-lower",
    slots: [
      entrySlot("primary", "主机制", "Primary Mechanic", ["mechanic"]),
      entrySlot("frame", "类型 / 副机制", "Genre / Secondary Mechanic", [
        "genre",
        "mechanic",
      ]),
      entrySlot("goal", "玩家目标", "Player Goal", ["goal"]),
      entrySlot("constraint", "开发限制", "Constraint", ["constraint"]),
    ],
  },
  {
    id: "world-building",
    labels: { zh: "世界构建", en: "World Building" },
    description: {
      zh: "用主题、场景、氛围与视觉视角形成世界方向。",
      en: "Shape a world through theme, setting, mood, and presentation.",
    },
    cooldown: commonCooldown,
    riskPolicy: "neutral",
    slots: [
      entrySlot("theme", "主题", "Theme", ["theme"]),
      entrySlot("setting", "场景", "Setting", ["setting"]),
      entrySlot("mood", "氛围", "Mood", ["mood"]),
      entrySlot("presentation", "表现 / 视角", "Presentation / Perspective", [
        "presentation",
        "perspective",
      ]),
    ],
  },
  {
    id: "historical-jam",
    labels: { zh: "历史 Jam", en: "Historical Jam" },
    description: {
      zh: "从历史 Jam 主题出发，用机制、场景、限制与氛围收敛。",
      en: "Start from a historical jam theme and narrow it with game directions.",
    },
    cooldown: commonCooldown,
    riskPolicy: "prefer-lower",
    slots: [
      promptSlot("prompt", "历史主题", "Historical Theme", "historical-jam"),
      entrySlot("mechanic", "核心机制", "Core Mechanic", ["mechanic"]),
      entrySlot("setting", "场景", "Setting", ["setting"]),
      entrySlot("constraint", "限制", "Constraint", ["constraint"]),
      entrySlot("mood", "氛围", "Mood", ["mood"]),
    ],
  },
];

const manifest = {
  schemaVersion: 1,
  packId: "tagforge-official-v2",
  version: DATA_VERSION,
  dataVersion: DATA_VERSION,
  name: {
    zh: "TagForge 官方 V2",
    en: "TagForge Official V2",
  },
  description: {
    zh: "合并旧版设计词汇与 V2 原创命题的官方数据包。",
    en: "The official pack combining the original design vocabulary with V2 prompts.",
  },
  defaultLocale: "zh",
  locales: ["zh", "en"],
  files: {
    categories: "categories.csv",
    entries: "entries.csv",
    recipes: "recipes.json",
    prompts: "prompts.csv",
  },
  official: true,
};

await writeJson("data-src/catalog.json", {
  dataVersion: DATA_VERSION,
  sourceRefs: catalog.sourceRefs ?? [],
  entries,
});
await writeJson("data-src/prompts.json", {
  dataVersion: DATA_VERSION,
  prompts,
});
await writeJson("data-src/historical-prompts.json", {
  dataVersion: DATA_VERSION,
  prompts: historicalPrompts,
});
await writeJson("data-src/categories.json", {
  dataVersion: DATA_VERSION,
  categories,
});
await writeJson("data-src/recipes.json", {
  dataVersion: DATA_VERSION,
  recipes,
});
await writeJson("data-src/manifest.json", manifest);
await writeJson("data-src/migration-map.json", {
  dataVersion: DATA_VERSION,
  from: "official-v1",
  legacyIds,
  deprecatedBy: Object.fromEntries(
    entries
      .filter((entry) => entry.deprecatedBy)
      .map((entry) => [entry.id, entry.deprecatedBy]),
  ),
});

console.log(
  JSON.stringify(
    {
      dataVersion: DATA_VERSION,
      entries: entries.length,
      activeEntries: entries.filter(
        (entry) => entry.enabled !== false && !entry.deprecatedBy,
      ).length,
      originalPrompts: prompts.length,
      historicalPrompts: historicalPrompts.length,
      recipes: recipes.length,
    },
    null,
    2,
  ),
);
