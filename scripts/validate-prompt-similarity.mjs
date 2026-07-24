import { readFile } from "node:fs/promises";
import process from "node:process";

const ROOT = new URL("../", import.meta.url);
const prompts = JSON.parse(
  await readFile(new URL("data-src/prompts.json", ROOT), "utf8"),
).prompts;
const references = JSON.parse(
  await readFile(
    new URL("data-cache/jam-reference/themes.json", ROOT),
    "utf8",
  ),
).references;
const auditText = await readFile(
  new URL(
    "data-reviews/2026.07.2.prompt-decisions.jsonl",
    ROOT,
  ),
  "utf8",
);
const audit = auditText
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Prompt audit line ${index + 1} is invalid JSON.`, {
        cause: error,
      });
    }
  });

function normalizedWords(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function compact(value) {
  return normalizedWords(value).replace(/\s+/g, "");
}

function levenshtein(left, right) {
  if (left.length < right.length) return levenshtein(right, left);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(left, right) {
  const a = compact(left);
  const b = compact(right);
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function tokenJaccard(left, right) {
  const a = new Set(normalizedWords(left).split(" ").filter(Boolean));
  const b = new Set(normalizedWords(right).split(" ").filter(Boolean));
  if (a.size < 2 || b.size < 2) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
}

const referenceIds = new Set(references.map((reference) => reference.id));
const integratedAudit = new Map(
  audit
    .filter((row) => row.status === "integrated")
    .map((row) => [row.id, row]),
);
const errors = [];
let closest = { promptId: "", referenceId: "", score: 0 };
let closestInternal = { leftId: "", rightId: "", score: 0 };

for (const prompt of prompts.filter((item) => item.enabled)) {
  const decision = integratedAudit.get(prompt.id);
  if (!decision) {
    errors.push(`${prompt.id}: missing integrated audit decision.`);
  } else {
    if (
      !Array.isArray(decision.referenceRefs) ||
      decision.referenceRefs.length < 1 ||
      decision.referenceRefs.some((id) => !referenceIds.has(id))
    ) {
      errors.push(`${prompt.id}: missing or invalid reference IDs.`);
    }
    if (!decision.divergenceNote?.trim()) {
      errors.push(`${prompt.id}: missing divergence note.`);
    }
    if (decision.prototypeFeasible !== true || !decision.reviewNote?.trim()) {
      errors.push(`${prompt.id}: missing positive playability conclusion.`);
    }
    if (
      !Array.isArray(decision.playabilityHooks) ||
      decision.playabilityHooks.length !== 2 ||
      decision.playabilityHooks.some((hook) => !String(hook).trim()) ||
      new Set(decision.playabilityHooks.map(normalizedWords)).size !== 2
    ) {
      errors.push(`${prompt.id}: requires two distinct playability hooks.`);
    }
  }

  for (const reference of references) {
    const editScore = similarity(prompt.labels.en, reference.theme);
    const wordScore = tokenJaccard(prompt.labels.en, reference.theme);
    const score = Math.max(editScore, wordScore);
    if (score > closest.score) {
      closest = { promptId: prompt.id, referenceId: reference.id, score };
    }
    const shortest = Math.min(
      compact(prompt.labels.en).length,
      compact(reference.theme).length,
    );
    if (
      compact(prompt.labels.en) === compact(reference.theme) ||
      (shortest >= 8 && editScore >= 0.86) ||
      wordScore >= 0.8
    ) {
      errors.push(
        `${prompt.id}: too similar to ${reference.id} ` +
          `(edit=${editScore.toFixed(3)}, tokens=${wordScore.toFixed(3)}).`,
      );
    }
  }
}

for (let leftIndex = 0; leftIndex < prompts.length; leftIndex += 1) {
  const left = prompts[leftIndex];
  for (
    let rightIndex = leftIndex + 1;
    rightIndex < prompts.length;
    rightIndex += 1
  ) {
    const right = prompts[rightIndex];
    const leftEn = compact(left.labels.en);
    const rightEn = compact(right.labels.en);
    const lengthRatio =
      Math.min(leftEn.length, rightEn.length) /
      Math.max(leftEn.length, rightEn.length);
    const editScore =
      lengthRatio >= 0.6 ? similarity(left.labels.en, right.labels.en) : 0;
    const wordScore = tokenJaccard(left.labels.en, right.labels.en);
    const zhScore =
      Math.min(compact(left.labels.zh).length, compact(right.labels.zh).length) >=
      6
        ? similarity(left.labels.zh, right.labels.zh)
        : 0;
    const score = Math.max(editScore, wordScore, zhScore);
    if (score > closestInternal.score) {
      closestInternal = { leftId: left.id, rightId: right.id, score };
    }
    if (editScore >= 0.9 || wordScore >= 0.9 || zhScore >= 0.92) {
      errors.push(
        `${left.id}/${right.id}: possible internal near-duplicate ` +
          `(en=${editScore.toFixed(3)}, tokens=${wordScore.toFixed(3)}, ` +
          `zh=${zhScore.toFixed(3)}).`,
      );
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(
    `\nPrompt similarity/audit validation failed with ${errors.length} error(s).`,
  );
  process.exit(1);
}

console.log(
  `Prompt provenance OK — ${prompts.length} prompts, ${references.length} references; ` +
    `closest source ${closest.promptId}/${closest.referenceId}=${closest.score.toFixed(3)}; ` +
    `closest internal ${closestInternal.leftId}/${closestInternal.rightId}=` +
    `${closestInternal.score.toFixed(3)}.`,
);
