import { readFile } from "node:fs/promises";
import process from "node:process";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL("data-src/catalog.json", root), "utf8"),
);
const relationCatalog = JSON.parse(
  await readFile(new URL("data-src/relations.json", root), "utf8"),
);
const promptCatalog = JSON.parse(
  await readFile(new URL("data-src/prompts.json", root), "utf8"),
);

const validKinds = new Set([
  "genre",
  "mechanic",
  "theme",
  "setting",
  "mood",
  "goal",
  "constraint",
  "presentation",
  "perspective",
  "jamPrompt",
]);
const generationKinds = new Set([
  "genre",
  "mechanic",
  "theme",
  "mood",
  "presentation",
  "perspective",
]);
const validRelations = new Set([
  "synergy",
  "tension",
  "redundancy",
  "soft-conflict",
  "hard-conflict",
]);
const promptTargets = {
  "open-choice": 180,
  "abstract-metaphor": 140,
  "change-consequence": 120,
  "relationship-identity": 100,
  "time-loop-rhythm": 90,
  "space-scale-boundary": 90,
  "perception-information": 90,
  "object-material-sensory": 70,
  "rule-resource-constraint": 60,
  "goal-start-situation": 30,
  "experimental-absurd": 30,
};
const promptFamilies = new Set([
  "choice-sacrifice",
  "loss-memory",
  "identity-change",
  "connection-separation",
  "truth-perception",
  "control-chaos",
  "time-repetition",
  "repair-decay",
  "belonging-departure",
  "responsibility-consequence",
  "nature-material",
  "play-absurdity",
]);

const errors = [];
const warnings = [];
const ids = new Set();
const tags = catalog.tags ?? [];
const catalogSourceIds = new Set(
  (catalog.sourceRefs ?? []).map((source) => source.id),
);

if (catalog.dataVersion !== "2026.07.2") {
  errors.push(`Expected catalog dataVersion 2026.07.2, got ${catalog.dataVersion}.`);
}
if (!Array.isArray(tags)) errors.push("catalog.tags must be an array.");

for (const [index, tag] of tags.entries()) {
  const label = `tags[${index}]`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag.id ?? "")) {
    errors.push(`${label}: invalid id ${tag.id}.`);
  }
  if (ids.has(tag.id)) errors.push(`${label}: duplicate id ${tag.id}.`);
  ids.add(tag.id);
  if (!tag.labels?.en || !tag.labels?.zh) {
    errors.push(`${tag.id}: English and Chinese labels are required.`);
  }
  if (!validKinds.has(tag.kind)) errors.push(`${tag.id}: invalid kind ${tag.kind}.`);
  if (!Array.isArray(tag.aliases)) errors.push(`${tag.id}: aliases must be an array.`);
  if (
    Array.isArray(tag.aliases) &&
    (tag.aliases.some((alias) => !String(alias).trim()) ||
      new Set(tag.aliases.map((alias) => String(alias).normalize("NFKC").toLowerCase()))
        .size !== tag.aliases.length)
  ) {
    errors.push(`${tag.id}: aliases must be non-empty and unique.`);
  }
  if (!tag.family || typeof tag.family !== "string") {
    errors.push(`${tag.id}: family is required.`);
  }
  if (!Array.isArray(tag.clusters) || tag.clusters.length === 0) {
    errors.push(`${tag.id}: at least one cluster is required.`);
  }
  if (tag.baseWeight <= 0 || tag.baseWeight > 4) {
    errors.push(`${tag.id}: baseWeight must be within (0, 4].`);
  }
  if (tag.rarity < 0 || tag.rarity > 1) {
    errors.push(`${tag.id}: rarity is outside 0..1.`);
  }
  if (tag.scopeImpact < -1 || tag.scopeImpact > 1) {
    errors.push(`${tag.id}: scopeImpact is outside -1..1.`);
  }
  if (tag.implementationRisk < 0 || tag.implementationRisk > 1) {
    errors.push(`${tag.id}: implementationRisk is outside 0..1.`);
  }
  if (!Array.isArray(tag.sourceRefs) || tag.sourceRefs.length === 0) {
    errors.push(`${tag.id}: sourceRefs are required.`);
  } else if (tag.sourceRefs.some((sourceRef) => !catalogSourceIds.has(sourceRef))) {
    errors.push(`${tag.id}: sourceRefs contain an unknown source.`);
  }
  if (tag.generationEligible && !generationKinds.has(tag.kind)) {
    errors.push(`${tag.id}: ${tag.kind} cannot be generationEligible.`);
  }
  if (tag.generationEligible && tag.deprecatedBy) {
    errors.push(`${tag.id}: deprecated tags cannot be generationEligible.`);
  }
  if (typeof tag.generationEligible !== "boolean") {
    errors.push(`${tag.id}: generationEligible must be boolean.`);
  }
}

for (const tag of tags) {
  if (tag.deprecatedBy) {
    if (!ids.has(tag.deprecatedBy)) {
      errors.push(`${tag.id}: deprecatedBy references missing tag ${tag.deprecatedBy}.`);
    }
    if (tag.deprecatedBy === tag.id) {
      errors.push(`${tag.id}: deprecatedBy cannot reference itself.`);
    }
  }
  const compositeParts = tag.compositeOf ?? [];
  if (new Set(compositeParts).size !== compositeParts.length) {
    errors.push(`${tag.id}: compositeOf entries must be unique.`);
  }
  for (const part of tag.compositeOf ?? []) {
    if (!ids.has(part)) errors.push(`${tag.id}: compositeOf references missing ${part}.`);
    if (part === tag.id) errors.push(`${tag.id}: compositeOf cannot reference itself.`);
  }
}

