import { existsSync } from "node:fs";
import { canonicalPackJson, packChecksum } from "../src/packs/canonical";
import { validatePack } from "../src/packs/validate";
import { officialData } from "./fixtures";

describe("official dataset", () => {
  it("uses the stable identity and exact canonical datasets", () => {
    expect(officialData.manifest.packId).toBe("tagforge-official");
    expect(officialData.manifest.dataVersion).toBe("2026.07.25");
    expect(officialData.entries).toHaveLength(427);
    expect(
      officialData.entries.filter(
        (entry) => entry.enabled !== false && !entry.deprecatedBy,
      ),
    ).toHaveLength(424);
    expect(
      officialData.entries.filter((entry) => entry.deprecatedBy),
    ).toHaveLength(3);
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

  it("keeps all current IDs unique", () => {
    const allIds = new Set([
      ...officialData.entries.map((entry) => entry.id),
      ...officialData.promptDecks[1].prompts.map((prompt) => prompt.id),
    ]);
    expect(allIds.size).toBe(461);
    expect(officialData.promptDecks[0].prompts).toHaveLength(1000);
    expect(
      new Set(
        officialData.promptDecks[0].prompts.map((prompt) => prompt.origin),
      ),
    ).toEqual(new Set(["tagforge-original"]));
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
