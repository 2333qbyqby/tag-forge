import type {
  DataPack,
  PackValidationIssue,
  PackValidationReport,
  RecipeDefinition,
} from "./types";

const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const MAX_CATEGORIES = 64;
const MAX_ENTRIES = 20_000;
const MAX_PROMPTS = 20_000;
const MAX_RECIPES = 32;
const MAX_SLOTS = 12;
const OBSERVATION_CHANNELS = new Set([
  "visual",
  "interactive",
  "systemic",
  "narrative",
  "auditory",
  "spatial",
]);

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function issue(
  issues: PackValidationIssue[],
  code: string,
  path: string,
  message: string,
  level: PackValidationIssue["level"] = "error",
) {
  issues.push({ level, code, path, message });
}

function validateLocalized(
  issues: PackValidationIssue[],
  value: unknown,
  path: string,
) {
  const labels = value as { zh?: unknown; en?: unknown } | undefined;
  if (
    !labels ||
    typeof labels.zh !== "string" ||
    !labels.zh.trim() ||
    typeof labels.en !== "string" ||
    !labels.en.trim()
  ) {
    issue(issues, "labels.required", path, "必须提供非空的中英文文本。");
  }
}

function entriesCompatible(
  left: DataPack["entries"][number],
  right: DataPack["entries"][number],
) {
  if (left.id === right.id || left.family === right.family) return false;
  const leftParts = new Set([left.id, ...(left.compositeOf ?? [])]);
  const rightParts = new Set([right.id, ...(right.compositeOf ?? [])]);
  return ![...leftParts].some((part) => rightParts.has(part));
}

function recipeVariantReachable(
  recipe: RecipeDefinition,
  pack: DataPack,
  variant?: NonNullable<RecipeDefinition["variants"]>[number],
): boolean {
  for (const slot of recipe.slots.filter(
    (candidate) => candidate.source === "promptDeck" && candidate.required,
  )) {
    if (
      !pack.promptDecks
        .find((deck) => deck.id === slot.deckId)
        ?.prompts.some((prompt) => prompt.enabled)
    ) {
      return false;
    }
  }
  const pools = recipe.slots
    .filter((slot) => slot.source === "entries" && slot.required)
    .map((slot) => {
      const categoryIds =
        variant?.slotCategoryIds[slot.id] ?? slot.categoryIds ?? [];
      return pack.entries.filter(
        (entry) =>
          categoryIds.includes(entry.categoryId) &&
          entry.enabled !== false &&
          !entry.deprecatedBy,
      );
    })
    .sort((left, right) => left.length - right.length);
  let visits = 0;
  const search = (
    index: number,
    selected: DataPack["entries"],
  ): boolean => {
    if (index === pools.length) return true;
    if (visits > 50_000) return false;
    for (const entry of pools[index]) {
      visits += 1;
      if (selected.every((other) => entriesCompatible(entry, other))) {
        if (search(index + 1, [...selected, entry])) return true;
      }
    }
    return false;
  };
  return search(0, []);
}

