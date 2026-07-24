import { unzipSync } from "fflate";
import Papa from "papaparse";
import { packChecksum } from "./canonical";
import type {
  CategoryDefinition,
  DataPackV1,
  EntryRecord,
  PackManifest,
  PackValidationReport,
  PromptDeck,
  PromptRecord,
  RecipeDefinition,
} from "./types";
import { validatePack } from "./validate";
import { normalizeManifest, normalizePack } from "./normalize";

const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 64;
const FORBIDDEN_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".svg",
  ".wasm",
];

export interface ImportedPack {
  pack: DataPackV1;
  checksum: string;
  report: PackValidationReport;
}

function splitList(value: unknown): string[] {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function bool(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  return ["true", "1", "yes"].includes(String(value).toLowerCase());
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv<T extends Record<string, string>>(text: string, name: string): T[] {
  const parsed = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`${name} 第 ${first.row ?? "?"} 行：${first.message}`);
  }
  return parsed.data;
}

function packFromZip(files: Record<string, Uint8Array>): DataPackV1 {
  const decoder = new TextDecoder();
  const required = ["manifest.json", "categories.csv", "entries.csv", "recipes.json"];
  for (const name of required) {
    if (!files[name]) throw new Error(`数据包缺少 ${name}。`);
  }
  const manifest = normalizeManifest(
    JSON.parse(decoder.decode(files["manifest.json"])),
  );
  if (
    (manifest.files.prompts === "prompts.csv") !==
    Boolean(files["prompts.csv"])
  ) {
    throw new Error("manifest.json 的 prompts.csv 声明与 ZIP 内容不一致。");
  }
  const categoryRows = parseCsv<Record<string, string>>(
    decoder.decode(files["categories.csv"]),
    "categories.csv",
  );
  const entryRows = parseCsv<Record<string, string>>(
    decoder.decode(files["entries.csv"]),
    "entries.csv",
  );
  const categories: CategoryDefinition[] = categoryRows.map((row) => ({
    id: row.id?.trim(),
    labels: { zh: row.label_zh?.trim(), en: row.label_en?.trim() },
    color: row.color?.trim() || undefined,
    enabled: bool(row.enabled),
  }));
  const entries: EntryRecord[] = entryRows.map((row) => ({
    id: row.id?.trim(),
    labels: { zh: row.label_zh?.trim(), en: row.label_en?.trim() },
    categoryId: row.category_id?.trim(),
    aliases: splitList(row.aliases),
    family: row.family?.trim() || row.id?.trim(),
    facets: splitList(row.facets),
    baseWeight: numberValue(row.base_weight, 1),
    rarity: numberValue(row.rarity, 0.5),
    scopeImpact: numberValue(row.scope_impact, 0),
    implementationRisk: numberValue(row.implementation_risk, 0.5),
    compositeOf: splitList(row.composite_of),
    deprecatedBy: row.deprecated_by?.trim() || undefined,
    sourceRefs: splitList(row.source_refs),
    enabled: bool(row.enabled),
  }));
  const recipes = JSON.parse(
    decoder.decode(files["recipes.json"]),
  ) as RecipeDefinition[];
  const promptDecks: PromptDeck[] = [];
  if (files["prompts.csv"]) {
    const promptRows = parseCsv<Record<string, string>>(
      decoder.decode(files["prompts.csv"]),
      "prompts.csv",
    );
    const rowsByDeck = new Map<string, Array<Record<string, string>>>();
    for (const row of promptRows) {
      const deckId = row.deck_id?.trim();
      const bucket = rowsByDeck.get(deckId) ?? [];
      bucket.push(row);
      rowsByDeck.set(deckId, bucket);
    }
    for (const [deckId, rows] of rowsByDeck) {
      const first = rows[0];
      const prompts: PromptRecord[] = rows.map((row) => ({
        id: row.id?.trim(),
        labels: { zh: row.label_zh?.trim(), en: row.label_en?.trim() },
        family: row.family?.trim() || row.id?.trim(),
        facets: splitList(row.facets),
        motifs: splitList(row.motifs),
        type: row.type?.trim() || undefined,
        baseWeight: numberValue(row.base_weight, 1),
        origin: row.origin?.trim() || "user",
        sourceRefs: splitList(row.source_refs),
        enabled: bool(row.enabled),
      }));
      promptDecks.push({
        id: deckId,
        labels: {
          zh: first.deck_label_zh?.trim() || deckId,
          en: first.deck_label_en?.trim() || deckId,
        },
        prompts,
      });
    }
  }
  return normalizePack({ manifest, categories, entries, promptDecks, recipes });
}

function assertArchivePath(name: string) {
  const normalized = name.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized.includes(":/") ||
    normalized.split("/").length > 2
  ) {
    throw new Error(`ZIP 包含不安全路径：${name}`);
  }
  const lower = normalized.toLowerCase();
  if (FORBIDDEN_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    throw new Error(`ZIP 包含禁止的文件类型：${name}`);
  }
}

function assertDeclarativeOnly(value: unknown, path = "pack") {
  if (typeof value === "string") {
    if (/<script|<svg|javascript:|data:text\/html/i.test(value)) {
      throw new Error(`数据包包含可执行或标记内容：${path}`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (
      /^(script|scripts|expression|expressions|executable|remoteResource|remoteResources|html|svg)$/i.test(
        key,
      )
    ) {
      throw new Error(`数据包包含不允许的字段：${path}.${key}`);
    }
    assertDeclarativeOnly(child, `${path}.${key}`);
  }
}

export async function importPackFile(file: File): Promise<ImportedPack> {
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error("数据包不能超过 10 MiB。");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pack: DataPackV1;
  if (file.name.toLowerCase().endsWith(".json")) {
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    assertDeclarativeOnly(raw);
    pack = normalizePack(raw);
  } else if (file.name.toLowerCase().endsWith(".zip")) {
    let declaredUnpackedBytes = 0;
    const unpacked = unzipSync(bytes, {
      filter(fileInfo) {
        assertArchivePath(fileInfo.name);
        declaredUnpackedBytes += fileInfo.originalSize;
        if (
          fileInfo.originalSize > MAX_UNPACKED_BYTES ||
          declaredUnpackedBytes > MAX_UNPACKED_BYTES
        ) {
          throw new Error(`ZIP 文件解压后过大：${fileInfo.name}`);
        }
        return true;
      },
    });
    const names = Object.keys(unpacked);
    if (names.length > MAX_FILES) throw new Error("ZIP 文件数量不能超过 64。");
    const total = Object.values(unpacked).reduce(
      (size, content) => size + content.byteLength,
      0,
    );
    if (total > MAX_UNPACKED_BYTES) {
      throw new Error("ZIP 解压后的总大小不能超过 25 MiB。");
    }
    const allowed = new Set([
      "manifest.json",
      "categories.csv",
      "entries.csv",
      "recipes.json",
      "prompts.csv",
    ]);
    for (const name of names) {
      assertArchivePath(name);
      if (!allowed.has(name)) throw new Error(`ZIP 包含未声明的文件：${name}`);
    }
    pack = packFromZip(unpacked);
  } else {
    throw new Error("仅支持 .tagforge.json、.json 或 .zip 数据包。");
  }
  const report = validatePack(pack);
  const checksum = await packChecksum(pack);
  return { pack, report, checksum };
}
