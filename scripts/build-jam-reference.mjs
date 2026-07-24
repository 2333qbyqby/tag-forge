import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const ROOT = new URL("../", import.meta.url);
const DIRECTORY = new URL("data-cache/jam-reference/", ROOT);
const inputUrl = new URL("generator-sources.json", DIRECTORY);
const themesUrl = new URL("themes.json", DIRECTORY);
const manifestUrl = new URL("manifest.json", DIRECTORY);

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"'’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

await mkdir(DIRECTORY, { recursive: true });

let input;
try {
  input = JSON.parse(await readFile(inputUrl, "utf8"));
} catch (error) {
  console.error(
    "Missing or invalid data-cache/jam-reference/generator-sources.json.",
  );
  console.error(String(error));
  process.exit(1);
}

const errors = [];
if (!Array.isArray(input.sourceSeries)) {
  errors.push("sourceSeries must be an array.");
}
if (!Array.isArray(input.references)) {
  errors.push("references must be an array.");
}

const byTheme = new Map();
const ids = new Set();
for (const [index, reference] of (input.references ?? []).entries()) {
  const label = `references[${index}]`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(reference.id ?? "")) {
    errors.push(`${label}: invalid id.`);
  }
  if (ids.has(reference.id)) errors.push(`${label}: duplicate id ${reference.id}.`);
  ids.add(reference.id);
  if (!reference.series || !reference.event || !reference.theme || !reference.url) {
    errors.push(`${label}: series, event, theme and url are required.`);
    continue;
  }
  if (!/^https:\/\//.test(reference.url)) {
    errors.push(`${label}: official URL must use HTTPS.`);
  }
  const key = normalize(reference.theme);
  if (!key) {
    errors.push(`${label}: theme normalizes to an empty string.`);
    continue;
  }
  if (!byTheme.has(key)) {
    const pageSnapshot = JSON.stringify({
      event: reference.event,
      theme: reference.theme.trim(),
      url: reference.url,
    });
    byTheme.set(key, {
      id: reference.id,
      aliases: [reference.id],
      series: reference.series,
      event: reference.event,
      year:
        Number(String(reference.event).match(/\b(19|20)\d{2}\b/)?.[0]) ||
        null,
      theme: reference.theme.trim(),
      url: reference.url,
      normalizedTheme: key,
      fetchedAt: input.retrievedAt,
      pageHash: hash(pageSnapshot),
    });
  } else {
    byTheme.get(key).aliases.push(reference.id);
  }
}

const references = [...byTheme.values()];
const successfulSeries = new Set(
  references.map((reference) => reference.series),
);
if (references.length < 150) {
  errors.push(
    `Only ${references.length} normalized unique references; at least 150 are required.`,
  );
}
if (successfulSeries.size < 4) {
  errors.push(
    `Only ${successfulSeries.size} source series; at least 4 are required.`,
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

const output = {
  generatedAt: input.retrievedAt,
  handling:
    "Untrusted official jam themes normalized for structural research only; never merged directly into formal prompts.",
  referenceCount: references.length,
  seriesCount: successfulSeries.size,
  sourceSeries: input.sourceSeries,
  references,
  referenceIdAliases: Object.fromEntries(
    references.flatMap((reference) =>
      reference.aliases.map((alias) => [alias, reference.id]),
    ),
  ),
};
const serialized = `${JSON.stringify(output, null, 2)}\n`;
const manifest = {
  generatedAt: output.generatedAt,
  referenceCount: output.referenceCount,
  seriesCount: output.seriesCount,
  series: [...successfulSeries].sort(),
  sha256: hash(serialized),
  sourceFile: "generator-sources.json",
};

await writeFile(themesUrl, serialized, "utf8");
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  `Jam reference OK — ${references.length} unique themes across ${successfulSeries.size} series.`,
);
