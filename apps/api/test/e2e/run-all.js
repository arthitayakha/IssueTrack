/**
 * Runs every E2E suite in this folder, one after another.
 *
 * These are NOT unit tests: they talk to a live API and a real database, log
 * in with the seeded accounts, create rules / cards / notifications and clean
 * them up again. They are deliberately kept out of `npm test` (which must stay
 * fast and safe next to a running dev server) — start the API first:
 *
 *   npm run dev --workspace=@kanban/api
 *   npm run test:e2e --workspace=@kanban/api
 *
 * Override the targets with API_URL and the DB_* variables when needed.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const SUITES = [
  ["rules-api.js", "rules API + engine phase 1"],
  ["engine-actions.js", "engine phase 2 (labels, tokens, chains)"],
  ["run-history.js", "rule_runs history API"],
  ["notifications.js", "notification system"],
];

const results = [];
for (const [file, title] of SUITES) {
  process.stdout.write(`\n──── ${file} — ${title} ────\n`);
  const startedAt = Date.now();
  const run = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit",
    env: process.env,
  });
  results.push({ file, title, ok: run.status === 0, ms: Date.now() - startedAt });
}

process.stdout.write("\n════ E2E summary ════\n");
for (const result of results) {
  const seconds = (result.ms / 1000).toFixed(1);
  process.stdout.write(
    `${result.ok ? "PASS" : "FAIL"}  ${result.file.padEnd(20)} ${seconds}s  ${result.title}\n`,
  );
}

const failed = results.filter((result) => !result.ok);
process.stdout.write(
  failed.length === 0
    ? `\nALL PASS (${results.length} suites)\n`
    : `\n${failed.length} of ${results.length} suites failed\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
