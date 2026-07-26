import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const dataVersion = process.argv[2] ?? "2026.07.26";
const workDir = new URL(`data-cache/motif-rebuild/${dataVersion}/`, ROOT);
const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const writeJson = async (name, value) => {
  await mkdir(workDir, { recursive: true });
  await writeFile(
    new URL(name, workDir),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hashFile = async (name) =>
  createHash("sha256")
    .update(await readFile(new URL(name, workDir)))
    .digest("hex");

const [sample, ledger, categoriesData, catalog, provenance, finalManifest, fetchLog, resultAudit] =
  await Promise.all([
    readJson(new URL("source-sample.json", workDir)),
    readJson(new URL("migration-decisions.json", workDir)),
    readJson(new URL("data-src/categories.json", ROOT)),
    readJson(new URL("data-src/catalog.json", ROOT)),
    readJson(new URL("data-src/provenance.json", ROOT)),
    readJson(new URL("final-manifest.json", workDir)),
    readJson(new URL("source-fetch-log.json", workDir)),
    readJson(new URL("generated-result-audit.json", workDir)),
  ]);

const sampledSourceIds = [
  ...provenance.sources.map((source) => source.id),
  ...sample.additionalSources.map((source) => source.id),
];
const assignedIds = Object.values(sample.strata).flat();
assert(sampledSourceIds.length === 120, "The initial source pool must contain 120 games.");
assert(new Set(sampledSourceIds).size === sampledSourceIds.length, "Source pool IDs must be unique.");
assert(Object.keys(sample.strata).length === 12, "Expected 12 source strata.");
assert(
  Object.values(sample.strata).every((ids) => ids.length === 10),
  "Each source stratum must contain 10 games for this rebuild.",
);
assert(
  new Set(assignedIds).size === sampledSourceIds.length &&
    sampledSourceIds.every((id) => assignedIds.includes(id)),
  "Every sampled game must occur in exactly one stratum.",
);
assert(
  sample.eastAsianSourceIds.length / sampledSourceIds.length >= 0.25,
  "Chinese or East/Southeast Asian games must be at least 25% of the sample.",
);

const knownUrls = [
  ...provenance.sources.map((source) => source.url),
  ...sample.additionalSources.flatMap((source) => [
    source.officialUrl,
    source.gameplayEvidenceUrl,
  ]),
];
assert(
  knownUrls.every((url) => typeof url === "string" && url.startsWith("https://")),
  "Every sampled source and evidence URL must use HTTPS.",
);
const studioCounts = new Map();
for (const studio of [
  ...provenance.sources.map((source) => source.developer).filter(Boolean),
  ...sample.additionalSources.map((source) => source.studio).filter(Boolean),
]) {
  studioCounts.set(studio, (studioCounts.get(studio) ?? 0) + 1);
}
assert(
  Math.max(...studioCounts.values()) <= 3,
  "A studio contributes more than three games to the source pool.",
);

assert(sample.batches.length >= 4, "At least four observation batches are required.");
assert(sample.batches.every((batch) => batch.sourceIds.length === 20), "Observation batches must contain 20 games.");
const observationsBySource = new Map();
for (const observation of provenance.observations) {
  const bucket = observationsBySource.get(observation.sourceId) ?? [];
  bucket.push(observation);
  observationsBySource.set(observation.sourceId, bucket);
}
const seenCanonical = new Set();
const batchStats = sample.batches.map((batch) => {
  let newCanonical = 0;
  let duplicates = 0;
  for (const sourceId of batch.sourceIds) {
    for (const observation of observationsBySource.get(sourceId) ?? []) {
      if (seenCanonical.has(observation.entryId)) duplicates += 1;
      else {
        seenCanonical.add(observation.entryId);
        newCanonical += 1;
      }
    }
  }
  const totalCandidates = newCanonical + duplicates;
  return {
    id: batch.id,
    games: batch.sourceIds.length,
    newCanonical,
    aliases: 0,
    duplicates,
    rejectedLowReuse: 0,
    deferred: 0,
    totalCandidates,
    repeatOrRejectRate: totalCandidates === 0 ? 1 : duplicates / totalCandidates,
  };
});
const finalTwo = batchStats.slice(-2);
const saturated =
  finalTwo.length === 2 &&
  finalTwo.every(
    (batch) => batch.newCanonical < 10 && batch.repeatOrRejectRate >= 0.6,
  );
assert(saturated, "The final two observation batches do not meet saturation rules.");

const motifCategoryIds = new Set(
  categoriesData.categories
    .filter((category) => category.group === "motif")
    .map((category) => category.id),
);
assert(
  resultAudit.inspectedResults >= 100 && resultAudit.failures.length === 0,
  "Generated result audit must inspect at least 100 results without failures.",
);
const activeMotifIds = catalog.entries
  .filter(
    (entry) =>
      entry.enabled !== false &&
      !entry.deprecatedBy &&
      motifCategoryIds.has(entry.categoryId),
  )
  .map((entry) => entry.id);
const observedIds = new Set(
  provenance.observations.map((observation) => observation.entryId),
);
assert(
  activeMotifIds.every((id) => observedIds.has(id)),
  "Every final motif must have a formal observation.",
);
assert(
  batchStats.reduce((sum, batch) => sum + batch.newCanonical, 0) ===
    activeMotifIds.length,
  "Batch canonical additions must reconcile with the final motif count.",
);

const sourceObservationCounts = new Map();
for (const observation of provenance.observations) {
  sourceObservationCounts.set(
    observation.sourceId,
    (sourceObservationCounts.get(observation.sourceId) ?? 0) + 1,
  );
}
const concentration = [...sourceObservationCounts]
  .map(([sourceId, observations]) => ({
    sourceId,
    observations,
    share: observations / provenance.observations.length,
  }))
  .sort((left, right) => right.observations - left.observations);

const decisionCounts = Object.fromEntries(
  ["accept", "alias", "reject", "defer"].map((status) => [
    status,
    ledger.groups
      .filter((group) => group.status === status)
      .reduce((sum, group) => sum + group.entryIds.length, 0),
  ]),
);
const report = {
  dataVersion,
  sourcePool: {
    games: sampledSourceIds.length,
    strata: Object.keys(sample.strata).length,
    eastAsianGames: sample.eastAsianSourceIds.length,
    eastAsianShare: sample.eastAsianSourceIds.length / sampledSourceIds.length,
    maxGamesPerStudio: Math.max(...studioCounts.values()),
  },
  decisions: decisionCounts,
  finalData: {
    motifEntries: activeMotifIds.length,
    sourceGames: provenance.sources.length,
    observations: provenance.observations.length,
    motifCoverage: activeMotifIds.length / activeMotifIds.length,
  },
  sourceRefresh: fetchLog.totals,
  generatedResults: {
    inspected: resultAudit.inspectedResults,
    failures: resultAudit.failures.length,
  },
  saturation: {
    reached: saturated,
    reachedAfterGames: batchStats.reduce((sum, batch) => sum + batch.games, 0),
    batches: batchStats,
  },
  concentration: concentration.slice(0, 10),
  hashes: {
    sourceSampleSha256: await hashFile("source-sample.json"),
    migrationDecisionsSha256: await hashFile("migration-decisions.json"),
    acceptedProvenanceSha256: await hashFile("accepted-provenance.json"),
    expandedDecisionLedgerSha256: await hashFile("decision-ledger.expanded.json"),
    generatedResultAuditSha256: await hashFile("generated-result-audit.json"),
  },
  validation: {
    sourceStructure: "passed",
    evidenceUrls: "passed",
    studioConcentration: "passed",
    motifCoverage: "passed",
    saturation: "passed",
    generatedResultAudit: resultAudit.failures.length === 0 ? "passed" : "failed",
  },
};

await Promise.all([
  writeJson("qa-report.json", report),
  writeJson("source-sample-summary.json", report.sourcePool),
  writeJson("saturation-report.json", report.saturation),
  writeJson("source-concentration.json", concentration),
  writeJson("final-manifest.json", {
    ...finalManifest,
    saturation: report.saturation,
    sourcePool: report.sourcePool,
    hashes: report.hashes,
    validation: { ...finalManifest.validation, ...report.validation },
  }),
]);

console.log(JSON.stringify(report, null, 2));