for (const tag of tags) {
  const visited = new Set([tag.id]);
  let cursor = tag;
  while (cursor?.deprecatedBy) {
    if (visited.has(cursor.deprecatedBy)) {
      errors.push(`${tag.id}: deprecatedBy contains a cycle.`);
      break;
    }
    visited.add(cursor.deprecatedBy);
    cursor = tags.find((candidate) => candidate.id === cursor.deprecatedBy);
  }
}

let relationCount = 0;
const pairKinds = new Set();
for (const [kind, entries] of Object.entries(relationCatalog)) {
  if (!validRelations.has(kind)) errors.push(`Unknown relation kind: ${kind}`);
  for (const [index, entry] of entries.entries()) {
    relationCount += 1;
    const [a, b, strength, confidence] = entry;
    if (!ids.has(a)) errors.push(`${kind}[${index}]: missing tag "${a}".`);
    if (!ids.has(b)) errors.push(`${kind}[${index}]: missing tag "${b}".`);
    if (a === b) errors.push(`${kind}[${index}]: self relation "${a}".`);
    if (strength < 0 || strength > 1) {
      errors.push(`${kind}[${index}]: strength is outside 0..1.`);
    }
    if (confidence < 0 || confidence > 1) {
      errors.push(`${kind}[${index}]: confidence is outside 0..1.`);
    }
    const pair = [a, b].sort().join("::");
    const key = `${kind}:${pair}`;
    if (pairKinds.has(key)) errors.push(`Duplicate ${kind} relation: ${pair}`);
    pairKinds.add(key);
  }
}

const normalize = (value) =>
  String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
const promptIds = new Set();
const zhTexts = new Set();
const enTexts = new Set();
const typeCounts = Object.fromEntries(
  Object.keys(promptTargets).map((type) => [type, 0]),
);
const familyCounts = Object.fromEntries(
  [...promptFamilies].map((family) => [family, 0]),
);
const prompts = promptCatalog.prompts ?? [];

if (promptCatalog.dataVersion !== "2026.07.2") {
  errors.push(
    `Expected prompt dataVersion 2026.07.2, got ${promptCatalog.dataVersion}.`,
  );
}
for (const [index, prompt] of prompts.entries()) {
  const label = `prompts[${index}]`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prompt.id ?? "")) {
    errors.push(`${label}: invalid id ${prompt.id}.`);
  }
  if (promptIds.has(prompt.id)) errors.push(`${label}: duplicate id ${prompt.id}.`);
  promptIds.add(prompt.id);
  if (!prompt.labels?.zh || !prompt.labels?.en) {
    errors.push(`${prompt.id}: bilingual labels are required.`);
  }
  const zh = normalize(prompt.labels?.zh);
  const en = normalize(prompt.labels?.en);
  if (zhTexts.has(zh)) errors.push(`${prompt.id}: duplicate normalized Chinese.`);
  if (enTexts.has(en)) errors.push(`${prompt.id}: duplicate normalized English.`);
  zhTexts.add(zh);
  enTexts.add(en);
  if (!(prompt.type in promptTargets)) {
    errors.push(`${prompt.id}: invalid type ${prompt.type}.`);
  } else if (prompt.enabled) {
    typeCounts[prompt.type] += 1;
  }
  if (!promptFamilies.has(prompt.family)) {
    errors.push(`${prompt.id}: invalid family ${prompt.family}.`);
  } else if (prompt.enabled) {
    familyCounts[prompt.family] += 1;
  }
  if (!Array.isArray(prompt.motifs) || prompt.motifs.length === 0) {
    errors.push(`${prompt.id}: motifs are required.`);
  } else if (
    prompt.motifs.some((motif) => !String(motif).trim()) ||
    new Set(prompt.motifs.map(normalize)).size !== prompt.motifs.length
  ) {
    errors.push(`${prompt.id}: motifs must be non-empty and unique.`);
  }
  if (prompt.baseWeight <= 0 || prompt.baseWeight > 4) {
    errors.push(`${prompt.id}: baseWeight must be within (0, 4].`);
  }
  if (prompt.origin !== "jam-researched-original-v1") {
    errors.push(`${prompt.id}: invalid origin ${prompt.origin}.`);
  }
  if (typeof prompt.enabled !== "boolean") {
    errors.push(`${prompt.id}: enabled must be boolean.`);
  }
}

const enabledPrompts = prompts.filter((prompt) => prompt.enabled);
if (prompts.length !== 1000) {
  errors.push(`Expected exactly 1000 prompt records, got ${prompts.length}.`);
}
if (enabledPrompts.length !== 1000) {
  errors.push(`Expected 1000 enabled prompts, got ${enabledPrompts.length}.`);
}
for (const [type, target] of Object.entries(promptTargets)) {
  if (typeCounts[type] !== target) {
    errors.push(`${type}: expected ${target}, got ${typeCounts[type]}.`);
  }
}
for (const [family, count] of Object.entries(familyCounts)) {
  if (count < 50 || count > 120) {
    errors.push(`${family}: expected 50..120 prompts, got ${count}.`);
  }
}

if (tags.length < 450) warnings.push(`Only ${tags.length} tags.`);
if (relationCount < 100) warnings.push(`Only ${relationCount} explicit relations.`);

for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`\nData validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Data OK — ${tags.length} tags, ${enabledPrompts.length} prompts, ${relationCount} explicit relations, version ${catalog.dataVersion}.`,
);
