import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const dataVersion = process.argv[2] ?? "2026.07.26";
const workDir = new URL(`data-cache/motif-rebuild/${dataVersion}/`, ROOT);

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const writeJson = async (url, value) => {
  await mkdir(new URL("./", url), { recursive: true });
  await writeFile(url, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const catalogUrl = new URL("data-src/catalog.json", ROOT);
const oldCatalog = await readJson(catalogUrl);
const decisionsUrl = new URL("migration-decisions.json", workDir);
const provenanceLedgerUrl = new URL("accepted-provenance.json", workDir);
const decisionsText = await readFile(decisionsUrl, "utf8");
const provenanceText = await readFile(provenanceLedgerUrl, "utf8");
const decisionInput = JSON.parse(decisionsText);
const decisions = {
  entries: decisionInput.entries ?? decisionInput.groups.flatMap((group) =>
    group.entryIds.map((entryId) => ({
      entryId,
      status: group.status,
      categoryId: group.categoryId,
      confidence: group.confidence,
      evidence: group.evidence,
      reason: group.reason,
    })),
  ),
  newEntries: decisionInput.newEntries ?? [],
};
const provenanceLedger = JSON.parse(provenanceText);

const legacyEntries = oldCatalog.entries.filter((entry) =>
  ["theme", "setting"].includes(entry.categoryId),
);
const alreadyMigrated = legacyEntries.length === 0;
const decisionsById = new Map(
  decisions.entries.map((decision) => [decision.entryId, decision]),
);
const missingDecisions = legacyEntries
  .filter((entry) => !decisionsById.has(entry.id))
  .map((entry) => entry.id);
const unknownDecisions = decisions.entries
  .filter(
    (decision) =>
      !legacyEntries.some((entry) => entry.id === decision.entryId),
  )
  .map((decision) => decision.entryId);
if (!alreadyMigrated && (missingDecisions.length || unknownDecisions.length)) {
  throw new Error(
    `Migration ledger mismatch. Missing: ${missingDecisions.join(", ") || "none"}; unknown: ${unknownDecisions.join(", ") || "none"}.`,
  );
}

const allowedStatuses = new Set(["accept", "alias", "reject", "defer"]);
const designCategoryIds = new Set([
  "genre",
  "mechanic",
  "world-frame",
  "mood",
  "goal",
  "constraint",
  "presentation",
  "perspective",
]);
const motifCategoryIds = new Set([
  "motif-entity",
  "motif-place",
  "motif-object",
  "motif-substance",
  "motif-phenomenon",
  "motif-concept",
]);
for (const decision of decisions.entries) {
  if (!allowedStatuses.has(decision.status)) {
    throw new Error(`Invalid decision status for ${decision.entryId}.`);
  }
  if (
    decision.status === "accept" &&
    !designCategoryIds.has(decision.categoryId) &&
    !motifCategoryIds.has(decision.categoryId)
  ) {
    throw new Error(`Invalid target category for ${decision.entryId}.`);
  }
  if (decision.confidence < 0.8 && decision.status !== "defer") {
    throw new Error(`Low-confidence candidate must be deferred: ${decision.entryId}.`);
  }
}

const categories = [
  ["genre", "类型", "Genre", "design", "coral"],
  ["mechanic", "机制", "Mechanic", "design", "acid"],
  ["world-frame", "题材框架", "World Frame", "design", "violet"],
  ["mood", "氛围／体验", "Mood / Experience", "design", "amber"],
  ["goal", "目标", "Goal", "design", "green"],
  ["constraint", "规则限制", "Rule Constraint", "design", "red"],
  ["presentation", "表现", "Presentation", "design", "blue"],
  ["perspective", "视角", "Perspective", "design", "slate"],
  ["motif-entity", "主体", "Entity", "motif", "rose"],
  ["motif-place", "空间", "Place", "motif", "cyan"],
  ["motif-object", "器物", "Object", "motif", "orange"],
  ["motif-substance", "物质／感官", "Substance / Sense", "motif", "teal"],
  ["motif-phenomenon", "现象／事件", "Phenomenon / Event", "motif", "indigo"],
  ["motif-concept", "概念／关系", "Concept / Relation", "motif", "pink"],
].map(([id, zh, en, group, color]) => ({
  id,
  labels: { zh, en },
  group,
  color,
  enabled: true,
}));

const retainedEntries = alreadyMigrated
  ? oldCatalog.entries
  : oldCatalog.entries.filter(
      (entry) => !["theme", "setting"].includes(entry.categoryId),
    );
const migratedEntries = legacyEntries.flatMap((entry) => {
  const decision = decisionsById.get(entry.id);
  if (decision.status === "reject" || decision.status === "defer") return [];
  const next = {
    ...entry,
    categoryId: decision.categoryId,
    ...(decision.aliases?.length
      ? { aliases: [...new Set([...(entry.aliases ?? []), ...decision.aliases])] }
      : {}),
    ...(decision.status === "alias"
      ? { deprecatedBy: decision.deprecatedBy, enabled: false }
      : {}),
  };
  return [next];
});
const newEntries = (decisions.newEntries ?? []).map((entry) => ({
  aliases: [],
  baseWeight: 1,
  rarity: 0.45,
  scopeImpact: 0,
  implementationRisk: 0.25,
  enabled: true,
  ...entry,
}));
const entries = alreadyMigrated
  ? retainedEntries
  : [...retainedEntries, ...migratedEntries, ...newEntries];
const entryIds = new Set();
for (const entry of entries) {
  if (entryIds.has(entry.id)) throw new Error(`Duplicate final entry: ${entry.id}.`);
  entryIds.add(entry.id);
}

const motifIds = new Set(
  entries
    .filter((entry) => motifCategoryIds.has(entry.categoryId))
    .map((entry) => entry.id),
);
const sources = provenanceLedger.sources;
const sourceById = new Map(sources.map((source) => [source.id, source]));
const finalEntryById = new Map(entries.map((entry) => [entry.id, entry]));
const expandedObservations = provenanceLedger.observations ??
  provenanceLedger.mappings.flatMap((mapping) => {
    const entry = finalEntryById.get(mapping.entryId);
    if (!entry) throw new Error(`Evidence mapping references missing entry: ${mapping.entryId}.`);
    return mapping.sourceIds.map((sourceId) => {
      const source = sourceById.get(sourceId);
      if (!source) throw new Error(`Evidence mapping references missing source: ${sourceId}.`);
      return {
        entryId: mapping.entryId,
        sourceId,
        evidenceUrl: mapping.evidenceUrl ?? source.url,
        channels: mapping.channels,
        salience:
          mapping.salience ?? (mapping.sourceIds.length === 1 ? "core" : "recurring"),
        note: mapping.note ?? {
          zh: `${source.labels.zh} 的官方页面与实机媒体支持通过 ${mapping.channels.join("、")} 观察到「${entry.labels.zh}」。`,
          en: `${source.labels.en}'s official page and gameplay media support observing ${entry.labels.en} through ${mapping.channels.join(", ")}.`,
        },
      };
    });
  });
const observations = expandedObservations.filter((observation) =>
  motifIds.has(observation.entryId),
);
const observedIds = new Set(observations.map((observation) => observation.entryId));
const unobservedMotifs = [...motifIds].filter((id) => !observedIds.has(id));
if (unobservedMotifs.length) {
  throw new Error(`Accepted motifs without evidence: ${unobservedMotifs.join(", ")}.`);
}
for (const observation of expandedObservations) {
  if (!motifIds.has(observation.entryId)) {
    throw new Error(`Observation targets a non-final motif: ${observation.entryId}.`);
  }
}

const motifCategories = [...motifCategoryIds];
const designCategories = [...designCategoryIds];
const motifSlot = (id, zh, en) => ({
  id,
  labels: { zh, en },
  source: "entries",
  categoryIds: motifCategories,
  required: true,
  allowCategoryOverride: true,
});
const recipes = [
  {
    id: "collision",
    labels: { zh: "二词碰撞", en: "Collision" },
    description: {
      zh: "组合两个稳定的设计坐标。",
      en: "Combine two stable design coordinates.",
    },
    cooldown: { entryWindow: 5, familyWindow: 3, pairWindow: 30 },
    riskPolicy: "neutral",
    slots: [
      {
        id: "left",
        labels: { zh: "设计方向 A", en: "Design Direction A" },
        source: "entries",
        categoryIds: ["genre", "mechanic"],
        required: true,
        allowCategoryOverride: true,
      },
      {
        id: "right",
        labels: { zh: "设计方向 B", en: "Design Direction B" },
        source: "entries",
        categoryIds: designCategories,
        required: true,
        allowCategoryOverride: true,
      },
    ],
  },
  {
    id: "challenge",
    labels: { zh: "意象挑战", en: "Motif Challenge" },
    description: {
      zh: "两个设计方向与三个自由组合的游戏意象。",
      en: "Two design directions and three freely combined game motifs.",
    },
    cooldown: { entryWindow: 5, familyWindow: 3, pairWindow: 30 },
    riskPolicy: "neutral",
    slots: [
      {
        id: "left",
        labels: { zh: "设计方向 A", en: "Design Direction A" },
        source: "entries",
        categoryIds: ["genre", "mechanic"],
        required: true,
        allowCategoryOverride: true,
      },
      {
        id: "right",
        labels: { zh: "设计方向 B", en: "Design Direction B" },
        source: "entries",
        categoryIds: designCategories,
        required: true,
        allowCategoryOverride: true,
      },
      motifSlot("motif-a", "意象 A", "Motif A"),
      motifSlot("motif-b", "意象 B", "Motif B"),
      motifSlot("motif-c", "意象 C", "Motif C"),
    ],
  },
  {
    id: "prototype",
    labels: { zh: "独立原型", en: "Prototype" },
    description: {
      zh: "机制、玩法框架、玩家目标与规则限制。",
      en: "Mechanics, gameplay frame, player goal, and rule constraint.",
    },
    cooldown: { entryWindow: 5, familyWindow: 3, pairWindow: 30 },
    riskPolicy: "prefer-lower",
    slots: [
      {
        id: "primary",
        labels: { zh: "主机制", en: "Primary Mechanic" },
        source: "entries",
        categoryIds: ["mechanic"],
        required: true,
      },
      {
        id: "frame",
        labels: { zh: "类型／副机制", en: "Genre / Secondary Mechanic" },
        source: "entries",
        categoryIds: ["genre", "mechanic"],
        required: true,
      },
      {
        id: "goal",
        labels: { zh: "玩家目标", en: "Player Goal" },
        source: "entries",
        categoryIds: ["goal"],
        required: true,
      },
      {
        id: "constraint",
        labels: { zh: "规则限制", en: "Rule Constraint" },
        source: "entries",
        categoryIds: ["constraint"],
        required: true,
      },
    ],
  },
  {
    id: "world-building",
    labels: { zh: "世界构建", en: "World Building" },
    description: {
      zh: "用题材框架、三个自由意象和一个表现方向形成世界。",
      en: "Build a world from a frame, three free motifs, and one presentation direction.",
    },
    cooldown: { entryWindow: 5, familyWindow: 3, pairWindow: 30 },
    riskPolicy: "neutral",
    slots: [
      {
        id: "world-frame",
        labels: { zh: "题材框架", en: "World Frame" },
        source: "entries",
        categoryIds: ["world-frame"],
        required: true,
      },
      motifSlot("motif-a", "意象 A", "Motif A"),
      motifSlot("motif-b", "意象 B", "Motif B"),
      motifSlot("motif-c", "意象 C", "Motif C"),
      {
        id: "presentation",
        labels: { zh: "氛围／表现／视角", en: "Mood / Presentation / Perspective" },
        source: "entries",
        categoryIds: ["mood", "presentation", "perspective"],
        required: true,
        allowCategoryOverride: true,
      },
    ],
  },
  {
    id: "historical-jam",
    labels: { zh: "历史 Jam", en: "Historical Jam" },
    description: {
      zh: "从历史 Jam 主题出发，用机制、意象、限制与氛围收敛。",
      en: "Start from a historical jam theme, then narrow it with a mechanic, motif, constraint, and mood.",
    },
    cooldown: { entryWindow: 5, familyWindow: 3, pairWindow: 30 },
    riskPolicy: "prefer-lower",
    slots: [
      {
        id: "prompt",
        labels: { zh: "历史主题", en: "Historical Theme" },
        source: "promptDeck",
        deckId: "historical-jam",
        required: true,
      },
      {
        id: "mechanic",
        labels: { zh: "核心机制", en: "Core Mechanic" },
        source: "entries",
        categoryIds: ["mechanic"],
        required: true,
      },
      motifSlot("motif", "任意意象", "Any Motif"),
      {
        id: "constraint",
        labels: { zh: "限制", en: "Constraint" },
        source: "entries",
        categoryIds: ["constraint"],
        required: true,
      },
      {
        id: "mood",
        labels: { zh: "氛围", en: "Mood" },
        source: "entries",
        categoryIds: ["mood"],
        required: true,
      },
    ],
  },
];

const manifest = {
  packId: "tagforge-official",
  dataVersion,
  name: { zh: "TagForge 官方数据集", en: "TagForge Official Dataset" },
  description: {
    zh: "面向独立游戏灵感组合的设计坐标、游戏意象与历史 Jam 主题。",
    en: "Design coordinates, observed game motifs, and historical jam themes for indie game ideation.",
  },
  defaultLocale: "zh",
  locales: ["zh", "en"],
  files: {
    categories: "categories.csv",
    entries: "entries.csv",
    recipes: "recipes.json",
    prompts: "prompts.csv",
    provenance: "provenance.json",
  },
  official: true,
};

const statusCounts = Object.fromEntries(
  [...allowedStatuses].map((status) => [
    status,
    decisions.entries.filter((decision) => decision.status === status).length,
  ]),
);
const finalManifest = {
  dataVersion,
  generatedAt: new Date().toISOString(),
  ledgers: {
    migrationDecisionsSha256: sha256(decisionsText),
    acceptedProvenanceSha256: sha256(provenanceText),
  },
  counts: {
    legacyCandidates: decisions.entries.length,
    decisions: statusCounts,
    designEntries: entries.filter((entry) => designCategoryIds.has(entry.categoryId)).length,
    motifEntries: motifIds.size,
    sources: sources.length,
    observations: observations.length,
  },
  validation: {
    decisionsCoverLegacyCandidates: true,
    everyMotifObserved: true,
    formalFilesWritten: true,
  },
};

await Promise.all([
  writeJson(new URL("data-src/categories.json", ROOT), { dataVersion, categories }),
  writeJson(catalogUrl, {
    dataVersion,
    sourceRefs: oldCatalog.sourceRefs,
    entries,
  }),
  writeJson(new URL("data-src/recipes.json", ROOT), { dataVersion, recipes }),
  writeJson(new URL("data-src/manifest.json", ROOT), manifest),
  writeJson(new URL("data-src/provenance.json", ROOT), { sources, observations }),
  writeJson(new URL("final-manifest.json", workDir), finalManifest),
  writeJson(new URL("migration-dry-run.json", workDir), {
    removedCategoryIds: ["theme", "setting"],
    statusCounts,
    retainedLegacyIds: decisions.entries
      .filter((decision) => ["accept", "alias"].includes(decision.status))
      .map((decision) => decision.entryId),
    omittedLegacyIds: decisions.entries
      .filter((decision) => ["reject", "defer"].includes(decision.status))
      .map((decision) => decision.entryId),
    newEntryIds: newEntries.map((entry) => entry.id),
  }),
  writeJson(new URL("decision-ledger.expanded.json", workDir), decisions),
]);

console.log(JSON.stringify(finalManifest, null, 2));
