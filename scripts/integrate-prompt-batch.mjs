import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const ROOT = new URL("../", import.meta.url);
const PROMPTS_URL = new URL("data-src/prompts.json", ROOT);
const AUDIT_URL = new URL(
  "data-reviews/2026.07.2.prompt-decisions.jsonl",
  ROOT,
);
const REFERENCE_URL = new URL("data-cache/jam-reference/themes.json", ROOT);

const TARGETS = {
  "open-choice": 180,
  "abstract-metaphor": 140,
  "change-consequence": 120,
  "relationship-identity": 100,
  "time-loop-rhythm": 90,
  "space-scale-boundary": 90,
  "perception-information": 90,
  "object-material-sensory": 70,
  "rule-resource-constraint": 60,
  "goal-start-situation": 30,
  "experimental-absurd": 30,
};
const FAMILIES = new Set([
  "choice-sacrifice",
  "loss-memory",
  "identity-change",
  "connection-separation",
  "truth-perception",
  "control-chaos",
  "time-repetition",
  "repair-decay",
  "belonging-departure",
  "responsibility-consequence",
  "nature-material",
  "play-absurdity",
]);
const REJECT_REASONS = new Set([
  "source-too-close",
  "duplicate",
  "too-vague",
  "too-specific",
  "no-interaction",
  "scope-too-large",
  "wrong-type",
  "awkward-zh",
  "awkward-en",
  "translation-mismatch",
  "named-ip",
  "unsafe-for-public",
]);

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

