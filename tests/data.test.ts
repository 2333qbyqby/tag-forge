import { existsSync } from "node:fs";
import { canonicalPackJson, packChecksum } from "../src/packs/canonical";
import { normalizePack } from "../src/packs/normalize";
import { validatePack } from "../src/packs/validate";
import { officialData } from "./fixtures";

describe("official dataset", () => {
  it("uses the stable identity and two-layer canonical dataset", () => {
    expect(officialData.manifest.packId).toBe("tagforge-official");
    expect(officialData.manifest.dataVersion).toBe("2026.07.26");
    expect(
      officialData.categories.filter((category) => category.group === "design"),
    ).toHaveLength(8);
    expect(
      officialData.categories.filter((category) => category.group === "motif"),
    ).toHaveLength(6);
    expect(officialData.categories.map((category) => category.id)).not.toContain("theme");
    expect(officialData.categories.map((category) => category.id)).not.toContain("setting");
    expect(officialData.promptDecks).toHaveLength(1);
    expect(officialData.promptDecks[0].prompts).toHaveLength(34);
    expect(officialData.recipes.map((recipe) => recipe.id)).toEqual([
      "collision",
      "challenge",
      "prototype",
      "world-building",
      "historical-jam",
    ]);
  });

  it("keeps all current IDs unique", () => {
    const ids = [
      ...officialData.entries.map((entry) => entry.id),
      ...officialData.promptDecks[0].prompts.map((prompt) => prompt.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps historical themes separate from entries", () => {
    const entryIds = new Set(officialData.entries.map((entry) => entry.id));
    for (const prompt of officialData.promptDecks[0].prompts) {
      expect(entryIds.has(prompt.id)).toBe(false);
    }
  });

  it("normalizes missing category groups to design and rejects illegal groups", () => {
    const normalized = normalizePack({
      ...officialData,
      categories: officialData.categories.map((category, index) =>
        index === 0 ? { ...category, group: undefined } : category,
      ),
    });
    expect(normalized.categories[0].group).toBe("design");
    const invalid = normalizePack({
      ...officialData,
      categories: officialData.categories.map((category, index) =>
        index === 0 ? { ...category, group: "other" } : category,
      ),
    });
    expect(validatePack(invalid).issues.map((issue) => issue.code)).toContain(
      "category.group.invalid",
    );
  });

  it("gives every official motif formal game evidence without imposing a count quota", () => {
    const motifCategoryIds = new Set(
      officialData.categories
        .filter((category) => category.group === "motif")
        .map((category) => category.id),
    );
    const motifIds = officialData.entries
      .filter(
        (entry) =>
          entry.enabled !== false &&
          !entry.deprecatedBy &&
          motifCategoryIds.has(entry.categoryId),
      )
      .map((entry) => entry.id);
    const observed = new Set(
      officialData.provenance?.observations.map((observation) => observation.entryId),
    );
    expect(motifIds.length).toBeGreaterThan(0);
    expect(motifIds.every((id) => observed.has(id))).toBe(true);
    expect(
      officialData.provenance?.sources.every(
        (source) => source.kind === "game" && source.url.startsWith("https://"),
      ),
    ).toBe(true);
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
