import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const viteCli = new URL("node_modules/vite/bin/vite.js", ROOT);
const playwrightCli = new URL("node_modules/@playwright/test/cli.js", ROOT);
const server = spawn(
  process.execPath,
  [fileURLToPath(viteCli), "preview", "--host", "127.0.0.1", "--port", "4173"],
  { cwd: fileURLToPath(ROOT), stdio: "inherit" },
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Vite preview exited with ${server.exitCode}.`);
    }
    try {
      const response = await fetch("http://127.0.0.1:4173");
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for Vite preview.");
}

let exitCode = 1;
try {
  await waitForServer();
  const tests = spawn(process.execPath, [fileURLToPath(playwrightCli), "test"], {
    cwd: fileURLToPath(ROOT),
    stdio: "inherit",
    env: { ...process.env, TAGFORGE_E2E_EXTERNAL_SERVER: "1" },
  });
  exitCode = await new Promise((resolve) => {
    tests.on("exit", (code) => resolve(code ?? 1));
    tests.on("error", () => resolve(1));
  });
} finally {
  if (server.exitCode === null) server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(5_000),
  ]);
}

process.exitCode = exitCode;