function validateRecipe(
  recipe: RecipeDefinition,
  index: number,
  pack: DataPack,
  issues: PackValidationIssue[],
) {
  const path = `recipes[${index}]`;
  if (!ID_PATTERN.test(recipe.id ?? "")) {
    issue(issues, "id.invalid", `${path}.id`, "Recipe ID 格式无效。");
  }
  validateLocalized(issues, recipe.labels, `${path}.labels`);
  validateLocalized(issues, recipe.description, `${path}.description`);
  if (!["neutral", "prefer-lower"].includes(recipe.riskPolicy)) {
    issue(
      issues,
      "recipe.risk.invalid",
      `${path}.riskPolicy`,
      "riskPolicy 只能是 neutral 或 prefer-lower。",
    );
  }
  for (const key of ["entryWindow", "familyWindow", "pairWindow"] as const) {
    const value = recipe.cooldown?.[key];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 1000
    ) {
      issue(
        issues,
        "recipe.cooldown.invalid",
        `${path}.cooldown.${key}`,
        "冷却窗口必须是 0..1000 的整数。",
      );
    }
  }
  if (!Array.isArray(recipe.slots) || recipe.slots.length === 0) {
    issue(issues, "recipe.slots.empty", `${path}.slots`, "Recipe 至少需要一个槽位。");
    return;
  }
  if (recipe.slots.length > MAX_SLOTS) {
    issue(
      issues,
      "recipe.slots.limit",
      `${path}.slots`,
      `每个 Recipe 最多 ${MAX_SLOTS} 个槽位。`,
    );
  }
  const categoryIds = new Set(pack.categories.map((item) => item.id));
  const deckIds = new Set(pack.promptDecks.map((item) => item.id));
  const slotIds = new Set<string>();
  for (const [slotIndex, slot] of recipe.slots.entries()) {
    const slotPath = `${path}.slots[${slotIndex}]`;
    if (!ID_PATTERN.test(slot.id ?? "")) {
      issue(issues, "id.invalid", `${slotPath}.id`, "槽位 ID 格式无效。");
    }
    if (slotIds.has(slot.id)) {
      issue(issues, "id.duplicate", `${slotPath}.id`, "Recipe 内槽位 ID 重复。");
    }
    slotIds.add(slot.id);
    validateLocalized(issues, slot.labels, `${slotPath}.labels`);
    if (slot.source === "entries") {
      if (!slot.categoryIds?.length) {
        issue(
          issues,
          "slot.pool.empty",
          `${slotPath}.categoryIds`,
          "Entry 槽位必须声明 Category 池。",
        );
      }
      for (const categoryId of slot.categoryIds ?? []) {
        if (!categoryIds.has(categoryId)) {
          issue(
            issues,
            "reference.category",
            `${slotPath}.categoryIds`,
            `引用了不存在的 Category：${categoryId}`,
          );
        } else if (
          !pack.entries.some(
            (entry) =>
              entry.categoryId === categoryId &&
              entry.enabled !== false &&
              !entry.deprecatedBy,
          )
        ) {
          issue(
            issues,
            "slot.pool.unreachable",
            `${slotPath}.categoryIds`,
            `Category 没有可生成 Entry：${categoryId}`,
          );
        }
      }
    } else if (slot.source === "promptDeck") {
      if (slot.balanceBy !== undefined && slot.balanceBy !== "type") {
        issue(
          issues,
          "slot.balance.invalid",
          `${slotPath}.balanceBy`,
          "Prompt 平衡策略只能是 type。",
        );
      }
      if (!slot.deckId || !deckIds.has(slot.deckId)) {
        issue(
          issues,
          "reference.deck",
          `${slotPath}.deckId`,
          `引用了不存在的 Prompt Deck：${slot.deckId ?? ""}`,
        );
      } else if (
        !pack.promptDecks
          .find((deck) => deck.id === slot.deckId)
          ?.prompts.some((prompt) => prompt.enabled)
      ) {
        issue(
          issues,
          "slot.pool.unreachable",
          `${slotPath}.deckId`,
          "Prompt Deck 没有启用的命题。",
        );
      }
    } else {
      issue(issues, "slot.source.invalid", `${slotPath}.source`, "未知槽位来源。");
    }
  }
  for (const [variantIndex, variant] of (recipe.variants ?? []).entries()) {
    if (!(variant.weight > 0)) {
      issue(
        issues,
        "weight.invalid",
        `${path}.variants[${variantIndex}].weight`,
        "Variant 权重必须大于 0。",
      );
    }
    for (const [slotId, ids] of Object.entries(variant.slotCategoryIds)) {
      if (!slotIds.has(slotId)) {
        issue(
          issues,
          "reference.slot",
          `${path}.variants[${variantIndex}]`,
          `Variant 引用了不存在的槽位：${slotId}`,
        );
      }
      for (const categoryId of ids) {
        if (!categoryIds.has(categoryId)) {
          issue(
            issues,
            "reference.category",
            `${path}.variants[${variantIndex}]`,
            `Variant 引用了不存在的 Category：${categoryId}`,
          );
        }
      }
    }
    if (!recipeVariantReachable(recipe, pack, variant)) {
      issue(
        issues,
        "recipe.variant.unreachable",
        `${path}.variants[${variantIndex}]`,
        "Variant 无法产生满足槽位和组合规则的结果。",
      );
    }
  }
  if (!recipe.variants?.length && !recipeVariantReachable(recipe, pack)) {
    issue(
      issues,
      "recipe.unreachable",
      path,
      "Recipe 无法产生满足槽位和组合规则的结果。",
    );
  }
}

