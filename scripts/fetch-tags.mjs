import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const OUTPUT_DIR = new URL("../data-cache/", import.meta.url);
const USER_AGENT =
  "TagForge/0.1 data-maintenance (+https://github.com/2333qbyqby/tag-forge)";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;

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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchText(
  url,
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES } = {},
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(400 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}`, { cause: error });
  }
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

async function fetchSteamTags(options) {
  const englishUrl =
    "https://store.steampowered.com/tagdata/populartags/english";
  const chineseUrl =
    "https://store.steampowered.com/tagdata/populartags/schinese";
  const [english, chinese] = await Promise.all([
    fetchJson(englishUrl, options),
    fetchJson(chineseUrl, options),
  ]);

  if (!Array.isArray(english) || !Array.isArray(chinese)) {
    throw new Error("Steam tag endpoints did not return arrays.");
  }

  const chineseById = new Map(
    chinese.map((item) => [Number(item.tagid), String(item.name).trim()]),
  );
  const tags = english
    .map((item) => ({
      id: Number(item.tagid),
      en: String(item.name).trim(),
      zh: chineseById.get(Number(item.tagid)) ?? "",
    }))
    .filter(
      (item) =>
        Number.isInteger(item.id) &&
        item.id > 0 &&
        item.en.length >= 2 &&
        item.en.length <= 80,
    );

  return {
    source: "https://partner.steamgames.com/doc/store/tags",
    endpoints: { english: englishUrl, simplifiedChinese: chineseUrl },
    retrievedAt: new Date().toISOString(),
    tags,
  };
}

async function fetchItchTags(pageCount, options) {
  const projects = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const url = `https://itch.io/tags?page=${page}`;
    const html = await fetchText(url, options);
    const regex =
      /href="\/games\/((?:tag|genre)-[^"/?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(regex)) {
      const label = decodeHtml(match[2]);
      if (!label || label.length > 60) continue;
      const route = match[1];
      projects.push({
        slug: route.replace(/^(?:tag|genre)-/, ""),
        label,
        type: route.startsWith("genre-") ? "genre" : "tag",
        page,
      });
    }
  }
  return {
    source: "https://itch.io/tags",
    retrievedAt: new Date().toISOString(),
    pages: pageCount,
    tags: uniqueBy(projects, (item) => item.slug),
  };
}

async function fetchGgjThemes(options) {
  const url = "https://globalgamejam.org/history";
  const html = await fetchText(url, options);
  const themes = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => decodeHtml(match[1]))
    .map((text) => text.match(/^(20(?:0[9]|1\d|2\d))\s*:\s*(.+)$/))
    .filter(Boolean)
    .map((match) => ({
      year: Number(match[1]),
      theme: match[2]
        .replace(/^["“]|["”]$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180),
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
const timeoutMs = Math.max(
  3_000,
  Math.min(120_000, Number(argument("timeout-ms", String(DEFAULT_TIMEOUT_MS)))),
);
const retries = Math.max(
  0,
  Math.min(5, Number(argument("retries", String(DEFAULT_RETRIES)))),
);
const requestOptions = { timeoutMs, retries };
const tasks = [
  ["steam-tags.json", () => fetchSteamTags(requestOptions)],
  ["itch-tags.json", () => fetchItchTags(itchPages, requestOptions)],
  ["ggj-themes.json", () => fetchGgjThemes(requestOptions)],
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
    try {
      const cached = JSON.parse(
        await readFile(new URL(filename, OUTPUT_DIR), "utf8"),
      );
      const count = cached.tags?.length ?? cached.themes?.length ?? 0;
      if (count <= 0) throw new Error("Cached snapshot is empty.");
      summary.push({
        source: filename,
        ok: true,
        cached: true,
        count,
        refreshError: detail,
      });
      console.warn(
        `Refresh failed for ${filename}; retained cached snapshot with ${count} entries.`,
      );
    } catch {
      summary.push({ source: filename, ok: false, error: detail });
      console.error(`Failed ${filename}: ${detail}`);
    }
  }
}

await writeFile(
  new URL("manifest.json", OUTPUT_DIR),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), sources: summary }, null, 2)}\n`,
  "utf8",
);

if (summary.every((item) => !item.ok)) process.exit(1);
console.log("Raw snapshots are in data-cache/. Review them before curating catalog.json.");
