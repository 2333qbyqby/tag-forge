import { mkdir, readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const CACHE_DIR = new URL("data-cache/", ROOT);

function normalize(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const excludedLabels = new Set(
  [
    "Indie",
    "Singleplayer",
    "Multiplayer",
    "Early Access",
    "Free to Play",
    "Massively Multiplayer",
    "Online Co-Op",
    "Steam Achievements",
    "Steam Cloud",
    "Controller",
    "Mouse Only",
    "Keyboard Only",
    "VR",
    "VR Only",
    "TrackIR",
    "Remote Play Together",
    "Cross-Platform Multiplayer",
    "Includes Level Editor",
    "Moddable",
    "Trading Cards",
    "No AI",
    "AI Generated",
    "Asset Pack",
    "Game assets",
    "Game mods",
    "Unity",
    "Godot",
    "Unreal Engine",
    "RPG Maker",
    "GameMaker",
    "HTML5",
    "Windows",
    "macOS",
    "Linux",
    "Android",
    "iOS",
    "Browser",
    "Downloadable",
    "Prototype",
    "Educational",
    "Tutorial",
    "Kickstarter",
    "LGBT",
    "LGBTQIA",
    "Female Protagonist",
    "Male Protagonist",
    "Character Customization",
    "Mature",
    "NSFW",
    "Nudity",
    "Sexual Content",
    "Hentai",
    "Memes",
    "eSports",
    "Utilities",
    "Software",
    "Video Production",
    "Audio Production",
    "Animation & Modeling",
    "Design & Illustration",
    "Web Publishing",
    "Photo Editing",
  ].map(normalize),
);

const kindMatchers = [
  [
    "perspective",
    [
      "first person",
      "third person",
      "top down",
      "side scroller",
      "isometric",
      "fixed camera",
      "split screen",
      "text based",
      "360 video",
    ],
  ],
  [
    "presentation",
    [
      "pixel",
      "low poly",
      "voxel",
      "hand drawn",
      "stylized",
      "minimalist",
      "retro",
      "anime",
      "comic",
      "cartoon",
      "photorealistic",
      "black and white",
      "colorful",
      "abstract",
      "fmv",
      "cinematic",
      "ascii",
    ],
  ],
  [
    "mood",
    [
      "atmospheric",
      "relaxing",
      "funny",
      "comedy",
      "dark",
      "cute",
      "wholesome",
      "emotional",
      "suspense",
      "surreal",
      "psychedelic",
      "cozy",
      "creepy",
      "horror",
    ],
  ],
  [
    "mechanic",
    [
      "resource management",
      "choices matter",
      "trading",
      "physics",
      "procedural generation",
      "sailing",
      "mining",
      "hacking",
      "crafting",
      "building",
      "farming",
      "fishing",
      "cooking",
      "deckbuilding",
      "deck building",
      "automation",
      "parkour",
      "grappling hook",
      "time manipulation",
      "bullet time",
      "inventory management",
      "conversation",
      "stealth",
      "driving",
      "rhythm",
      "permadeath",
      "combat",
      "shooting",
      "destruction",
      "base building",
      "creature collector",
      "typing",
    ],
  ],
  [
    "theme",
    [
      "science fiction",
      "sci fi",
      "fantasy",
      "space",
      "cyberpunk",
      "steampunk",
      "post apocalyptic",
      "zombie",
      "vampire",
      "lovecraft",
      "war",
      "politic",
      "mytholog",
      "pirate",
      "nature",
      "romance",
      "mystery",
      "crime",
      "dystop",
      "supernatural",
      "time travel",
      "alternate history",
    ],
  ],
  [
    "genre",
    [
      "shooter",
      "adventure",
      "puzzle",
      "strategy",
      "rpg",
      "role playing",
      "racing",
      "sports",
      "visual novel",
      "dating sim",
      "tower defense",
      "souls like",
      "metroidvania",
      "beat em up",
      "shoot em up",
      "dungeon crawler",
      "colony sim",
      "life sim",
      "farming sim",
      "city builder",
      "auto battler",
      "4x",
      "rts",
      "tbs",
      "moba",
      "battle royale",
      "card battler",
      "extraction",
      "wargame",
      "hidden object",
      "match 3",
      "sokoban",
      "trivia",
      "party game",
      "rogue",
      "platformer",
      "simulation",
      "management",
      "incremental",
      "idle",
    ],
  ],
];

function inferCategory(label) {
  const normalized = normalize(label);
  for (const [kind, terms] of kindMatchers) {
    if (terms.some((term) => normalized.includes(term))) return kind;
  }
  return "unknown";
}

async function readJson(url, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    throw error;
  }
}

const catalog = await readJson(new URL("data-src/catalog.json", ROOT));
const steam = await readJson(new URL("steam-tags.json", CACHE_DIR), {
  optional: true,
});
const itch = await readJson(new URL("itch-tags.json", CACHE_DIR), {
  optional: true,
});

if (!steam && !itch) {
  throw new Error("No snapshots found. Run `pnpm data:fetch` first.");
}

const known = new Set();
const existingTags = Array.isArray(catalog.entries)
  ? catalog.entries
  : Array.isArray(catalog.tags)
    ? catalog.tags
  : Object.values(catalog.groups ?? {}).flatMap((entries) =>
      entries.map(([id, en, zh]) => ({ id, labels: { en, zh } })),
    );
for (const tag of existingTags) {
  known.add(normalize(tag.id.replaceAll("-", " ")));
  known.add(normalize(tag.labels.en));
  known.add(normalize(tag.labels.zh));
  for (const alias of tag.aliases ?? []) known.add(normalize(alias));
}

const merged = new Map();

function addCandidate(candidate) {
  const key = normalize(candidate.en);
  if (!key || known.has(key) || excludedLabels.has(key)) return;
  const current = merged.get(key);
  if (current) {
    current.sources.push(...candidate.sources);
    if (!current.zh && candidate.zh) current.zh = candidate.zh;
    if (!current.itchPage && candidate.itchPage) {
      current.itchPage = candidate.itchPage;
    }
    return;
  }
  merged.set(key, {
    en: candidate.en,
    zh: candidate.zh ?? "",
    suggestedCategoryId: inferCategory(candidate.en),
    steamTagId: candidate.steamTagId,
    steamRank: candidate.steamRank,
    itchPage: candidate.itchPage,
    sources: candidate.sources,
  });
}

for (const [index, tag] of (steam?.tags ?? []).entries()) {
  addCandidate({
    en: tag.en,
    zh: tag.zh,
    steamTagId: tag.id,
    steamRank: index + 1,
    sources: ["steam"],
  });
}

for (const tag of itch?.tags ?? []) {
  addCandidate({
    en: tag.label,
    itchPage: tag.page,
    sources: ["itch"],
  });
}

const candidates = [...merged.values()]
  .map((candidate) => ({
    ...candidate,
    sources: [...new Set(candidate.sources)].sort(),
  }))
  .sort((a, b) => {
    const aRank = a.steamRank ?? 10_000 + (a.itchPage ?? 100);
    const bRank = b.steamRank ?? 10_000 + (b.itchPage ?? 100);
    return aRank - bRank || a.en.localeCompare(b.en);
  });

const byCategory = Object.fromEntries(
  [...new Set(candidates.map((candidate) => candidate.suggestedCategoryId))]
    .sort()
    .map((categoryId) => [
      categoryId,
      candidates.filter(
        (candidate) => candidate.suggestedCategoryId === categoryId,
      ),
    ]),
);

await mkdir(CACHE_DIR, { recursive: true });
await writeFile(
  new URL("tag-candidates.json", CACHE_DIR),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      catalogVersion: catalog.dataVersion,
      existingTagCount: existingTags.length,
      candidateCount: candidates.length,
      byCategory,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `Suggested ${candidates.length} candidates across ${Object.keys(byCategory).length} categories.`,
);
for (const [categoryId, entries] of Object.entries(byCategory)) {
  console.log(`${categoryId.padEnd(14)} ${String(entries.length).padStart(3)}`);
}
console.log("Review data-cache/tag-candidates.json before editing catalog.json.");
