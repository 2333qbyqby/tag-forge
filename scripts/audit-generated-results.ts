import { mkdir, readFile, writeFile } from "node:fs/promises";
import { packChecksum } from "../src/packs/canonical";
import { compilePack } from "../src/packs/compile";
import type { DataPack, GeneratorSettings } from "../src/packs/types";
import {
  defaultGeneratorSettings,
  generateResult,
} from "../src/engine/pack-engine";

const ROOT = new URL("../", import.meta.url);
const registry = JSON.parse(
  await readFile(new URL(".tmp/public/packs/official-registry.json", ROOT), "utf8"),
) as { packPath: string };
const data = JSON.parse(
  await readFile(new URL(`.tmp/public/${registry.packPath}`, ROOT), "utf8"),
) as DataPack;
const checksum = await packChecksum(data);
const pack = compilePack({
  data,
  ref: {
    packId: data.manifest.packId,
    dataVersion: data.manifest.dataVersion,
    checksum,
  },
  origin: "official",
  capabilities: {
    generate: true,
    browse: true,
    history: true,
    export: true,
    analysis: true,
  },
});

const sourceTitles = new Set(
  (data.provenance?.sources ?? []).flatMap((source) => [
    source.labels.zh.trim().toLocaleLowerCase(),
    source.labels.en.trim().toLocaleLowerCase(),
  ]),
);
const sentencePunctuation = /[。！？.!?]/;
const failures: string[] = [];
const samples = [];

for (const recipe of data.recipes) {
  for (let index = 0; index < 20; index += 1) {
    const seed = `manual-audit:${recipe.id}:${index}`;
    const settings: GeneratorSettings = {
      ...defaultGeneratorSettings(pack),
      recipeId: recipe.id,
      seed,
      avoidRecent: false,
    };
    const result = generateResult(pack, settings, []);
    const rows = result.slots.map((slot) => {
      const group = slot.categoryId
        ? pack.categoryById.get(slot.categoryId)?.group
        : "prompt";
      const zh = slot.labels.zh.trim();
      const en = slot.labels.en.trim();
      if (sentencePunctuation.test(zh) || sentencePunctuation.test(en)) {
        failures.push(`${recipe.id}/${seed}/${slot.slotId}: sentence punctuation`);
      }
      if (
        group === "motif" &&
        (sourceTitles.has(zh.toLocaleLowerCase()) ||
          sourceTitles.has(en.toLocaleLowerCase()))
      ) {
        failures.push(`${recipe.id}/${seed}/${slot.slotId}: source title leaked`);
      }
      return {
        slotId: slot.slotId,
        itemId: slot.itemId,
        group,
        labels: slot.labels,
      };
    });
    if (recipe.id === "challenge") {
      const design = rows.filter((row) => row.group === "design").length;
      const motif = rows.filter((row) => row.group === "motif").length;
      if (design !== 2 || motif !== 3) {
        failures.push(`${recipe.id}/${seed}: expected 2 design + 3 motif`);
      }
    }
    samples.push({ recipeId: recipe.id, seed, slots: rows });
  }
}

const report = {
  dataVersion: data.manifest.dataVersion,
  checksum,
  inspectedResults: samples.length,
  checks: {
    noSentencePunctuation: failures.every(
      (failure) => !failure.includes("sentence punctuation"),
    ),
    noSourceTitleLeakInMotifs: failures.every(
      (failure) => !failure.includes("source title leaked"),
    ),
    challengeShape: failures.every(
      (failure) => !failure.includes("expected 2 design + 3 motif"),
    ),
    sameCategoryOrAbstractMotifsAreAllowed: true,
  },
  failures,
  samples,
};
const directory = new URL(
  `data-cache/motif-rebuild/${data.manifest.dataVersion}/`,
  ROOT,
);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("generated-result-audit.json", directory),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(
  `Result audit — ${samples.length} results, ${failures.length} failures.`,
);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
