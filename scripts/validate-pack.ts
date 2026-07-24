import { readFile } from "node:fs/promises";
import { packChecksum } from "../src/packs/canonical";
import { importPackFile } from "../src/packs/importer";
import type { DataPackV1 } from "../src/packs/types";
import { validatePack } from "../src/packs/validate";

const ROOT = new URL("../", import.meta.url);
const pack = JSON.parse(
  await readFile(
    new URL(".tmp/public/packs/tagforge-official-v2.tagforge.json", ROOT),
    "utf8",
  ),
) as DataPackV1;
const registry = JSON.parse(
  await readFile(
    new URL(".tmp/public/packs/official-registry.json", ROOT),
    "utf8",
  ),
) as { checksum: string };
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
    ) as DataPackV1,
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
const originalDeck = pack.promptDecks.find(
  (deck) => deck.id === "original-prompts",
);
const historicalDeck = pack.promptDecks.find(
  (deck) => deck.id === "historical-jam",
);
const expected = [
  [pack.manifest.schemaVersion === 1, "Schema version must be 1."],
  [pack.manifest.version === "2026.07.3", "Version must be 2026.07.3."],
  [pack.categories.length === 9, "Expected 9 categories."],
  [pack.entries.length === 427, "Expected 427 entry records."],
  [activeEntries.length === 424, "Expected 424 active entries."],
  [
    pack.entries.filter((entry) => entry.deprecatedBy).length === 3,
    "Expected 3 deprecated migration records.",
  ],
  [originalDeck?.prompts.length === 1000, "Expected 1000 original prompts."],
  [historicalDeck?.prompts.length === 34, "Expected 34 historical prompts."],
  [pack.recipes.length === 5, "Expected 5 official recipes."],
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
