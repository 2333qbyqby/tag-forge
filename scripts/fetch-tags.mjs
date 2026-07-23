import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const OUTPUT_DIR = new URL("../data-cache/", import.meta.url);
const USER_AGENT =
  "TagForge/0.1 data-maintenance (+https://github.com/2333qbyqby/tag-forge)";

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, "accept-language": "en-US,en;q=0.9" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

async function fetchSteamTags() {
  const url = "https://partner.steamgames.com/doc/store/tags?l=english";
  const html = await fetchText(url);
  const section = html.split(/List of tags/i)[1] ?? html;
  const cells = [...section.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter(
      (value) =>
        value.length >= 2 &&
        value.length <= 60 &&
        !value.includes("http") &&
        !/^(Tag|Category|Examples?)$/i.test(value),
    );
  return {
    source: url,
    retrievedAt: new Date().toISOString(),
    tags: [...new Set(cells)].sort((a, b) => a.localeCompare(b)),
  };
}

async function fetchItchTags(pageCount) {
  const projects = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const url = `https://itch.io/tags?page=${page}`;
    const html = await fetchText(url);
    const regex = /href="\/(?:games\/)?tag-([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(regex)) {
      const label = decodeHtml(match[2]);
      if (!label || label.length > 60) continue;
      projects.push({ slug: match[1], label, page });
    }
  }
  return {
    source: "https://itch.io/tags",
    retrievedAt: new Date().toISOString(),
    pages: pageCount,
    tags: uniqueBy(projects, (item) => item.slug),
  };
}

async function fetchGgjThemes() {
  const url = "https://globalgamejam.org/history";
  const html = await fetchText(url);
  const text = decodeHtml(html);
  const matches = [
    ...text.matchAll(
      /\b(20(?:0[9]|1\d|2\d))\s*:\s*["“]?(.+?)["”]?(?=\s+20(?:0[9]|1\d|2\d)\s*:|$)/g,
    ),
  ];
  const themes = matches
    .map((match) => ({
      year: Number(match[1]),
      theme: match[2].replace(/\s+/g, " ").trim().slice(0, 180),
    }))
    .filter((item) => item.theme.length > 0);
  return {
    source: url,
    retrievedAt: new Date().toISOString(),
    themes: uniqueBy(themes, (item) => item.year),
  };
}

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

await mkdir(OUTPUT_DIR, { recursive: true });
const itchPages = Math.max(1, Math.min(16, Number(argument("itch-pages", "3"))));
const tasks = [
  ["steam-tags.json", fetchSteamTags],
  ["itch-tags.json", () => fetchItchTags(itchPages)],
  ["ggj-themes.json", fetchGgjThemes],
];

const summary = [];
for (const [filename, task] of tasks) {
  try {
    const data = await task();
    await writeFile(
      new URL(filename, OUTPUT_DIR),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf8",
    );
    const count = data.tags?.length ?? data.themes?.length ?? 0;
    summary.push({ source: filename, ok: true, count });
    console.log(`Fetched ${filename}: ${count} entries.`);
  } catch (error) {
    const detail =
      error instanceof Error && error.cause
        ? `${error.message}; cause: ${String(error.cause)}`
        : String(error);
    summary.push({ source: filename, ok: false, error: detail });
    console.error(`Failed ${filename}: ${detail}`);
  }
}

await writeFile(
  new URL("manifest.json", OUTPUT_DIR),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), sources: summary }, null, 2)}\n`,
  "utf8",
);

if (summary.every((item) => !item.ok)) process.exit(1);
console.log("Raw snapshots are in data-cache/. Review them before curating catalog.json.");
