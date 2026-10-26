/**
 * Show which process owns the dev ports (web 3000, API 3002, ...).
 * Usage: `npm run ports` from the repo root.
 */
const { execSync } = require("node:child_process");

const PORTS = [3000, 3001, 3002, 3003, 5432];
const isWindows = process.platform === "win32";

function listeners() {
  const rows = [];
  if (isWindows) {
    const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\s*(TCP)\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (m) rows.push({ port: Number(m[3]), pid: Number(m[4]) });
    }
  } else {
    const out = execSync("netstat -anp tcp 2>/dev/null || netstat -anp", {
      encoding: "utf8",
      shell: "/bin/sh",
    });
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i) ??
        line.match(/^\s*tcp\S*\s+\S+:(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\/(\d+)/i);
      if (m) rows.push({ port: Number(m[1]), pid: Number(m[2]) });
    }
  }
  return rows;
}

function procName(pid) {
  try {
    if (isWindows) {
      const out = execSync(`tasklist /fi "PID eq ${pid}" /nh`, { encoding: "utf8" });
      return out.trim().split(/\s+/)[0] || "?";
    }
    return execSync(`ps -p ${pid} -o comm=`, { encoding: "utf8" }).trim() || "?";
  } catch {
    return "?";
  }
}

const found = listeners().filter((r) => PORTS.includes(r.port));
console.log("Dev ports status (web=3000, api=3002):\n");
for (const port of PORTS) {
  const owners = found.filter((r) => r.port === port);
  if (owners.length === 0) {
    console.log(`  ${port}  ->  free`);
    continue;
  }
  for (const o of owners) console.log(`  ${port}  ->  PID ${o.pid}  (${procName(o.pid)})`);
}
console.log(
  "\nRun only ONE dev command: `npm run dev` at the repo root starts BOTH web and API."
);