export function validatePack(pack: DataPack): PackValidationReport {
  const issues: PackValidationIssue[] = [];
  const summary = {
    categories: pack.categories?.length ?? 0,
    entries: pack.entries?.length ?? 0,
    prompts:
      pack.promptDecks?.reduce(
        (count, deck) => count + (deck.prompts?.length ?? 0),
        0,
      ) ?? 0,
    recipes: pack.recipes?.length ?? 0,
  };
  if (!ID_PATTERN.test(pack.manifest?.packId ?? "")) {
    issue(issues, "id.invalid", "manifest.packId", "Pack ID 格式无效。");
  }
  if (!pack.manifest?.dataVersion) {
    issue(
      issues,
      "data-version.required",
      "manifest.dataVersion",
      "缺少数据更新日期。",
    );
  }
  validateLocalized(issues, pack.manifest?.name, "manifest.name");
  if (
    !["zh", "en"].includes(pack.manifest?.defaultLocale) ||
    !Array.isArray(pack.manifest?.locales) ||
    pack.manifest.locales.length === 0 ||
    pack.manifest.locales.some((locale) => !["zh", "en"].includes(locale)) ||
    !pack.manifest.locales.includes(pack.manifest.defaultLocale)
  ) {
    issue(
      issues,
      "locale.invalid",
      "manifest.locales",
      "语言字段无效，且 locales 必须包含 defaultLocale。",
    );
  }
  if (
    (pack.manifest.files.provenance === "provenance.json") !==
    Boolean(pack.provenance)
  ) {
    issue(
      issues,
      "manifest.provenance.mismatch",
      "manifest.files.provenance",
      "provenance.json 声明与数据内容不一致。",
    );
  }
  const files = pack.manifest?.files;
  if (
    files?.categories !== "categories.csv" ||
    files?.entries !== "entries.csv" ||
    files?.recipes !== "recipes.json" ||
    (files.prompts !== undefined && files.prompts !== "prompts.csv") ||
    (files.provenance !== undefined && files.provenance !== "provenance.json")
  ) {
    issue(
      issues,
      "manifest.files.invalid",
      "manifest.files",
      "Manifest 文件声明无效。",
    );
  }
  if (!Array.isArray(pack.categories) || pack.categories.length === 0) {
    issue(issues, "categories.empty", "categories", "至少需要一个 Category。");
  } else if (pack.categories.length > MAX_CATEGORIES) {
    issue(
      issues,
      "categories.limit",
      "categories",
      `Category 数量不能超过 ${MAX_CATEGORIES}。`,
    );
  }
  if (!Array.isArray(pack.entries) || pack.entries.length === 0) {
    issue(issues, "entries.empty", "entries", "至少需要一个 Entry。");
  } else if (pack.entries.length > MAX_ENTRIES) {
    issue(
      issues,
      "entries.limit",
      "entries",
      `Entry 数量不能超过 ${MAX_ENTRIES}。`,
    );
  }
  if (!Array.isArray(pack.recipes) || pack.recipes.length === 0) {
    issue(issues, "recipes.empty", "recipes", "至少需要一个 Recipe。");
  } else if (pack.recipes.length > MAX_RECIPES) {
    issue(
      issues,
      "recipes.limit",
      "recipes",
      `Recipe 数量不能超过 ${MAX_RECIPES}。`,
    );
  }

  const categoryIds = new Set<string>();
  for (const [index, category] of (pack.categories ?? []).entries()) {
    if (!ID_PATTERN.test(category.id ?? "")) {
      issue(issues, "id.invalid", `categories[${index}].id`, "Category ID 格式无效。");
    }
    if (categoryIds.has(category.id)) {
      issue(issues, "id.duplicate", `categories[${index}].id`, "Category ID 重复。");
    }
    categoryIds.add(category.id);
    validateLocalized(issues, category.labels, `categories[${index}].labels`);
    if (!["design", "motif"].includes(category.group)) {
      issue(
        issues,
        "category.group.invalid",
        `categories[${index}].group`,
        "Category group 只能是 design 或 motif。",
      );
    }
  }

  const entryIds = new Set<string>();
  for (const [index, entry] of (pack.entries ?? []).entries()) {
    const path = `entries[${index}]`;
    if (!ID_PATTERN.test(entry.id ?? "")) {
      issue(issues, "id.invalid", `${path}.id`, "Entry ID 格式无效。");
    }
    if (entryIds.has(entry.id)) {
      issue(issues, "id.duplicate", `${path}.id`, "Entry ID 重复。");
    }
    entryIds.add(entry.id);
    validateLocalized(issues, entry.labels, `${path}.labels`);
    if (!categoryIds.has(entry.categoryId)) {
      issue(
        issues,
        "reference.category",
        `${path}.categoryId`,
        `引用了不存在的 Category：${entry.categoryId}`,
      );
    }
    if (!entry.family?.trim()) {
      issue(issues, "family.required", `${path}.family`, "Family 不能为空。");
    }
    if (!Array.isArray(entry.facets)) {
      issue(issues, "facets.invalid", `${path}.facets`, "Facets 必须是数组。");
    }
    if (!(entry.baseWeight > 0 && entry.baseWeight <= 4)) {
      issue(
        issues,
        "weight.invalid",
        `${path}.baseWeight`,
        "基础权重必须在 (0, 4]。",
      );
    }
    if (!(entry.rarity >= 0 && entry.rarity <= 1)) {
      issue(issues, "range.invalid", `${path}.rarity`, "rarity 必须位于 [0, 1]。");
    }
    if (!(entry.scopeImpact >= -1 && entry.scopeImpact <= 1)) {
      issue(
        issues,
        "range.invalid",
        `${path}.scopeImpact`,
        "scopeImpact 必须位于 [-1, 1]。",
      );
    }
    if (!(entry.implementationRisk >= 0 && entry.implementationRisk <= 1)) {
      issue(
        issues,
        "range.invalid",
        `${path}.implementationRisk`,
        "implementationRisk 必须位于 [0, 1]。",
      );
    }
  }
  for (const [index, entry] of (pack.entries ?? []).entries()) {
    if (entry.deprecatedBy && !entryIds.has(entry.deprecatedBy)) {
      issue(
        issues,
        "reference.deprecated",
        `entries[${index}].deprecatedBy`,
        `迁移目标不存在：${entry.deprecatedBy}`,
      );
    }
    for (const part of entry.compositeOf ?? []) {
      if (!entryIds.has(part)) {
        issue(
          issues,
          "reference.composite",
          `entries[${index}].compositeOf`,
          `复合组成不存在：${part}`,
        );
      }
    }
    const visited = new Set([entry.id]);
    let cursor = entry;
    while (cursor.deprecatedBy) {
      if (visited.has(cursor.deprecatedBy)) {
        issue(
          issues,
          "reference.cycle",
          `entries[${index}].deprecatedBy`,
          "deprecatedBy 存在循环。",
        );
        break;
      }
      visited.add(cursor.deprecatedBy);
      cursor =
        pack.entries.find((candidate) => candidate.id === cursor.deprecatedBy) ??
        cursor;
      if (cursor.id === entry.id) break;
    }
  }

  const deckIds = new Set<string>();
  const promptIds = new Set<string>();
  for (const [deckIndex, deck] of (pack.promptDecks ?? []).entries()) {
    if (!ID_PATTERN.test(deck.id ?? "") || deckIds.has(deck.id)) {
      issue(
        issues,
        deckIds.has(deck.id) ? "id.duplicate" : "id.invalid",
        `promptDecks[${deckIndex}].id`,
        "Prompt Deck ID 无效或重复。",
      );
    }
    deckIds.add(deck.id);
    validateLocalized(issues, deck.labels, `promptDecks[${deckIndex}].labels`);
    for (const [promptIndex, prompt] of (deck.prompts ?? []).entries()) {
      const path = `promptDecks[${deckIndex}].prompts[${promptIndex}]`;
      if (!ID_PATTERN.test(prompt.id ?? "") || promptIds.has(prompt.id)) {
        issue(
          issues,
          promptIds.has(prompt.id) ? "id.duplicate" : "id.invalid",
          `${path}.id`,
          "Prompt ID 无效或跨牌组重复。",
        );
      }
      if (entryIds.has(prompt.id)) {
        issue(
          issues,
          "id.duplicate",
          `${path}.id`,
          "Prompt ID 与 Entry ID 重复。",
        );
      }
      promptIds.add(prompt.id);
      validateLocalized(issues, prompt.labels, `${path}.labels`);
      if (!prompt.family?.trim()) {
        issue(issues, "family.required", `${path}.family`, "Prompt Family 不能为空。");
      }
      if (!(prompt.baseWeight > 0 && prompt.baseWeight <= 4)) {
        issue(issues, "weight.invalid", `${path}.baseWeight`, "Prompt 权重无效。");
      }
    }
  }
  if (summary.prompts > MAX_PROMPTS) {
    issue(
      issues,
      "prompts.limit",
      "promptDecks",
      `Prompt 数量不能超过 ${MAX_PROMPTS}。`,
    );
  }
  if (summary.prompts > 0 && pack.manifest.files.prompts !== "prompts.csv") {
    issue(
      issues,
      "manifest.files.missing",
      "manifest.files.prompts",
      "包含 Prompt 时必须声明 prompts.csv。",
    );
  }

  const sources = pack.provenance?.sources ?? [];
  const observations = pack.provenance?.observations ?? [];
  const sourceIds = new Set<string>();
  const sourceUrls = new Set<string>();
  for (const [index, source] of sources.entries()) {
    const path = `provenance.sources[${index}]`;
    if (!ID_PATTERN.test(source.id ?? "") || sourceIds.has(source.id)) {
      issue(
        issues,
        sourceIds.has(source.id) ? "id.duplicate" : "id.invalid",
        `${path}.id`,
        "来源 ID 无效或重复。",
      );
    }
    sourceIds.add(source.id);
    if (!["game", "taxonomy", "jam"].includes(source.kind)) {
      issue(issues, "source.kind.invalid", `${path}.kind`, "来源 kind 无效。");
    }
    validateLocalized(issues, source.labels, `${path}.labels`);
    if (!isHttpsUrl(source.url)) {
      issue(issues, "url.https.required", `${path}.url`, "来源 URL 必须使用 HTTPS。");
    }
    if (sourceUrls.has(source.url)) {
      issue(issues, "source.duplicate", `${path}.url`, "来源 URL 重复。");
    }
    sourceUrls.add(source.url);
    if (!/^\d{4}-\d{2}-\d{2}/.test(source.retrievedAt)) {
      issue(
        issues,
        "source.retrieved-at.invalid",
        `${path}.retrievedAt`,
        "retrievedAt 必须是 ISO 日期或时间。",
      );
    }
    if (
      source.releaseYear !== undefined &&
      (!Number.isInteger(source.releaseYear) ||
        source.releaseYear < 1970 ||
        source.releaseYear > 2200)
    ) {
      issue(issues, "source.year.invalid", `${path}.releaseYear`, "发行年份无效。");
    }
  }
  const observationKeys = new Set<string>();
  const observedEntries = new Set<string>();
  for (const [index, observation] of observations.entries()) {
    const path = `provenance.observations[${index}]`;
    const entry = pack.entries.find((candidate) => candidate.id === observation.entryId);
    if (!entry) {
      issue(
        issues,
        "reference.entry",
        `${path}.entryId`,
        `观察引用了不存在的 Entry：${observation.entryId}`,
      );
    } else if (
      pack.categories.find((category) => category.id === entry.categoryId)?.group !==
      "motif"
    ) {
      issue(
        issues,
        "observation.entry.group",
        `${path}.entryId`,
        "正式观察只能引用 motif Entry。",
      );
    } else if (entry.enabled === false || entry.deprecatedBy) {
      issue(
        issues,
        "observation.entry.inactive",
        `${path}.entryId`,
        "正式观察不能引用停用或已迁移的 Entry。",
      );
    } else {
      observedEntries.add(entry.id);
    }
    if (!sourceIds.has(observation.sourceId)) {
      issue(
        issues,
        "reference.source",
        `${path}.sourceId`,
        `观察引用了不存在的来源：${observation.sourceId}`,
      );
    }
    if (
      pack.manifest.official &&
      sources.find((source) => source.id === observation.sourceId)?.kind !== "game"
    ) {
      issue(
        issues,
        "observation.source.kind",
        `${path}.sourceId`,
        "官方 motif 观察必须引用游戏来源。",
      );
    }
    if (!isHttpsUrl(observation.evidenceUrl)) {
      issue(
        issues,
        "url.https.required",
        `${path}.evidenceUrl`,
        "证据 URL 必须使用 HTTPS。",
      );
    }
    if (
      !observation.channels.length ||
      new Set(observation.channels).size !== observation.channels.length ||
      observation.channels.some((channel) => !OBSERVATION_CHANNELS.has(channel))
    ) {
      issue(
        issues,
        "observation.channels.invalid",
        `${path}.channels`,
        "观察渠道必须非空、唯一且使用允许值。",
      );
    }
    if (!["core", "recurring"].includes(observation.salience)) {
      issue(
        issues,
        "observation.salience.invalid",
        `${path}.salience`,
        "显著性只能是 core 或 recurring。",
      );
    }
    validateLocalized(issues, observation.note, `${path}.note`);
    const key = `${observation.entryId}\u0000${observation.sourceId}\u0000${observation.evidenceUrl}`;
    if (observationKeys.has(key)) {
      issue(issues, "observation.duplicate", path, "存在重复的来源观察。");
    }
    observationKeys.add(key);
  }
  if (pack.manifest.official) {
    const usedSourceIds = new Set(observations.map((observation) => observation.sourceId));
    for (const source of sources) {
      if (!usedSourceIds.has(source.id)) {
        issue(
          issues,
          "source.unused",
          `provenance.sources.${source.id}`,
          "官方 provenance 不得包含未用于正式观察的来源。",
        );
      }
    }
    for (const entry of pack.entries) {
      if (
        entry.enabled !== false &&
        !entry.deprecatedBy &&
        pack.categories.find((category) => category.id === entry.categoryId)?.group ===
          "motif" &&
        !observedEntries.has(entry.id)
      ) {
        issue(
          issues,
          "motif.provenance.required",
          `entries.${entry.id}`,
          "官方 motif Entry 必须具有正式来源观察。",
        );
      }
    }
  }

  const recipeIds = new Set<string>();
  for (const [index, recipe] of (pack.recipes ?? []).entries()) {
    if (recipeIds.has(recipe.id)) {
      issue(issues, "id.duplicate", `recipes[${index}].id`, "Recipe ID 重复。");
    }
    recipeIds.add(recipe.id);
    validateRecipe(recipe, index, pack, issues);
  }

  const reachableEntries = new Set<string>();
  const reachablePrompts = new Set<string>();
  for (const recipe of pack.recipes ?? []) {
    for (const slot of recipe.slots ?? []) {
      if (slot.source === "entries") {
        for (const entry of pack.entries ?? []) {
          if (
            slot.categoryIds?.includes(entry.categoryId) &&
            entry.enabled !== false &&
            !entry.deprecatedBy
          ) {
            reachableEntries.add(entry.id);
          }
        }
      } else {
        for (const prompt of
          pack.promptDecks.find((deck) => deck.id === slot.deckId)?.prompts ?? []) {
          if (prompt.enabled) reachablePrompts.add(prompt.id);
        }
      }
    }
  }
  for (const entry of pack.entries ?? []) {
    if (
      entry.enabled !== false &&
      !entry.deprecatedBy &&
      !reachableEntries.has(entry.id)
    ) {
      issue(
        issues,
        "entry.unreachable",
        `entries.${entry.id}`,
        "启用 Entry 不可由任何 Recipe 到达。",
        "warning",
      );
    }
  }
  for (const deck of pack.promptDecks ?? []) {
    for (const prompt of deck.prompts ?? []) {
      if (prompt.enabled && !reachablePrompts.has(prompt.id)) {
        issue(
          issues,
          "prompt.unreachable",
          `promptDecks.${deck.id}.${prompt.id}`,
          "启用 Prompt 不可由任何 Recipe 到达。",
          "warning",
        );
      }
    }
  }

  return {
    valid: !issues.some((item) => item.level === "error"),
    issues,
    summary,
  };
}
