import { readFile } from "node:fs/promises";
import process from "node:process";

const ROOT = new URL("../", import.meta.url);

async function readJson(path, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    throw error;
  }
}

const catalog = await readJson("data-src/catalog.json");
const relationCatalog = await readJson("data-src/relations.json");
const promptCatalog = await readJson("data-src/prompts.json", { optional: true });
const fetchManifest = await readJson("data-cache/manifest.json", {
  optional: true,
});

const rows = [];
const kindById = new Map();
const degreeById = new Map();

const tags = Array.isArray(catalog.tags)
  ? catalog.tags
  : Object.entries(catalog.groups ?? {}).flatMap(([kind, entries]) =>
      entries.map(([id]) => ({ id, kind })),
    );
for (const tag of tags) {
  kindById.set(tag.id, tag.kind);
  degreeById.set(tag.id, 0);
}

for (const entries of Object.values(relationCatalog)) {
  for (const [a, b] of entries) {
    degreeById.set(a, (degreeById.get(a) ?? 0) + 1);
    degreeById.set(b, (degreeById.get(b) ?? 0) + 1);
  }
}

for (const kind of [...new Set(tags.map((tag) => tag.kind))]) {
  const entries = tags.filter((tag) => tag.kind === kind);
  const degrees = entries.map(({ id }) => degreeById.get(id) ?? 0);
  const linked = degrees.filter((degree) => degree > 0).length;
  rows.push({
    kind,
    tags: entries.length,
    linked,
    coverage: entries.length === 0 ? 0 : linked / entries.length,
    averageDegree:
      entries.length === 0
        ? 0
        : degrees.reduce((total, degree) => total + degree, 0) / entries.length,
    isolated: entries
      .filter(({ id }) => (degreeById.get(id) ?? 0) === 0)
      .map(({ id }) => id),
  });
}

const report = {
  dataVersion: catalog.dataVersion,
  tagCount: kindById.size,
  relationCount: Object.values(relationCatalog).reduce(
    (total, entries) => total + entries.length,
    0,
  ),
  relationsByKind: Object.fromEntries(
    Object.entries(relationCatalog).map(([kind, entries]) => [
      kind,
      entries.length,
    ]),
  ),
  groups: rows,
  prompts: {
    total: promptCatalog?.prompts?.filter((prompt) => prompt.enabled).length ?? 0,
    byType: Object.fromEntries(
      Object.entries(
        (promptCatalog?.prompts ?? []).reduce((counts, prompt) => {
          if (prompt.enabled) counts[prompt.type] = (counts[prompt.type] ?? 0) + 1;
          return counts;
        }, {}),
      ).sort(([a], [b]) => a.localeCompare(b)),
    ),
    byFamily: Object.fromEntries(
      Object.entries(
        (promptCatalog?.prompts ?? []).reduce((counts, prompt) => {
          if (prompt.enabled) {
            counts[prompt.family] = (counts[prompt.family] ?? 0) + 1;
          }
          return counts;
        }, {}),
      ).sort(([a], [b]) => a.localeCompare(b)),
    ),
  },
  snapshots: fetchManifest?.sources ?? [],
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(
  `TagForge data ${report.dataVersion} — ${report.tagCount} tags, ${report.relationCount} relations`,
);
console.log("");
console.log("Kind             Tags  Linked  Coverage  Avg degree");
console.log("---------------  ----  ------  --------  ----------");
for (const row of rows) {
  console.log(
    `${row.kind.padEnd(15)}  ${String(row.tags).padStart(4)}  ${String(row.linked).padStart(6)}  ${(row.coverage * 100).toFixed(1).padStart(7)}%  ${row.averageDegree.toFixed(2).padStart(10)}`,
  );
}

const isolated = rows.flatMap((row) =>
  row.isolated.map((id) => `${row.kind}:${id}`),
);
console.log("");
console.log(
  isolated.length === 0
    ? "Relation coverage: every tag has at least one explicit relation."
    : `Sparse relation graph: ${isolated.length} tag(s) have no explicit relation.`,
);

console.log("");
console.log("Relations");
for (const [kind, count] of Object.entries(report.relationsByKind)) {
  console.log(`${kind.padEnd(15)} ${String(count).padStart(4)}`);
}

console.log("");
console.log(`Engine 2 prompts: ${report.prompts.total}`);

if (report.snapshots.length > 0) {
  console.log("");
  console.log("Latest raw snapshots");
  for (const source of report.snapshots) {
    console.log(
      `${source.ok ? "OK  " : "FAIL"} ${source.source}: ${source.ok ? `${source.count} entries` : source.error}`,
    );
  }
}
