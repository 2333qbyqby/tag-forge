import { readFile } from "node:fs/promises";
import process from "node:process";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("data-src/catalog.json", root), "utf8"));
const relationCatalog = JSON.parse(
  await readFile(new URL("data-src/relations.json", root), "utf8"),
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
const validRelations = new Set([
  "synergy",
  "tension",
  "redundancy",
  "soft-conflict",
  "hard-conflict",
]);
const errors = [];
const warnings = [];
const ids = new Set();
let tagCount = 0;

for (const [kind, entries] of Object.entries(catalog.groups ?? {})) {
  if (!validKinds.has(kind)) errors.push(`Unknown tag kind: ${kind}`);
  if (!Array.isArray(entries)) {
    errors.push(`Tag group "${kind}" is not an array.`);
    continue;
  }
  for (const [index, entry] of entries.entries()) {
    tagCount += 1;
    if (!Array.isArray(entry) || entry.length < 7) {
      errors.push(`${kind}[${index}] must contain 7 tuple values.`);
      continue;
    }
    const [id, en, zh, clusters, rarity, scope, risk] = entry;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      errors.push(`Invalid tag id: ${id}`);
    }
    if (ids.has(id)) errors.push(`Duplicate tag id: ${id}`);
    ids.add(id);
    if (!en || !zh) errors.push(`${id}: English and Chinese labels are required.`);
    if (!clusters || typeof clusters !== "string") {
      errors.push(`${id}: clusters must be a pipe-separated string.`);
    }
    if (rarity < 0 || rarity > 1) errors.push(`${id}: rarity is outside 0..1.`);
    if (scope < -1 || scope > 1) errors.push(`${id}: scope is outside -1..1.`);
    if (risk < 0 || risk > 1) errors.push(`${id}: risk is outside 0..1.`);
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
    if (pairKinds.has(key)) warnings.push(`Duplicate ${kind} relation: ${pair}`);
    pairKinds.add(key);
  }
}

for (const requiredKind of validKinds) {
  if (!catalog.groups[requiredKind]?.length) {
    errors.push(`Required tag group "${requiredKind}" is empty.`);
  }
}

if (tagCount < 250) warnings.push(`Only ${tagCount} tags; v0.1 target is at least 250.`);
if (relationCount < 150) {
  warnings.push(`Only ${relationCount} relations; v0.1 target is at least 150.`);
}

for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`\nData validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Data OK — ${tagCount} tags, ${relationCount} explicit relations, version ${catalog.dataVersion}.`,
);