async function readJsonLines(url) {
  const text = await readFile(url, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${url.pathname}:${index + 1}: invalid JSON`, {
          cause: error,
        });
      }
    });
}

const batch = argument("batch");
if (!/^\d{3}$/.test(batch ?? "")) {
  console.error("Usage: node scripts/integrate-prompt-batch.mjs --batch=001");
  process.exit(1);
}

const candidateUrl = new URL(
  `data-cache/prompt-batches/batch-${batch}.candidates.jsonl`,
  ROOT,
);
const decisionUrl = new URL(
  `data-cache/prompt-batches/batch-${batch}.decisions.jsonl`,
  ROOT,
);
const candidates = await readJsonLines(candidateUrl);
const decisions = await readJsonLines(decisionUrl);
if (candidates.length < 1 || candidates.length > 100) {
  throw new Error(`Batch ${batch} must contain 1..100 candidates.`);
}
if (decisions.length !== candidates.length) {
  throw new Error(
    `Batch ${batch} has ${candidates.length} candidates but ${decisions.length} decisions.`,
  );
}
if (new Set(decisions.map((decision) => decision.id)).size !== decisions.length) {
  throw new Error(`Batch ${batch} contains duplicate decision IDs.`);
}
if (decisions.some((decision) => !candidates.some((candidate) => candidate.id === decision.id))) {
  throw new Error(`Batch ${batch} contains a decision for an unknown candidate.`);
}
const decisionById = new Map(decisions.map((decision) => [decision.id, decision]));
const referenceData = JSON.parse(await readFile(REFERENCE_URL, "utf8"));
const canonicalReferenceId = new Map(
  Object.entries(referenceData.referenceIdAliases ?? {}),
);
const sourceTexts = new Set(
  referenceData.references.map((reference) => normalize(reference.theme)),
);

let promptFile;
try {
  promptFile = JSON.parse(await readFile(PROMPTS_URL, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  promptFile = { dataVersion: "2026.07.3", prompts: [] };
}
let priorAudit = "";
try {
  priorAudit = await readFile(AUDIT_URL, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (
  priorAudit
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .some((row) => row.batch === batch)
) {
  throw new Error(`Batch ${batch} has already been integrated.`);
}

const prompts = promptFile.prompts ?? [];
const ids = new Set(prompts.map((prompt) => prompt.id));
const zhTexts = new Set(prompts.map((prompt) => normalize(prompt.labels.zh)));
const enTexts = new Set(prompts.map((prompt) => normalize(prompt.labels.en)));
const typeCounts = Object.fromEntries(
  Object.keys(TARGETS).map((type) => [
    type,
    prompts.filter((prompt) => prompt.type === type).length,
  ]),
);
const familyCounts = Object.fromEntries(
  [...FAMILIES].map((family) => [
    family,
    prompts.filter((prompt) => prompt.family === family).length,
  ]),
);
const auditRows = [];
let integrated = 0;
let rejected = 0;
let skipped = 0;

for (const candidate of candidates) {
  const decision = decisionById.get(candidate.id);
  const failures = [];
  if (!decision) failures.push("missing-review");
  if (decision && !["accept", "reject"].includes(decision.decision)) {
    failures.push("invalid-review-decision");
  }
  if (
    decision?.decision === "accept" &&
    (decision.reasonCodes ?? []).length > 0
  ) {
    failures.push("accepted-with-reject-reason");
  }
  if (
    decision?.decision === "reject" &&
    (!Array.isArray(decision.reasonCodes) ||
      decision.reasonCodes.length === 0 ||
      decision.reasonCodes.some((reason) => !REJECT_REASONS.has(reason)))
  ) {
    failures.push("invalid-reject-reason");
  }
  if (decision?.decision !== "accept") failures.push(...(decision?.reasonCodes ?? ["rejected"]));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.id ?? "")) {
    failures.push("invalid-id");
  }
  if (!(candidate.type in TARGETS)) failures.push("wrong-type");
  if (!FAMILIES.has(candidate.family)) failures.push("wrong-family");
  if (!candidate.labels?.zh || !candidate.labels?.en) failures.push("missing-label");
  if (!Array.isArray(candidate.motifs) || candidate.motifs.length === 0) {
    failures.push("missing-motifs");
  }
  if (
    decision?.decision === "accept" &&
    (!Array.isArray(decision.playabilityHooks) ||
      decision.playabilityHooks.length !== 2 ||
      decision.playabilityHooks.some((hook) => !String(hook).trim()) ||
      new Set(
        decision.playabilityHooks.map((hook) => normalize(hook)),
      ).size !== 2)
  ) {
    failures.push("missing-playability-hooks");
  }
  if (decision?.decision === "accept" && !decision.reviewNote?.trim()) {
    failures.push("missing-playability-conclusion");
  }
  if (ids.has(candidate.id)) failures.push("duplicate-id");
  if (zhTexts.has(normalize(candidate.labels?.zh))) failures.push("duplicate-zh");
  if (enTexts.has(normalize(candidate.labels?.en))) failures.push("duplicate-en");
  if (sourceTexts.has(normalize(candidate.labels?.en))) failures.push("source-too-close");

  let status = "rejected";
  if (decision?.decision === "accept" && failures.length === 0) {
    if (typeCounts[candidate.type] >= TARGETS[candidate.type]) {
      status = "quota-full";
      skipped += 1;
    } else if (familyCounts[candidate.family] >= 120) {
      status = "family-quota-full";
      skipped += 1;
    } else {
      const prompt = {
        id: candidate.id,
        labels: candidate.labels,
        type: candidate.type,
        family: candidate.family,
        motifs: candidate.motifs,
        baseWeight: 1,
        origin: "jam-researched-original-v2",
        enabled: true,
      };
      prompts.push(prompt);
      ids.add(prompt.id);
      zhTexts.add(normalize(prompt.labels.zh));
      enTexts.add(normalize(prompt.labels.en));
      typeCounts[prompt.type] += 1;
      familyCounts[prompt.family] += 1;
      integrated += 1;
      status = "integrated";
    }
  } else {
    rejected += 1;
  }
  const candidateReferenceIds =
    candidate.referenceIds ?? candidate.referenceRefs ?? [];
  auditRows.push({
    dataVersion: "2026.07.3",
    batch,
    id: candidate.id,
    status,
    decision: decision?.decision ?? "reject",
    reasonCodes: [...new Set(failures)],
    referenceRefs: candidateReferenceIds.map(
      (id) => canonicalReferenceId.get(id) ?? id,
    ),
    divergenceNote: candidate.divergenceNote ?? "",
    reviewNote: decision?.reviewNote ?? "",
    prototypeFeasible: decision?.decision === "accept",
    playabilityHooks: decision?.playabilityHooks ?? [],
  });
}

promptFile.dataVersion = "2026.07.3";
promptFile.prompts = prompts;
const priorAuditRows = priorAudit
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .map((row) => ({
    ...row,
    referenceRefs: (row.referenceRefs ?? []).map(
      (id) => canonicalReferenceId.get(id) ?? id,
    ),
    prototypeFeasible:
      row.prototypeFeasible ?? row.decision === "accept",
  }));
await writeFile(PROMPTS_URL, `${JSON.stringify(promptFile, null, 2)}\n`, "utf8");
await writeFile(
  AUDIT_URL,
  `${[...priorAuditRows, ...auditRows]
    .map((row) => JSON.stringify(row))
    .join("\n")}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      batch,
      candidates: candidates.length,
      integrated,
      rejected,
      skipped,
      totalPrompts: prompts.length,
      typeCounts,
      familyCounts,
    },
    null,
    2,
  ),
);
