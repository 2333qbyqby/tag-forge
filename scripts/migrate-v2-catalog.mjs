import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const catalogUrl = new URL("data-src/catalog.json", ROOT);
const relationsUrl = new URL("data-src/relations.json", ROOT);

const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
const relations = JSON.parse(await readFile(relationsUrl, "utf8"));

if (Array.isArray(catalog.tags)) {
  console.log("Catalog already uses the Engine 2 object schema.");
  process.exit(0);
}

const eligibleKinds = new Set([
  "genre",
  "mechanic",
  "theme",
  "mood",
  "presentation",
  "perspective",
]);

const parent = new Map();
const find = (id) => {
  const current = parent.get(id) ?? id;
  if (current === id) return id;
  const root = find(current);
  parent.set(id, root);
  return root;
};
const union = (a, b) => {
  const rootA = find(a);
  const rootB = find(b);
  if (rootA === rootB) return;
  const [first, second] = [rootA, rootB].sort();
  parent.set(second, first);
};

for (const entries of Object.values(catalog.groups ?? {})) {
  for (const [id] of entries) parent.set(id, id);
}
for (const [a, b] of relations.redundancy ?? []) union(a, b);

const kindPriority = new Map([
  ["mechanic", 0],
  ["genre", 1],
  ["theme", 2],
  ["mood", 3],
  ["presentation", 4],
  ["perspective", 5],
  ["setting", 6],
  ["goal", 7],
  ["constraint", 8],
  ["jamPrompt", 9],
]);

const rawTags = Object.entries(catalog.groups ?? {}).flatMap(([kind, entries]) =>
  entries.map(
    ([id, en, zh, clusters, rarity, scopeImpact, implementationRisk]) => ({
      id,
      labels: { en, zh },
      kind,
      aliases: [],
      family: find(id),
      clusters: clusters.split("|"),
      baseWeight: 1,
      rarity,
      scopeImpact,
      implementationRisk,
      generationEligible: eligibleKinds.has(kind),
      sourceRefs:
        kind === "jamPrompt"
          ? ["ggj-history-2026-07", "curated-2026-07"]
          : ["steam-tags-2026-07", "curated-2026-07"],
    }),
  ),
);

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s'’/&-]+/g, "")
    .trim();
const groupsByLabel = new Map();
for (const tag of rawTags) {
  if (!eligibleKinds.has(tag.kind)) continue;
  for (const key of [
    `en:${normalize(tag.labels.en)}`,
    `zh:${normalize(tag.labels.zh)}`,
  ]) {
    const values = groupsByLabel.get(key) ?? [];
    values.push(tag);
    groupsByLabel.set(key, values);
  }
}

for (const values of groupsByLabel.values()) {
  const unique = [...new Map(values.map((tag) => [tag.id, tag])).values()];
  if (unique.length < 2) continue;
  unique.sort(
    (a, b) =>
      (kindPriority.get(a.kind) ?? 99) - (kindPriority.get(b.kind) ?? 99) ||
      a.id.localeCompare(b.id),
  );
  const canonical = unique[0];
  for (const duplicate of unique.slice(1)) {
    if (duplicate.deprecatedBy) continue;
    duplicate.deprecatedBy = canonical.id;
    duplicate.generationEligible = false;
    canonical.aliases.push(duplicate.labels.en, duplicate.labels.zh);
  }
}

for (const tag of rawTags) {
  tag.aliases = [...new Set(tag.aliases)].filter(
    (alias) => alias !== tag.labels.en && alias !== tag.labels.zh,
  );
}

const migrated = {
  dataVersion: "2026.07.2",
  sourceRefs: catalog.sourceRefs ?? [],
  tags: rawTags,
};

await writeFile(catalogUrl, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
console.log(`Migrated ${rawTags.length} tags to the Engine 2 object schema.`);
