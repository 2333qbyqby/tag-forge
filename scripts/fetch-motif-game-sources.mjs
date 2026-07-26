import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const dataVersion = process.argv[2] ?? "2026.07.26";
const workDir = new URL(`data-cache/motif-rebuild/${dataVersion}/`, ROOT);
const snapshotDir = new URL("snapshots/steam/", workDir);
await mkdir(snapshotDir, { recursive: true });

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const [formal, sample] = await Promise.all([
  readJson(new URL("accepted-provenance.json", workDir)),
  readJson(new URL("source-sample.json", workDir)),
]);
const candidates = [
  ...formal.sources.map((source) => ({
    sourceId: source.id,
    expectedTitle: source.labels.en,
    url: source.url,
  })),
  ...sample.additionalSources.map((source) => ({
    sourceId: source.id,
    expectedTitle: source.title,
    url: source.officialUrl,
  })),
];

const appIdFor = (url) => new URL(url).pathname.match(/^\/app\/(\d+)/)?.[1];
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (process.argv.includes("--summarize-existing")) {
  const files = (await readdir(snapshotDir)).filter((name) => name.endsWith(".json"));
  const byAppId = new Map(
    candidates.map((candidate) => [appIdFor(candidate.url), candidate]),
  );
  const results = [];
  for (const name of files) {
    const appId = name.replace(/\.json$/, "");
    const body = await readFile(new URL(name, snapshotDir), "utf8");
    const parsed = JSON.parse(body);
    const data = parsed[appId]?.data;
    results.push({
      ...byAppId.get(appId),
      appId,
      status: "ok",
      snapshotSha256: sha256(body),
      resolvedTitle: String(data?.name ?? ""),
      screenshotCount: Array.isArray(data?.screenshots) ? data.screenshots.length : 0,
      movieCount: Array.isArray(data?.movies) ? data.movies.length : 0,
      snapshot: `snapshots/steam/${name}`,
    });
  }
  const log = {
    dataVersion,
    retrievedAt: new Date().toISOString(),
    method: "Partial Steam appdetails API refresh; the run was stopped after sustained throttling. Existing snapshots and failures remain local.",
    totals: {
      requested: candidates.length,
      succeeded: results.length,
      failedOrNotRefreshed: candidates.length - results.length,
      screenshotsIndexed: results.reduce((sum, result) => sum + result.screenshotCount, 0),
      moviesIndexed: results.reduce((sum, result) => sum + result.movieCount, 0),
    },
    results,
  };
  await writeFile(
    new URL("source-fetch-log.json", workDir),
    `${JSON.stringify(log, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(log.totals, null, 2));
  process.exit(0);
}

async function fetchOne(candidate) {
  const appId = appIdFor(candidate.url);
  if (!appId) {
    return { ...candidate, status: "invalid-url", error: "No Steam app ID." };
  }
  const apiUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(apiUrl, {
        signal: AbortSignal.timeout(20_000),
        headers: { "user-agent": "TagForge source audit/2026.07.26" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      const parsed = JSON.parse(body);
      const payload = parsed[appId];
      if (!payload?.success || !payload.data) {
        throw new Error("Steam API returned no successful app data.");
      }
      const snapshotPath = new URL(`${appId}.json`, snapshotDir);
      await writeFile(snapshotPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      return {
        ...candidate,
        appId,
        apiUrl,
        status: "ok",
        contentSha256: sha256(body),
        resolvedTitle: String(payload.data.name ?? ""),
        developerCount: Array.isArray(payload.data.developers)
          ? payload.data.developers.length
          : 0,
        screenshotCount: Array.isArray(payload.data.screenshots)
          ? payload.data.screenshots.length
          : 0,
        movieCount: Array.isArray(payload.data.movies)
          ? payload.data.movies.length
          : 0,
        snapshot: `snapshots/steam/${appId}.json`,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 3) await sleep(300 * attempt);
    }
  }
  return { ...candidate, appId, apiUrl, status: "failed", error: lastError };
}

const results = [];
const queue = [...candidates];
const workers = Array.from({ length: 6 }, async () => {
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) return;
    results.push(await fetchOne(candidate));
  }
});
await Promise.all(workers);
results.sort((left, right) => left.sourceId.localeCompare(right.sourceId));

const log = {
  dataVersion,
  retrievedAt: new Date().toISOString(),
  method: "Steam appdetails API. Responses are retained as untrusted local snapshots and are not copied into the formal pack.",
  totals: {
    requested: results.length,
    succeeded: results.filter((result) => result.status === "ok").length,
    failed: results.filter((result) => result.status !== "ok").length,
    screenshotsIndexed: results.reduce(
      (sum, result) => sum + (result.screenshotCount ?? 0),
      0,
    ),
    moviesIndexed: results.reduce(
      (sum, result) => sum + (result.movieCount ?? 0),
      0,
    ),
  },
  results,
};
await writeFile(
  new URL("source-fetch-log.json", workDir),
  `${JSON.stringify(log, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(log.totals, null, 2));
if (log.totals.succeeded === 0) process.exitCode = 1;
