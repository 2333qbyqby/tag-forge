import { existsSync } from "node:fs";
import migrationMap from "../data-src/migration-map.json";
import { canonicalPackJson, packChecksum } from "../src/packs/canonical";
import { validatePack } from "../src/packs/validate";
import { officialData } from "./fixtures";

describe("official V2 data pack", () => {
  it("contains the exact migrated datasets", () => {
    expect(officialData.manifest.schemaVersion).toBe(1);
    expect(officialData.manifest.version).toBe("2026.07.3");
    expect(officialData.entries).toHaveLength(427);
    expect(
      officialData.entries.filter(
        (entry) => entry.enabled !== false && !entry.deprecatedBy,
      ),
    ).toHaveLength(424);
    expect(
      officialData.entries.filter((entry) => entry.deprecatedBy),
    ).toHaveLength(3);
    expect(Object.keys(migrationMap.deprecatedBy)).toHaveLength(3);
    for (const [id, target] of Object.entries(migrationMap.deprecatedBy)) {
      expect(
        officialData.entries.find((entry) => entry.id === id)?.deprecatedBy,
      ).toBe(target);
      expect(officialData.entries.some((entry) => entry.id === target)).toBe(
        true,
      );
    }
    expect(officialData.promptDecks[0].prompts).toHaveLength(1000);
    expect(officialData.promptDecks[1].prompts).toHaveLength(34);
    expect(officialData.recipes.map((recipe) => recipe.id)).toEqual([
      "collision",
      "challenge",
      "prototype",
      "world-building",
      "historical-jam",
    ]);
  });

  it("preserves every official V1 ID and every current catalog ID", () => {
    const allIds = new Set([
      ...officialData.entries.map((entry) => entry.id),
      ...officialData.promptDecks[1].prompts.map((prompt) => prompt.id),
    ]);
    expect(migrationMap.legacyIds).toHaveLength(328);
    for (const id of migrationMap.legacyIds) expect(allIds.has(id)).toBe(true);
    expect(allIds.size).toBe(461);
    expect(officialData.promptDecks[0].prompts).toHaveLength(1000);
  });

  it("keeps historical themes separate from original prompts", () => {
    const entryIds = new Set(officialData.entries.map((entry) => entry.id));
    const originalIds = new Set(
      officialData.promptDecks[0].prompts.map((prompt) => prompt.id),
    );
    for (const prompt of officialData.promptDecks[1].prompts) {
      expect(entryIds.has(prompt.id)).toBe(false);
      expect(originalIds.has(prompt.id)).toBe(false);
    }
  });

  it("has valid references and complete declared recipe reachability", () => {
    const report = validatePack(officialData);
    expect(report.valid, JSON.stringify(report.issues, null, 2)).toBe(true);
    expect(
      report.issues.filter((issue) => issue.code.endsWith(".unreachable")),
    ).toEqual([]);
  });

  it("has no relation source and hashes canonically", async () => {
    expect(existsSync("data-src/relations.json")).toBe(false);
    expect(canonicalPackJson(officialData)).not.toContain('"relations"');
    expect(await packChecksum(officialData)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
