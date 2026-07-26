import { readFile } from "node:fs/promises";
import { packChecksum } from "../src/packs/canonical";
import { importPackFile } from "../src/packs/importer";
import type { DataPack } from "../src/packs/types";
import { validatePack } from "../src/packs/validate";

const ROOT = new URL("../", import.meta.url);
const registry = JSON.parse(
  await readFile(
    new URL(".tmp/public/packs/official-registry.json", ROOT),
    "utf8",
  ),
) as {
  packId: string;
  dataVersion: string;
  checksum: string;
  packPath: string;
  analysisPath: string;
};
const pack = JSON.parse(
  await readFile(new URL(`.tmp/public/${registry.packPath}`, ROOT), "utf8"),
) as DataPack;
const templatePaths = [
  "minimal-collision.tagforge.json",
  "game-jam.tagforge.json",
  "multi-deck.tagforge.json",
];
const templates = await Promise.all(
  templatePaths.map(async (name) => ({
    name,
    pack: JSON.parse(
      await readFile(new URL(`.tmp/public/templates/${name}`, ROOT), "utf8"),
    ) as DataPack,
  })),
);

const report = validatePack(pack);
for (const item of report.issues) {
  const line = `${item.level.toUpperCase()} ${item.path}: ${item.message}`;
  if (item.level === "error") console.error(line);
  else console.warn(line);
}
const activeEntries = pack.entries.filter(
  (entry) => entry.enabled !== false && !entry.deprecatedBy,
);
const historicalDeck = pack.promptDecks.find(
  (deck) => deck.id === "historical-jam",
);
const expected = [
  [pack.manifest.packId === registry.packId, "Registry pack ID must match."],
  [
    pack.manifest.dataVersion === registry.dataVersion,
    "Registry data update date must match.",
  ],
  [
    registry.packPath === `packs/${pack.manifest.packId}.tagforge.json`,
    "Pack path must derive from the manifest pack ID.",
  ],
  [
    registry.analysisPath ===
      `analysis/${pack.manifest.packId}/analysis.json`,
    "Analysis path must derive from the manifest pack ID.",
  ],
  [
    pack.categories.filter((category) => category.group === "design").length === 8,
    "Expected 8 design categories.",
  ],
  [
    pack.categories.filter((category) => category.group === "motif").length === 6,
    "Expected 6 motif categories.",
  ],
  [
    pack.promptDecks.length === 1,
    "Expected only the historical prompt deck.",
  ],
  [historicalDeck?.prompts.length === 34, "Expected 34 historical prompts."],
  [pack.recipes.length === 5, "Expected 5 official recipes."],
  [
    pack.provenance?.sources.every((source) => source.url.startsWith("https://")) === true,
    "Expected HTTPS provenance sources.",
  ],
] as const;
for (const [valid, message] of expected) {
  if (!valid) {
    report.issues.push({
      level: "error",
      code: "snapshot.invalid",
      path: "official-pack",
      message,
    });
    console.error(`ERROR official-pack: ${message}`);
  }
}
const checksum = await packChecksum(pack);
if (checksum !== registry.checksum) {
  report.issues.push({
    level: "error",
    code: "checksum.invalid",
    path: "official-registry",
    message: "Official checksum does not match the canonical pack.",
  });
  console.error("ERROR official-registry: checksum mismatch.");
}
for (const template of templates) {
  const templateReport = validatePack(template.pack);
  for (const issue of templateReport.issues.filter(
    (item) => item.level === "error",
  )) {
    report.issues.push({
      ...issue,
      path: `templates/${template.name}/${issue.path}`,
    });
    console.error(
      `ERROR templates/${template.name}/${issue.path}: ${issue.message}`,
    );
  }
}
const minimalJsonBytes = await readFile(
  new URL(".tmp/public/templates/minimal-collision.tagforge.json", ROOT),
);
const minimalZipBytes = await readFile(
  new URL(".tmp/public/templates/minimal-collision.zip", ROOT),
);
const [minimalJson, minimalZip] = await Promise.all([
  importPackFile(
    new File(
      [new Uint8Array(minimalJsonBytes)],
      "minimal-collision.tagforge.json",
    ),
  ),
  importPackFile(
    new File([new Uint8Array(minimalZipBytes)], "minimal-collision.zip"),
  ),
]);
if (minimalJson.checksum !== minimalZip.checksum) {
  report.issues.push({
    level: "error",
    code: "template.checksum",
    path: "templates/minimal-collision",
    message: "JSON and ZIP/CSV templates do not normalize to the same checksum.",
  });
  console.error("ERROR templates/minimal-collision: checksum mismatch.");
}
if (!report.valid || report.issues.some((item) => item.level === "error")) {
  process.exit(1);
}
console.log(
  `Pack OK — ${activeEntries.length} active entries, ${report.summary.prompts} prompts, ${pack.recipes.length} recipes, ${checksum}.`,
);
