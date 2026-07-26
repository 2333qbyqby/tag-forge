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

const [catalog, historical, categories, recipes, provenance, rebuildManifest, fetchManifest] =
  await Promise.all([
    readJson("data-src/catalog.json"),
    readJson("data-src/historical-prompts.json"),
    readJson("data-src/categories.json"),
    readJson("data-src/recipes.json"),
    readJson("data-src/provenance.json"),
    readJson(`data-cache/motif-rebuild/2026.07.26/final-manifest.json`, { optional: true }),
    readJson("data-cache/manifest.json", { optional: true }),
  ]);

const activeEntries = catalog.entries.filter(
  (entry) => entry.enabled !== false && !entry.deprecatedBy,
);
const report = {
  dataVersion: catalog.dataVersion,
  entries: {
    total: catalog.entries.length,
    active: activeEntries.length,
    deprecated: catalog.entries.filter((entry) => entry.deprecatedBy).length,
    byCategory: Object.fromEntries(
      categories.categories.map((category) => [
        category.id,
        activeEntries.filter((entry) => entry.categoryId === category.id).length,
      ]),
    ),
  },
  groups: Object.fromEntries(
    ["design", "motif"].map((group) => [
      group,
      activeEntries.filter((entry) =>
        categories.categories.some(
          (category) => category.id === entry.categoryId && category.group === group,
        ),
      ).length,
    ]),
  ),
  historicalThemes: historical.prompts.filter((prompt) => prompt.enabled).length,
  provenance: {
    sources: provenance.sources.length,
    games: provenance.sources.filter((source) => source.kind === "game").length,
    observations: provenance.observations.length,
    motifCoverage:
      activeEntries.filter((entry) =>
        categories.categories.some(
          (category) => category.id === entry.categoryId && category.group === "motif",
        ),
      ).filter((entry) =>
        provenance.observations.some((observation) => observation.entryId === entry.id),
      ).length,
  },
  saturation: rebuildManifest?.saturation ?? null,
  recipes: recipes.recipes.map((recipe) => ({
    id: recipe.id,
    slots: recipe.slots.length,
    variants: recipe.variants?.length ?? 0,
  })),
  relations: 0,
  snapshots: fetchManifest?.sources ?? [],
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(
  `TagForge official dataset ${report.dataVersion} — ` +
    `${report.entries.active}/${report.entries.total} active entries, ` +
    `${report.groups.design} design, ${report.groups.motif} motif, ` +
    `${report.historicalThemes} historical themes, ` +
    `${report.provenance.games} source games, ` +
    `${report.recipes.length} recipes, no relation model.`,
);
for (const [category, count] of Object.entries(report.entries.byCategory)) {
  console.log(`${category.padEnd(14)} ${String(count).padStart(4)}`);
}
for (const recipe of report.recipes) {
  console.log(
    `${recipe.id.padEnd(18)} ${recipe.slots} slots, ${recipe.variants} variants`,
  );
}
