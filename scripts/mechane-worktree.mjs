import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const STATE_DIR =
  process.env.MECHANE_WORKTREE_STATE_DIR ?? path.join(os.homedir(), ".omp", "mechane-worktrees");
const STATE_FILE = path.join(STATE_DIR, "instances.json");
const PROCFILE_DIR = path.join(STATE_DIR, "procfiles");
const SOCKET_DIR = path.join(STATE_DIR, "sockets");

function fail(message) {
  console.error(`mechane-worktree: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) fail(`${command} is unavailable: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    fail(result.error?.message ?? `${command} ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function ensureDirectories() {
  fs.mkdirSync(PROCFILE_DIR, { recursive: true });
  fs.mkdirSync(SOCKET_DIR, { recursive: true });
}

function loadInstances() {
  if (!fs.existsSync(STATE_FILE)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    fail(`cannot parse ${STATE_FILE}: ${error.message}`);
  }
}

function saveInstances(instances) {
  ensureDirectories();
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(instances, null, 2)}\n`);
  fs.renameSync(temporary, STATE_FILE);
}

function currentRoot() {
  return capture("git", ["rev-parse", "--show-toplevel"], process.cwd());
}

function primaryRoot(root) {
  const worktrees = capture("git", ["worktree", "list", "--porcelain"], root);
  const firstPath = worktrees.match(/^worktree (.+)$/m)?.[1];
  return firstPath ? path.resolve(firstPath) : root;
}

function branchName(root) {
  const branch = capture("git", ["branch", "--show-current"], root);
  return branch || path.basename(root);
}

function slug(value) {
  const result = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return result || "worktree";
}

function profileName(record) {
  return `mechane-${record.slug}`;
}

function instanceRecord(root, instances) {
  return instances.find((instance) => instance.root === root);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function allocatePorts(instances) {
  const used = new Set(instances.flatMap((instance) => Object.values(instance.ports ?? {})));
  for (let block = 0; block < 80; block += 1) {
    const ports = {
      studio: 5273 + block * 100,
      player: 5274 + block * 100,
      api: 4100 + block * 100,
    };
    if (Object.values(ports).some((port) => used.has(port))) continue;
    const available = await Promise.all(Object.values(ports).map(canListen));
    if (available.every(Boolean)) return ports;
  }
  fail("could not find an unused Studio/Player/API port block");
}

async function ensureRecord(root) {
  const instances = loadInstances();
  const existing = instanceRecord(root, instances);
  if (existing) return existing;

  const record = {
    root,
    slug: slug(branchName(root)),
    ports: await allocatePorts(instances),
    socket: path.join(SOCKET_DIR, `${slug(branchName(root))}.sock`),
  };
  instances.push(record);
  saveInstances(instances);
  return record;
}

function writeProcfile(record) {
  ensureDirectories();
  const { studio, player, api } = record.ports;
  const procfile = path.join(PROCFILE_DIR, `${record.slug}.Procfile`);
  const contents = [
    `studio: VITE_DEV_PROXY=false VITE_API_URL=http://localhost:${api} pnpm dev:studio --host 0.0.0.0 --port ${studio}`,
    `player: VITE_DEV_PROXY=false VITE_API_URL=http://localhost:${api} pnpm dev:player --host 0.0.0.0 --port ${player}`,
    `api: PORT=${api} APP_STUDIO_URL=http://localhost:${studio} APP_PLAYER_URL=http://localhost:${player} BETTER_AUTH_URL=http://localhost:${api} pnpm dev:api`,
  ].join("\n");
  fs.writeFileSync(procfile, `${contents}\n`);
  return procfile;
}

function startOvermind(record, procfile, daemonize) {
  const args = [
    "start",
    "--procfile",
    procfile,
    "--root",
    record.root,
    "--title",
    record.slug,
    "--socket",
    record.socket,
  ];
  if (daemonize) args.push("--daemonize");
  run("overmind", args, { cwd: record.root });
}

function primaryRecord(root) {
  return {
    root,
    slug: "main",
    ports: { studio: 5173, player: 5174, api: 4000 },
    socket: path.join(SOCKET_DIR, "main.sock"),
  };
}

async function start(root, daemonize) {
  const primary = primaryRoot(root);
  if (root === primary) {
    const record = primaryRecord(root);
    startOvermind(record, path.join(root, "Procfile.dev"), daemonize);
    printUrls(record, true);
    return record;
  }

  const record = await ensureRecord(root);
  const procfile = writeProcfile(record);
  startOvermind(record, procfile, daemonize);
  printUrls(record, false);
  return record;
}

function printUrls(record, primary) {
  console.log(`\nMechanē ${primary ? "primary" : "worktree"} instance: ${record.slug}`);
  console.log(`  Studio:   http://localhost:${record.ports.studio}`);
  console.log(`  Player:   http://localhost:${record.ports.player}`);
  console.log(`  API:      http://localhost:${record.ports.api}`);
  console.log(`  OMP:      ${profileName(record)}`);
  console.log(`  Overmind: ${record.socket}`);
  if (!primary) {
    console.log("  Launch:   pnpm mechane:omp -- --continue");
    console.log(
      "  Note:     Player currently defaults to the shared API unless its API URL support is updated.",
    );
  }
}

function overmindAction(root, action) {
  const instances = loadInstances();
  const record =
    instanceRecord(root, instances) ?? (root === primaryRoot(root) ? primaryRecord(root) : null);
  if (!record) {
    console.log("No recorded Mechanē instance for this worktree.");
    return;
  }
  run("overmind", [action, "--socket", record.socket], { cwd: root });
}

function launchOmp(root, args) {
  const instances = loadInstances();
  const record =
    instanceRecord(root, instances) ?? (root === primaryRoot(root) ? primaryRecord(root) : null);
  if (!record) fail("could not determine the current worktree profile");
  run("omp", ["--profile", profileName(record), "--cwd", root, ...args], { cwd: root });
}

function createWorktree(root, args) {
  const primary = primaryRoot(root);
  if (root !== primary) fail("create worktrees from the primary checkout");
  const branch = args[0];
  if (!branch) fail("usage: pnpm mechane:worktree create <branch> [path]");
  const repository = path.basename(root);
  const target = path.resolve(root, args[1] ?? `../${repository}-${slug(branch)}`);
  if (fs.existsSync(target)) fail(`target already exists: ${target}`);

  run("git", ["worktree", "add", "-b", branch, target], { cwd: root });
  run("pnpm", ["install"], { cwd: target });
  console.log(`\nWorktree ready: ${target}`);
  console.log(`Next: cd ${target} && pnpm mechane:up`);
}

function help() {
  console.log(`Mechanē worktree helper

Commands:
  up                         Start this worktree's apps and OMP
  start                      Start this worktree's app processes
  status                     Show this worktree's Overmind status
  stop                       Stop this worktree's app processes
  omp [args...]              Launch OMP with this worktree's profile
  create <branch> [path]     Create a worktree and install dependencies

Examples:
  pnpm mechane:worktree create issue/123-fix
  pnpm mechane:up
  pnpm mechane:omp -- --continue
`);
}

const rawArguments = process.argv.slice(2);
let [command = "help", ...args] = rawArguments;
if (command === "--") [command, ...args] = args;
if (command === "omp" && args[0] === "--") args.shift();
const root = currentRoot();
if (command === "create") {
  createWorktree(root, args);
} else if (command === "start") {
  await start(root, false);
} else if (command === "up") {
  await start(root, true);
  launchOmp(root, ["--continue"]);
} else if (command === "status" || command === "stop") {
  overmindAction(root, command === "status" ? "status" : "quit");
} else if (command === "omp") {
  launchOmp(root, args);
} else {
  help();
}
