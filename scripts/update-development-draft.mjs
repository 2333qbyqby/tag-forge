import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dataVersion = "2026.07.26";
const currentVersions = new Set(["2026.07.3", "2026.07.25", dataVersion]);
const files = [
  "data-src/categories.json",
  "data-src/catalog.json",
  "data-src/recipes.json",
  "data-src/historical-prompts.json",
  "data-src/provenance.json",
];

for (const relativePath of files) {
  const url = new URL(relativePath, root);
  const data = JSON.parse(await readFile(url, "utf8"));
  if (!currentVersions.has(data.dataVersion)) {
    throw new Error(
      `${relativePath}: unexpected dataVersion ${String(data.dataVersion)}`,
    );
  }
  data.dataVersion = dataVersion;
  await writeFile(url, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

console.log(`Updated ${files.length} canonical data files to ${dataVersion}.`);
