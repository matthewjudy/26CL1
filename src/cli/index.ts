#!/usr/bin/env node

// Enable Node.js module compile cache for faster startup
import { enableCompileCache } from 'node:module';
try {
  enableCompileCache?.();
} catch {
  // Not available in older Node.js versions — ignore
}

/**
 * Clementine CLI — launch, stop, restart, status, doctor, config.
 *
 * Works from any directory. Data lives in ~/.clementine/ (or CLEMENTINE_HOME).
 * Code lives wherever npm installed the package.
 */

import { Command } from 'commander';
import { spawn, execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  openSync,
  closeSync,
  readSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup } from './setup.js';
import { cmdCronList, cmdCronRun, cmdCronRunDue, cmdCronRuns, cmdCronAdd, cmdCronTest, cmdHeartbeat } from './cron.js';
import { cmdDashboard } from './dashboard.js';
import { cmdChat } from './chat.js';
import { cmdAgentChat } from './agent-chat.js';
import { localISO } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Path resolution ─────────────────────────────────────────────────

/** Data home — vault, .env, logs, sessions, PID file. */
const BASE_DIR = process.env.CLEMENTINE_HOME || path.join(os.homedir(), '.clementine');

/**
 * Package root (wherever npm installed the package).
 * CLI lives at dist/cli/index.js, so two levels up = package root.
 */
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

/** Compiled entry point for the main process. */
const DIST_ENTRY = path.join(PACKAGE_ROOT, 'dist', 'index.js');

const ENV_PATH = path.join(BASE_DIR, '.env');

// ── Helpers ──────────────────────────────────────────────────────────

function getAssistantName(): string {
  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, 'utf-8');
    const match = content.match(/^ASSISTANT_NAME=(.+)$/m);
    if (match) return match[1].trim();
  }
  return 'Clementine';
}

function getPidFilePath(): string {
  const name = getAssistantName().toLowerCase();
  return path.join(BASE_DIR, `.${name}.pid`);
}

function getLaunchdLabel(): string {
  return `com.${getAssistantName().toLowerCase()}.assistant`;
}

function getLaunchdPlistPath(): string {
  const home = process.env.HOME ?? '';
  return path.join(home, 'Library', 'LaunchAgents', `${getLaunchdLabel()}.plist`);
}

function readPid(): number | null {
  const pidFile = getPidFilePath();
  if (!existsSync(pidFile)) return null;
  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  // Wait up to 5 seconds for graceful shutdown
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return;
    const waitMs = 100;
    const waitUntil = Date.now() + waitMs;
    while (Date.now() < waitUntil) {
      // busy-wait (short)
    }
  }

  // Force kill
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already dead
  }
}

/** Stop the daemon safely: unload LaunchAgent first (prevents respawn), then kill the process. */
function stopDaemon(pid: number): void {
  // Unload LaunchAgent BEFORE killing — otherwise launchd respawns it immediately
  if (process.platform === 'darwin') {
    const plist = getLaunchdPlistPath();
    if (existsSync(plist)) {
      try {
        execSync(`launchctl unload "${plist}"`, { stdio: 'pipe' });
      } catch {
        // not loaded — that's fine
      }
    }
  }
  killPid(pid);
}

/** Bootstrap ~/.clementine/ on first run — create data dir and copy vault templates. */
function ensureDataHome(): void {
  if (!existsSync(BASE_DIR)) {
    mkdirSync(BASE_DIR, { recursive: true });
    console.log(`  Created ${BASE_DIR}`);
  }

  const vaultDir = path.join(BASE_DIR, 'vault');
  const pkgVault = path.join(PACKAGE_ROOT, 'vault');
  if (!existsSync(vaultDir) && existsSync(pkgVault)) {
    cpSync(pkgVault, vaultDir, { recursive: true });
    console.log('  Copied vault templates.');
  }
}

// ── Commands ─────────────────────────────────────────────────────────

function cmdLaunch(options: { foreground?: boolean; install?: boolean; uninstall?: boolean }): void {
  if (options.uninstall) {
    const plistPath = getLaunchdPlistPath();
    if (existsSync(plistPath)) {
      try {
        execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' });
      } catch {
        // not loaded
      }
      unlinkSync(plistPath);
      console.log(`  Uninstalled LaunchAgent: ${getLaunchdLabel()}`);
    } else {
      console.log('  LaunchAgent not installed.');
    }
    return;
  }

  if (options.install) {
    const plistPath = getLaunchdPlistPath();
    const plistDir = path.dirname(plistPath);
    if (!existsSync(plistDir)) {
      mkdirSync(plistDir, { recursive: true });
    }

    // Unload existing plist if already installed (idempotent reinstall)
    if (existsSync(plistPath)) {
      try {
        execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' });
      } catch {
        // not loaded — fine
      }
    }

    const nodePath = process.execPath;
    const logDir = path.join(BASE_DIR, 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${getLaunchdLabel()}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${DIST_ENTRY}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${BASE_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${path.join(logDir, 'clementine.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logDir, 'clementine-error.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${buildLaunchdPath()}</string>
    <key>CLEMENTINE_HOME</key>
    <string>${BASE_DIR}</string>
  </dict>
</dict>
</plist>`;

    writeFileSync(plistPath, plist);
    try {
      execSync(`launchctl load "${plistPath}"`);
      console.log(`  Installed and loaded LaunchAgent: ${getLaunchdLabel()}`);
      console.log(`  Plist: ${plistPath}`);
      console.log(`  Logs:  ${logDir}/`);
    } catch (err) {
      console.error(`  Failed to load LaunchAgent: ${err}`);
    }

    // Also install the cron scheduler alongside the daemon
    console.log();
    cmdCronInstall();
    return;
  }

  // First-run bootstrap
  ensureDataHome();

  if (!existsSync(ENV_PATH)) {
    console.log(`  No .env file found at ${ENV_PATH}`);
    console.log('  Run: clementine config setup');
    console.log();
    return;
  }

  // Stop any existing instance first (unload LaunchAgent to prevent respawn)
  const existingPid = readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    console.log(`  Stopping existing instance (PID ${existingPid})...`);
    stopDaemon(existingPid);
  }

  if (options.foreground) {
    // Foreground mode: import and run the entry point directly
    process.env.CLEMENTINE_HOME = BASE_DIR;
    import('../index.js').catch((err: unknown) => {
      console.error('Failed to start:', err);
      process.exit(1);
    });
    return;
  }

  // Daemon mode (default) — redirect stdout+stderr to log file
  const logDir = path.join(BASE_DIR, 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, 'clementine.log');
  const logFd = openSync(logFile, 'a');

  const child = spawn('node', [DIST_ENTRY], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    cwd: BASE_DIR,
    env: { ...process.env, CLEMENTINE_HOME: BASE_DIR },
  });

  if (child.pid) {
    writeFileSync(getPidFilePath(), String(child.pid));
    console.log(`  ${getAssistantName()} started in background (PID ${child.pid})`);
    console.log(`  Logs: ${logFile}`);
  }

  child.unref();
  closeSync(logFd);
}

function cmdStop(): void {
  const pid = readPid();
  if (!pid) {
    console.log('  No running instance found.');
    return;
  }

  if (!isProcessAlive(pid)) {
    console.log(`  PID ${pid} is not running. Cleaning up PID file.`);
    try { unlinkSync(getPidFilePath()); } catch { /* ignore */ }
    return;
  }

  console.log(`  Stopping ${getAssistantName()} (PID ${pid})...`);
  stopDaemon(pid);

  if (isProcessAlive(pid)) {
    console.log('  Process did not exit cleanly.');
  } else {
    console.log('  Stopped.');
    try { unlinkSync(getPidFilePath()); } catch { /* ignore */ }
  }
}

function cmdRestart(options: { foreground?: boolean }): void {
  cmdStop();
  cmdLaunch({ foreground: options.foreground });
}

function cmdStatus(): void {
  const pid = readPid();
  const name = getAssistantName();

  if (!pid) {
    console.log(`  ${name} is not running (no PID file).`);
    return;
  }

  if (!isProcessAlive(pid)) {
    console.log(`  ${name} is not running (stale PID ${pid}).`);
    return;
  }

  console.log(`  ${name} is running (PID ${pid})`);

  // Show uptime from PID file mtime
  try {
    const { mtimeMs } = statSync(getPidFilePath());
    const uptimeMs = Date.now() - mtimeMs;
    const hours = Math.floor(uptimeMs / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);
    console.log(`  Uptime: ${hours}h ${minutes}m`);
  } catch {
    // ignore
  }

  // Show active channels from env
  const channels: string[] = [];
  if (existsSync(ENV_PATH)) {
    const env = readFileSync(ENV_PATH, 'utf-8');
    if (/^DISCORD_TOKEN=.+$/m.test(env)) channels.push('Discord');
    if (/^SLACK_BOT_TOKEN=.+$/m.test(env) && /^SLACK_APP_TOKEN=.+$/m.test(env)) channels.push('Slack');
    if (/^TELEGRAM_BOT_TOKEN=.+$/m.test(env)) channels.push('Telegram');
    if (/^TWILIO_ACCOUNT_SID=.+$/m.test(env)) channels.push('WhatsApp');
    if (/^WEBHOOK_ENABLED=true$/m.test(env)) channels.push('Webhook');
  }
  if (channels.length > 0) {
    console.log(`  Channels: ${channels.join(', ')}`);
  }
}

function cmdDoctor(): void {
  const DIM = '\x1b[0;90m';
  const GREEN = '\x1b[0;32m';
  const RED = '\x1b[0;31m';
  const YELLOW = '\x1b[1;33m';
  const RESET = '\x1b[0m';

  console.log();
  console.log(`  ${DIM}Data home: ${BASE_DIR}${RESET}`);
  console.log(`  ${DIM}Running health checks...${RESET}`);
  console.log();

  let issues = 0;

  // Node version (require 20–24 LTS)
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  if (major >= 20 && major <= 24) {
    console.log(`  ${GREEN}OK${RESET}  Node.js ${nodeVersion}`);
  } else if (major > 24) {
    console.log(`  ${RED}FAIL${RESET}  Node.js ${nodeVersion} — SDK requires Node 20–24 LTS`);
    console.log(`       Install Node 22: nvm install 22`);
    issues++;
  } else {
    console.log(`  ${RED}FAIL${RESET}  Node.js ${nodeVersion} (need >= 20)`);
    issues++;
  }

  // Claude CLI
  try {
    execSync('which claude', { stdio: 'pipe' });
    console.log(`  ${GREEN}OK${RESET}  claude CLI found`);
  } catch {
    console.log(`  ${RED}FAIL${RESET}  claude CLI not found`);
    console.log(`       Install: npm install -g @anthropic-ai/claude-code`);
    issues++;
  }

  // SDK smoke test — verify claude CLI can actually execute
  try {
    execSync('claude --version', { stdio: 'pipe', timeout: 10000 });
    console.log(`  ${GREEN}OK${RESET}  claude CLI executes successfully`);
  } catch {
    console.log(`  ${RED}FAIL${RESET}  claude CLI found but failed to execute`);
    console.log(`       Check Node version compatibility and run: npm install -g @anthropic-ai/claude-code`);
    issues++;
  }

  // better-sqlite3 native module
  try {
    execSync('node -e "require(\'better-sqlite3\')"', {
      cwd: PACKAGE_ROOT,
      stdio: 'pipe',
      timeout: 10000,
    });
    console.log(`  ${GREEN}OK${RESET}  better-sqlite3 native module loads`);
  } catch {
    console.log(`  ${RED}FAIL${RESET}  better-sqlite3 native module broken (Node version mismatch)`);
    console.log(`       Fix: cd ${PACKAGE_ROOT} && npm rebuild better-sqlite3`);
    issues++;
  }

  // FalkorDB graph engine — system dependencies
  try {
    execSync('which redis-server', { stdio: 'pipe' });
    console.log(`  ${GREEN}OK${RESET}  redis-server found`);
  } catch {
    console.log(`  ${RED}FAIL${RESET}  redis-server not found (required for knowledge graph)`);
    console.log(`       Fix: brew install redis (macOS) or sudo apt install redis-server (Linux)`);
    issues++;
  }

  try {
    const libompPath = process.platform === 'darwin'
      ? '/opt/homebrew/opt/libomp/lib/libomp.dylib'
      : '/usr/lib/libomp.so';
    if (existsSync(libompPath)) {
      console.log(`  ${GREEN}OK${RESET}  libomp (OpenMP runtime) found`);
    } else {
      throw new Error('not found');
    }
  } catch {
    console.log(`  ${RED}FAIL${RESET}  libomp (OpenMP runtime) not found (required for knowledge graph)`);
    console.log(`       Fix: brew install libomp (macOS) or sudo apt install libomp-dev (Linux)`);
    issues++;
  }

  // FalkorDB graph engine — module binaries
  try {
    const result = execSync(
      `node -e "const{BinaryManager}=require('falkordblite/dist/binary-manager.js');new BinaryManager().ensureBinaries().then(p=>{console.log(JSON.stringify(p));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"`,
      { cwd: PACKAGE_ROOT, stdio: 'pipe', timeout: 30000 },
    );
    console.log(`  ${GREEN}OK${RESET}  FalkorDB graph engine binaries installed`);
  } catch {
    console.log(`  ${RED}FAIL${RESET}  FalkorDB graph engine binaries not available`);
    console.log(`       Fix: cd ${PACKAGE_ROOT} && node node_modules/falkordblite/scripts/postinstall.js`);
    issues++;
  }

  // Data home
  if (existsSync(BASE_DIR)) {
    console.log(`  ${GREEN}OK${RESET}  Data home exists (${BASE_DIR})`);
  } else {
    console.log(`  ${YELLOW}WARN${RESET}  Data home not found (run: clementine launch)`);
    issues++;
  }

  // .env file
  if (existsSync(ENV_PATH)) {
    console.log(`  ${GREEN}OK${RESET}  .env file exists`);
  } else {
    console.log(`  ${YELLOW}WARN${RESET}  .env file not found (run: clementine config setup)`);
    issues++;
  }

  // Vault files — resolve VAULT_PATH from .env if set
  let vaultDir = path.join(BASE_DIR, 'vault');
  let systemSubdir = 'Meta/Clementine';
  if (existsSync(ENV_PATH)) {
    const envContent = readFileSync(ENV_PATH, 'utf-8');
    const vpMatch = envContent.match(/^VAULT_PATH=(.+)$/m);
    if (vpMatch) vaultDir = vpMatch[1].replace(/^["']|["']$/g, '');
    const sdMatch = envContent.match(/^VAULT_SYSTEM_DIR=(.+)$/m);
    if (sdMatch) systemSubdir = sdMatch[1].replace(/^["']|["']$/g, '');
  }
  const requiredVaultFiles = [
    [`${systemSubdir}/SOUL.md`, 'SOUL.md'],
    [`${systemSubdir}/AGENTS.md`, 'AGENTS.md'],
  ] as const;

  for (const [filePath, label] of requiredVaultFiles) {
    if (existsSync(path.join(vaultDir, filePath))) {
      console.log(`  ${GREEN}OK${RESET}  ${filePath}`);
    } else {
      console.log(`  ${RED}FAIL${RESET}  ${filePath} missing`);
      issues++;
    }
  }

  // Channel tokens (informational)
  if (existsSync(ENV_PATH)) {
    const env = readFileSync(ENV_PATH, 'utf-8');
    const channelChecks = [
      ['DISCORD_TOKEN', 'Discord'],
      ['TELEGRAM_BOT_TOKEN', 'Telegram'],
      ['SLACK_BOT_TOKEN', 'Slack'],
    ] as const;
    let anyChannel = false;
    for (const [key, name] of channelChecks) {
      const re = new RegExp(`^${key}=(.+)$`, 'm');
      if (re.test(env)) {
        console.log(`  ${GREEN}OK${RESET}  ${name} token configured`);
        anyChannel = true;
      }
    }
    if (!anyChannel) {
      console.log(`  ${YELLOW}WARN${RESET}  No channel tokens configured`);
      issues++;
    }
  }

  // LaunchAgent health check (macOS only)
  if (process.platform === 'darwin') {
    const plistPath = getLaunchdPlistPath();
    if (existsSync(plistPath)) {
      try {
        execSync(`launchctl list ${getLaunchdLabel()}`, { stdio: 'pipe' });
        console.log(`  ${GREEN}OK${RESET}  LaunchAgent installed and loaded`);
      } catch {
        console.log(`  ${YELLOW}WARN${RESET}  LaunchAgent installed but not loaded`);
        console.log(`       Load it: launchctl load "${plistPath}"`);
        issues++;
      }
    } else {
      console.log(`  ${YELLOW}WARN${RESET}  LaunchAgent not installed (run: clementine launch --install)`);
      issues++;
    }
  }

  console.log();
  if (issues === 0) {
    console.log(`  ${GREEN}All checks passed.${RESET}`);
  } else {
    console.log(`  ${YELLOW}${issues} issue(s) found.${RESET}`);
  }
  console.log();
}

function cmdConfigSet(key: string, value: string): void {
  ensureDataHome();

  let content = '';
  if (existsSync(ENV_PATH)) {
    content = readFileSync(ENV_PATH, 'utf-8');
  }

  const upperKey = key.toUpperCase();
  const re = new RegExp(`^${upperKey}=.*$`, 'm');

  if (re.test(content)) {
    content = content.replace(re, `${upperKey}=${value}`);
  } else {
    content = content.trimEnd() + `\n${upperKey}=${value}\n`;
  }

  writeFileSync(ENV_PATH, content);
  console.log(`  Set ${upperKey}=${value}`);
}

function cmdConfigGet(key: string): void {
  if (!existsSync(ENV_PATH)) {
    console.log('  No .env file found.');
    return;
  }
  const content = readFileSync(ENV_PATH, 'utf-8');
  const upperKey = key.toUpperCase();
  const re = new RegExp(`^${upperKey}=(.*)$`, 'm');
  const match = content.match(re);
  if (match) {
    console.log(`  ${upperKey}=${match[1]}`);
  } else {
    console.log(`  ${upperKey} is not set.`);
  }
}

function cmdConfigList(): void {
  if (!existsSync(ENV_PATH)) {
    console.log('  No .env file found. Run: clementine config setup');
    return;
  }

  const content = readFileSync(ENV_PATH, 'utf-8');
  const DIM = '\x1b[0;90m';
  const RESET = '\x1b[0m';

  console.log();
  for (const line of content.split('\n')) {
    if (line.startsWith('#')) {
      console.log(`  ${DIM}${line}${RESET}`);
    } else if (line.trim()) {
      // Mask secret values
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match) {
        const [, k, v] = match;
        const sensitiveKeys = ['TOKEN', 'SECRET', 'API_KEY', 'AUTH_TOKEN', 'SID'];
        const isSensitive = sensitiveKeys.some((s) => k.includes(s));
        if (isSensitive && v.length > 8) {
          console.log(`  ${k}=${v.slice(0, 4)}${'*'.repeat(v.length - 8)}${v.slice(-4)}`);
        } else {
          console.log(`  ${line}`);
        }
      } else {
        console.log(`  ${line}`);
      }
    }
  }
  console.log();
}

// ── Tools command ───────────────────────────────────────────────────

function cmdTools(): void {
  const DIM = '\x1b[0;90m';
  const GREEN = '\x1b[0;32m';
  const YELLOW = '\x1b[1;33m';
  const CYAN = '\x1b[0;36m';
  const BOLD = '\x1b[1m';
  const RESET = '\x1b[0m';

  console.log();

  // ── 1. Clementine MCP tools (parse from source) ──────────────────
  const mcpServerSrc = path.join(PACKAGE_ROOT, 'src', 'tools', 'mcp-server.ts');
  const mcpTools: Array<{ name: string; description: string }> = [];

  if (existsSync(mcpServerSrc)) {
    const src = readFileSync(mcpServerSrc, 'utf-8');
    // Match: server.tool(\n  'name',\n  'description' or "description",
    const toolPattern = /server\.tool\(\s*'([^']+)',\s*(['"])(.+?)\2/gs;
    let match;
    while ((match = toolPattern.exec(src)) !== null) {
      mcpTools.push({ name: match[1], description: match[3] });
    }
  }

  if (mcpTools.length > 0) {
    console.log(`  ${BOLD}Clementine MCP Tools${RESET} ${DIM}(${mcpTools.length} tools)${RESET}`);
    console.log();
    const maxName = Math.max(...mcpTools.map((t) => t.name.length));
    for (const tool of mcpTools) {
      console.log(`    ${CYAN}${tool.name.padEnd(maxName)}${RESET}  ${DIM}${tool.description}${RESET}`);
    }
    console.log();
  }

  // ── 2. SDK built-in tools ────────────────────────────────────────
  const sdkTools = [
    { name: 'Read', description: 'Read files from the filesystem' },
    { name: 'Write', description: 'Write/create files' },
    { name: 'Edit', description: 'Edit files with string replacements' },
    { name: 'Bash', description: 'Execute shell commands' },
    { name: 'Glob', description: 'Find files by pattern' },
    { name: 'Grep', description: 'Search file contents' },
    { name: 'WebSearch', description: 'Search the web' },
    { name: 'WebFetch', description: 'Fetch and process web pages' },
    { name: 'Agent', description: 'Spawn sub-agents for complex tasks' },
    { name: 'Task', description: 'Multi-agent task coordination' },
  ];

  console.log(`  ${BOLD}SDK Built-in Tools${RESET} ${DIM}(${sdkTools.length} tools)${RESET}`);
  console.log();
  const maxSdk = Math.max(...sdkTools.map((t) => t.name.length));
  for (const tool of sdkTools) {
    console.log(`    ${CYAN}${tool.name.padEnd(maxSdk)}${RESET}  ${DIM}${tool.description}${RESET}`);
  }
  console.log();

  // ── 3. Claude Code plugins ───────────────────────────────────────
  const home = process.env.HOME ?? '';
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const plugins: Array<{ name: string; source: string }> = [];

  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const enabledPlugins = settings.enabledPlugins ?? {};
      for (const [pluginId, enabled] of Object.entries(enabledPlugins)) {
        if (enabled) {
          const [name, source] = pluginId.split('@');
          plugins.push({ name, source: source ?? 'unknown' });
        }
      }
    } catch { /* ignore */ }
  }

  if (plugins.length > 0) {
    console.log(`  ${BOLD}Claude Code Plugins${RESET} ${DIM}(global)${RESET}`);
    console.log();
    const maxPlugin = Math.max(...plugins.map((p) => p.name.length));
    for (const plugin of plugins) {
      console.log(`    ${GREEN}${plugin.name.padEnd(maxPlugin)}${RESET}  ${DIM}${plugin.source}${RESET}`);
    }
    console.log();
  }

  // ── 4. Project MCP servers ───────────────────────────────────────
  const projectSettingsPath = path.join(PACKAGE_ROOT, '.claude', 'settings.json');
  const projectMcpServers: string[] = [];

  if (existsSync(projectSettingsPath)) {
    try {
      const projSettings = JSON.parse(readFileSync(projectSettingsPath, 'utf-8'));
      const servers = projSettings.mcpServers ?? {};
      for (const serverName of Object.keys(servers)) {
        projectMcpServers.push(serverName);
      }
    } catch { /* ignore */ }
  }

  if (projectMcpServers.length > 0) {
    console.log(`  ${BOLD}Project MCP Servers${RESET} ${DIM}(from .claude/settings.json)${RESET}`);
    console.log();
    for (const name of projectMcpServers) {
      console.log(`    ${YELLOW}${name}${RESET}`);
    }
    console.log();
  }

  // ── 5. Active channels ──────────────────────────────────────────
  const channels: string[] = [];
  if (existsSync(ENV_PATH)) {
    const envContent = readFileSync(ENV_PATH, 'utf-8');
    if (/^DISCORD_TOKEN=.+$/m.test(envContent)) channels.push('Discord');
    if (/^SLACK_BOT_TOKEN=.+$/m.test(envContent) && /^SLACK_APP_TOKEN=.+$/m.test(envContent)) channels.push('Slack');
    if (/^TELEGRAM_BOT_TOKEN=.+$/m.test(envContent)) channels.push('Telegram');
    if (/^TWILIO_ACCOUNT_SID=.+$/m.test(envContent)) channels.push('WhatsApp');
    if (/^WEBHOOK_ENABLED=true$/m.test(envContent)) channels.push('Webhook');
  }

  if (channels.length > 0) {
    console.log(`  ${BOLD}Active Channels${RESET}`);
    console.log();
    for (const ch of channels) {
      console.log(`    ${GREEN}${ch}${RESET}`);
    }
    console.log();
  }
}

// ── Program ──────────────────────────────────────────────────────────

const program = new Command();

program
  .name('clementine')
  .description('Clementine Personal AI Assistant')
  .version('1.0.0');

program
  .command('launch')
  .description('Start the assistant (daemon by default)')
  .option('-f, --foreground', 'Run in foreground (attached to terminal)')
  .option('--install', 'Install as macOS LaunchAgent')
  .option('--uninstall', 'Remove macOS LaunchAgent')
  .action(cmdLaunch);

program
  .command('stop')
  .description('Stop the running assistant')
  .action(cmdStop);

program
  .command('restart')
  .description('Restart the assistant (daemon by default)')
  .option('-f, --foreground', 'Run in foreground after restart')
  .action(cmdRestart);

program
  .command('status')
  .description('Show assistant status')
  .action(cmdStatus);

program
  .command('doctor')
  .description('Run health checks')
  .action(cmdDoctor);

program
  .command('tools')
  .description('List available MCP tools, plugins, and channels')
  .action(cmdTools);

program
  .command('dashboard')
  .description('Launch local command center')
  .option('-p, --port <n>', 'Port (default 3030)', '3030')
  .option('-H, --host <addr>', 'Bind address (default 127.0.0.1, use 0.0.0.0 for network access)')
  .option('--restart', 'Restart the dashboard process')
  .option('--stop', 'Stop the dashboard process')
  .option('--install', 'Install dashboard as a persistent macOS LaunchAgent')
  .option('--uninstall', 'Remove dashboard LaunchAgent')
  .action((opts: { port?: string; host?: string; restart?: boolean; stop?: boolean; install?: boolean; uninstall?: boolean }) => {
    const dashLabel = `com.${getAssistantName().toLowerCase()}.dashboard`;
    const dashPlistPath = path.join(process.env.HOME ?? '', 'Library', 'LaunchAgents', `${dashLabel}.plist`);

    if (opts.uninstall) {
      if (existsSync(dashPlistPath)) {
        try { execSync(`launchctl unload "${dashPlistPath}"`, { stdio: 'ignore' }); } catch { /* not loaded */ }
        unlinkSync(dashPlistPath);
        console.log(`  Uninstalled dashboard LaunchAgent: ${dashLabel}`);
      } else {
        console.log('  Dashboard LaunchAgent not installed.');
      }
      return;
    }

    if (opts.install) {
      const plistDir = path.dirname(dashPlistPath);
      if (!existsSync(plistDir)) mkdirSync(plistDir, { recursive: true });

      // Unload existing if present
      if (existsSync(dashPlistPath)) {
        try { execSync(`launchctl unload "${dashPlistPath}"`, { stdio: 'ignore' }); } catch { /* not loaded */ }
      }

      const nodePath = process.execPath;
      const cliEntry = path.join(PACKAGE_ROOT, 'dist', 'cli', 'index.js');
      const logDir = path.join(BASE_DIR, 'logs');
      if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

      const host = opts.host ?? '0.0.0.0';
      const port = opts.port ?? '3030';
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${dashLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${cliEntry}</string>
    <string>dashboard</string>
    <string>-H</string>
    <string>${host}</string>
    <string>-p</string>
    <string>${port}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${BASE_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${path.join(logDir, 'dashboard.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logDir, 'dashboard-error.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${buildLaunchdPath()}</string>
    <key>CLEMENTINE_HOME</key>
    <string>${BASE_DIR}</string>
  </dict>
</dict>
</plist>`;

      writeFileSync(dashPlistPath, plist);
      try {
        execSync(`launchctl load "${dashPlistPath}"`);
        console.log(`  Installed dashboard LaunchAgent: ${dashLabel}`);
        console.log(`  Plist: ${dashPlistPath}`);
        console.log(`  Logs:  ${logDir}/dashboard.log`);
        console.log(`  Dashboard will auto-start on login and restart on crash.`);
      } catch (err) {
        console.error(`  Failed to load LaunchAgent: ${err}`);
      }
      return;
    }

    if (opts.stop || opts.restart) {
      // Kill existing dashboard process(es)
      try {
        const name = getAssistantName().toLowerCase();
        const dashPids = execSync(`pgrep -f '${name}.*dashboard' || true`, { encoding: 'utf-8' }).trim();
        if (dashPids) {
          let killed = 0;
          for (const dp of dashPids.split('\n').filter(Boolean)) {
            const dpid = parseInt(dp, 10);
            if (!isNaN(dpid) && dpid !== process.pid) {
              try { process.kill(dpid, 'SIGTERM'); killed++; } catch { /* ignore */ }
            }
          }
          if (killed) console.log(`  Stopped dashboard (${killed} process${killed > 1 ? 'es' : ''}).`);
        } else {
          console.log('  No dashboard process found.');
        }
      } catch { console.log('  No dashboard process found.'); }

      if (opts.stop) return;
      // For --restart, brief pause then re-launch
      setTimeout(() => {
        cmdDashboard(opts).catch((err: unknown) => {
          console.error('Dashboard error:', err);
          process.exit(1);
        });
      }, 500);
      return;
    }
    cmdDashboard(opts).catch((err: unknown) => {
      console.error('Dashboard error:', err);
      process.exit(1);
    });
  });

program
  .command('ops')
  .description('Live ops board in the terminal')
  .option('-n, --no-watch', 'Print once and exit (no auto-refresh)')
  .option('--no-tmux', 'Run directly without tmux (will not survive session resets)')
  .option('--detach', 'Start ops board in background tmux session without attaching')
  .option('--kill', 'Stop the persistent ops board tmux session')
  .action(async (opts: { watch?: boolean; tmux?: boolean; detach?: boolean; kill?: boolean }) => {
    const TMUX_SESSION = 'clementine-ops';

    // --kill: tear down the persistent tmux session
    if (opts.kill) {
      try {
        execSync(`tmux kill-session -t ${TMUX_SESSION} 2>/dev/null`, { stdio: 'pipe' });
        console.log(`  Stopped persistent ops board (tmux session: ${TMUX_SESSION}).`);
      } catch {
        console.log(`  No persistent ops board running.`);
      }
      return;
    }

    // tmux persistence: if not already inside the ops tmux session, delegate to it
    if (opts.tmux !== false && opts.watch !== false && !process.env.CLEMENTINE_OPS_INNER) {
      // Check if tmux is available
      try {
        execSync('which tmux', { stdio: 'pipe' });
      } catch {
        // No tmux — fall through to direct rendering
        console.log('  tmux not found — running directly (will not survive session resets).');
        // fall through
        opts.tmux = false;
      }

      if (opts.tmux !== false) {
        // Check if the tmux session already exists with ops running
        let sessionExists = false;
        try {
          execSync(`tmux has-session -t ${TMUX_SESSION} 2>/dev/null`, { stdio: 'pipe' });
          sessionExists = true;
        } catch { /* no session */ }

        if (opts.detach) {
          if (sessionExists) {
            console.log(`  Ops board already running in tmux session '${TMUX_SESSION}'.`);
            console.log(`  Attach with: clementine ops`);
          } else {
            const nodeExec = process.execPath;
            const cliScript = path.join(PACKAGE_ROOT, 'dist', 'cli', 'index.js');
            execSync(
              `tmux new-session -d -s ${TMUX_SESSION} "CLEMENTINE_OPS_INNER=1 ${nodeExec} ${cliScript} ops"`,
              { stdio: 'pipe' },
            );
            console.log(`  Started ops board in background tmux session '${TMUX_SESSION}'.`);
            console.log(`  Attach with: clementine ops`);
          }
          return;
        }

        if (sessionExists) {
          // Attach to existing session
          const attachCmd = process.env.TMUX
            ? `tmux switch-client -t ${TMUX_SESSION}`   // already in tmux
            : `tmux attach-session -t ${TMUX_SESSION}`;
          try {
            execSync(attachCmd, { stdio: 'inherit' });
          } catch { /* user detached or session ended */ }
          return;
        }

        // No existing session — create one and attach (or switch)
        const nodeExec = process.execPath;
        const cliScript = path.join(PACKAGE_ROOT, 'dist', 'cli', 'index.js');
        if (process.env.TMUX) {
          // Inside tmux already — create detached, then switch
          execSync(
            `tmux new-session -d -s ${TMUX_SESSION} "CLEMENTINE_OPS_INNER=1 ${nodeExec} ${cliScript} ops"`,
            { stdio: 'pipe' },
          );
          try {
            execSync(`tmux switch-client -t ${TMUX_SESSION}`, { stdio: 'inherit' });
          } catch { /* user detached */ }
        } else {
          execSync(
            `tmux new-session -s ${TMUX_SESSION} "CLEMENTINE_OPS_INNER=1 ${nodeExec} ${cliScript} ops"`,
            { stdio: 'inherit' },
          );
        }
        return;
      }
    }
    const BASE = process.env.CLEMENTINE_HOME || `${process.env.HOME}/.clementine`;
    const tokenPath = `${BASE}/.dashboard-token`;
    const statusPath = `${BASE}/.bot-status.json`;
    const hbPath = `${BASE}/.heartbeat_state.json`;
    const sessPath = `${BASE}/.sessions.json`;
    const runsDir = `${BASE}/cron/runs`;

    // ANSI helpers
    const c = {
      reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
      green: '\x1b[32m', blue: '\x1b[34m', yellow: '\x1b[33m', red: '\x1b[31m',
      cyan: '\x1b[36m', magenta: '\x1b[35m', gray: '\x1b[90m', white: '\x1b[97m',
      brightGreen: '\x1b[92m', brightYellow: '\x1b[93m', brightCyan: '\x1b[96m',
      orange: '\x1b[38;5;208m', purple: '\x1b[38;5;141m',
      bgRed: '\x1b[41m', bgGreen: '\x1b[42m', bgYellow: '\x1b[43m', bgBlue: '\x1b[44m',
      clear: '\x1b[2J\x1b[H',
    };

    function pad(s: string, w: number) { return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); }
    function rpad(s: string, w: number) { return s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s; }
    function shortInc(id: string): string { return /^\d{14}$/.test(id) ? '#' + id.slice(-4) : id.slice(0, 8); }

    // Progress bar using Unicode block characters
    function progressBar(pct: number | null, width: number): string {
      if (pct == null || width < 6) return '';
      const barW = width - 5; // space for " XX%"
      const filled = Math.round((pct / 100) * barW);
      const empty = barW - filled;
      const barClr = pct >= 80 ? c.green : pct >= 40 ? c.blue : c.yellow;
      return `${barClr}${'█'.repeat(filled)}${c.gray}${'░'.repeat(empty)}${c.reset} ${c.dim}${rpad(String(pct), 3)}%${c.reset}`;
    }

    let currentScreen: 'ops' | 'roster' = 'ops';
    let lastData: Record<string, unknown> | null = null;

    async function render() {
      // Detect terminal dimensions
      const cols = process.stdout.columns || 120;
      const rows = process.stdout.rows || 40;

      // Try dashboard API first, fall back to file reads
      let data: Record<string, unknown> | null = null;
      if (existsSync(tokenPath)) {
        try {
          const token = readFileSync(tokenPath, 'utf-8').trim();
          const resp = await fetch(`http://127.0.0.1:3030/api/ops-board`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            data = await resp.json() as Record<string, unknown>;
            lastData = data;
          }
        } catch { /* dashboard not running, fall back */ }
      }

      if (!data) {
        // Minimal file-based fallback
        let botStatuses: Record<string, { status: string }> = {};
        try { if (existsSync(statusPath)) botStatuses = JSON.parse(readFileSync(statusPath, 'utf-8')); } catch {}
        let hbState: { timestamp?: string; details?: Record<string, number> } = {};
        try { if (existsSync(hbPath)) hbState = JSON.parse(readFileSync(hbPath, 'utf-8')); } catch {}
        let sessions: Record<string, { exchanges?: number; timestamp?: string }> = {};
        try { if (existsSync(sessPath)) sessions = JSON.parse(readFileSync(sessPath, 'utf-8')); } catch {}

        const agents: Record<string, unknown>[] = [];
        // Q1
        const hbAge = hbState.timestamp ? (Date.now() - new Date(hbState.timestamp).getTime()) / 60000 : Infinity;
        const sessKeys = Object.keys(sessions);
        let latestExch = 0; let totalExch = 0;
        for (const k of sessKeys) {
          totalExch += sessions[k].exchanges || 0;
          const ts = sessions[k].timestamp ? new Date(sessions[k].timestamp!).getTime() : 0;
          if (ts > latestExch) latestExch = ts;
        }
        const exchAge = latestExch ? (Date.now() - latestExch) / 60000 : Infinity;
        let q1Status = 'OFFLINE'; let q1Activity = '';
        if (hbAge < 45) {
          q1Status = exchAge < 10 ? 'WORKING' : 'AVAILABLE';
          q1Activity = exchAge < 10 ? `Active session (${totalExch} exchanges)` : 'Monitoring';
        }
        agents.push({ name: 'Clementine', unit: '19Q1', opStatus: q1Status, model: 'opus', channel: 'Discord DM', activity: q1Activity, deployed: true });

        for (const [slug, bot] of Object.entries(botStatuses)) {
          agents.push({ name: slug, opStatus: bot.status === 'online' ? 'AVAILABLE' : 'OFFLINE', model: 'sonnet', channel: 'general', activity: '' });
        }

        // Events from cron runs + activity log
        const events: { time: string; type: string; agent: string; detail: string; toolName?: string }[] = [];
        let runsToday = 0;
        const today = new Date().toISOString().slice(0, 10);
        if (existsSync(runsDir)) {
          for (const file of require('fs').readdirSync(runsDir).filter((f: string) => f.endsWith('.jsonl'))) {
            try {
              const lines = readFileSync(`${runsDir}/${file}`, 'utf-8').trim().split('\n').filter(Boolean);
              for (const line of lines.slice(-5)) {
                const entry = JSON.parse(line);
                const t = entry.finishedAt || entry.startedAt || '';
                if (t.startsWith(today)) runsToday++;
                // Skip noise entries — idle task processors, empty output, nothing-to-do responses
                const rawPreview = entry.outputPreview ? String(entry.outputPreview).trim() : '';
                const isNoise = entry.status === 'ok' && (
                  !rawPreview ||
                  rawPreview === 'No action taken' ||
                  rawPreview === '__NOTHING__' ||
                  /^__NOTHING__/.test(rawPreview) ||
                  /^No delegated tasks/i.test(rawPreview) ||
                  /^Nothing to execute/i.test(rawPreview) ||
                  /^Standing orders say hold/i.test(rawPreview) ||
                  /^No (?:new )?tasks/i.test(rawPreview) ||
                  /no output/i.test(rawPreview)
                );
                if (isNoise) continue;
                const jn = file.replace('.jsonl', '');
                // Human-readable label instead of raw cron name
                const cronLabel = jn.replace(/-task-processor$/, ': Tasks').replace(/-/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase());
                const dur = Math.round((entry.durationMs || 0) / 1000);
                const preview = rawPreview ? ' — ' + rawPreview.replace(/\*\*/g, '').split('\n')[0].slice(0, 50) : '';
                events.push({ time: t, type: entry.status === 'ok' ? 'ok' : 'error', agent: cronLabel, detail: cronLabel + (preview || ' completed') + ' (' + dur + 's)' });
              }
            } catch {}
          }
        }
        // Activity log — real-time agent tool steps
        const activityLogPath = path.join(BASE_DIR, '.activity-log.jsonl');
        if (existsSync(activityLogPath)) {
          try {
            const logContent = readFileSync(activityLogPath, 'utf-8');
            const logLines = logContent.trim().split('\n').filter(Boolean).slice(-100);
            const sixHCutoff = new Date(Date.now() - 6 * 3600000).toISOString();
            const typeMap: Record<string, string> = { start: 'working', done: 'ok', tool: 'tool', error: 'error', cron: 'ok' };
            for (const line of logLines) {
              try {
                const entry = JSON.parse(line);
                if (entry.ts && entry.ts >= sixHCutoff) {
                  events.push({
                    time: entry.ts,
                    type: typeMap[entry.type] || 'ok',
                    agent: entry.agent + (entry.unit ? ' (' + entry.unit + ')' : ''),
                    detail: (entry.type === 'start' ? '▶ ' : entry.type === 'done' ? '✓ ' : entry.type === 'error' ? '✖ ' : entry.type === 'tool' ? '  · ' : '')
                      + (entry.type === 'tool' ? (entry.detail || '') : (entry.trigger ? entry.trigger + ': ' : '') + (entry.detail || '')),
                    ...(entry.toolName ? { toolName: entry.toolName } : {}),
                  });
                }
              } catch { /* skip */ }
            }
          } catch { /* ignore */ }
        }
        events.sort((a, b) => b.time.localeCompare(a.time));
        const sixH = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 19);
        data = {
          agents,
          events: events.filter(e => e.time >= sixH),
          pendingTasks: [],
          summary: { online: agents.filter((a: Record<string, unknown>) => a.opStatus !== 'OFFLINE').length, working: agents.filter((a: Record<string, unknown>) => a.opStatus === 'WORKING').length, queued: 0, errors: 0, runsToday, deployed: agents.length, poolSize: 0 },
        };
      }

      // Route to roster screen if toggled
      if (currentScreen === 'roster') {
        lastData = data;
        await renderRoster();
        return;
      }

      const agents = (data.agents || []) as Array<Record<string, any>>;
      const summary = (data.summary || {}) as Record<string, number>;
      const events = (data.events || []) as Array<Record<string, string>>;
      const pendingTasks = (data.pendingTasks || []) as Array<Record<string, unknown>>;
      const completedTasks = (data.completedTasks || []) as Array<Record<string, any>>;
      const deployed = agents.filter(a => a.deployed);
      const activePool = agents.filter((a: Record<string, unknown>) => !a.deployed && (((a as any).pendingTasks || []).length > 0 || ((a as any).lastCron && (Date.now() - new Date((a as any).lastCron.lastRun).getTime()) < 6 * 3600000)));
      const visible = [...deployed, ...activePool];

      // ── Responsive column widths — scale with terminal ──
      const usable = cols - 4; // 2 char indent each side
      const gap = Math.max(2, Math.min(5, Math.floor(usable / 50))); // gap scales: 2 at 100, 3 at 150, 4 at 200+
      const g = ' '.repeat(gap);
      const totalGaps = gap * 5; // 5 gaps between 6 columns
      const content = usable - totalGaps;
      // Proportional: STATUS 8%, UNIT 5%, AGENT 17%, TASK 48%, PROGRESS 14%, LAST 8%
      const statusW = Math.max(10, Math.floor(content * 0.08));
      const unitW = Math.max(5, Math.floor(content * 0.05));
      const nameW = Math.max(16, Math.floor(content * 0.17));
      const progressW = Math.max(12, Math.floor(content * 0.14));
      const lastW = Math.max(5, Math.floor(content * 0.08));
      const activityW = Math.max(20, content - statusW - unitW - nameW - progressW - lastW);

      // Render
      let out = c.clear;
      let usedRows = 0;

      // Header — single line, full width
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

      // Stats bar — compact, on same line as header
      const sb = (val: number, label: string, color: string) => `${color}${c.bold}${val}${c.reset}${c.dim}${label}${c.reset}`;
      const fmtT = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
      const u = (data as any).usage || {};
      const cs2 = u.currentSession || {};
      const wk = u.weekly || {};
      const resetDate = u.weekReset ? new Date(u.weekReset) : null;
      const daysLeft = resetDate ? Math.max(0, Math.ceil((resetDate.getTime() - Date.now()) / 86400000)) : 0;
      const resetStr = resetDate ? `${resetDate.getMonth() + 1}/${resetDate.getDate()}` : '—';

      out += `  ${c.bold}${c.blue}OPS BOARD${c.reset}  ${c.dim}${dateStr} ${timeStr}${c.reset}`;
      // Right-align usage stats
      const usageStr = `${c.dim}SESSION ${c.reset}${c.blue}${c.bold}${fmtT(cs2.total || 0)}${c.reset}  ${c.dim}WEEKLY ${c.reset}${(wk.total || 0) > 4e8 ? c.red : c.yellow}${c.bold}${fmtT(wk.total || 0)}${c.reset}  ${c.dim}resets ${resetStr} (${daysLeft}d)${c.reset}`;
      out += `  ${usageStr}\n`;
      usedRows++;

      // Compact stats line
      const errClr = (summary.errors || 0) > 0 ? c.red : c.gray;
      out += `  ${sb(summary.online || 0, ' on', c.green)} ${sb(summary.working || 0, ' wrk', c.blue)} ${sb(summary.queued || 0, ' que', c.yellow)} ${sb(summary.errors || 0, ' err', errClr)} ${sb(summary.runsToday || 0, ' runs', c.white)} ${c.dim}│${c.reset} ${sb(summary.deployed || 0, ' deployed', c.gray)} ${sb(summary.poolSize || 0, ' pool', c.gray)}\n`;
      usedRows++;

      // Separator
      out += `  ${c.dim}${'─'.repeat(usable)}${c.reset}\n`;
      usedRows++;

      // ── Agent table — responsive columns ──
      const statusStyle: Record<string, { sym: string; clr: string }> = {
        'AVAILABLE':  { sym: '● READY', clr: c.green },
        'WORKING':    { sym: '▶ WORK', clr: c.blue },
        'QUEUED':     { sym: '◆ QUEUE', clr: c.yellow },
        'CONNECTING': { sym: '◌ CONN', clr: c.yellow },
        'ERROR':      { sym: '✖ ERROR', clr: c.red },
        'OFFLINE':    { sym: '○ OFF', clr: c.gray },
      };

      // Helper: time ago from a timestamp
      function timeAgoShort(ts: string | undefined): string {
        if (!ts) return '';
        const ms = Date.now() - new Date(ts).getTime();
        if (ms < 0 || ms < 60000) return 'now';
        const m = Math.floor(ms / 60000);
        if (m < 60) return m + 'm';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h';
        return Math.floor(h / 24) + 'd';
      }

      // Header row: STATUS | UNIT | AGENT | TASK / ACTIVITY | PROGRESS | LAST
      let hdr = `  ${c.dim}${pad('STATUS', statusW)}${g}${pad('UNIT', unitW)}${g}${pad('AGENT', nameW)}${g}${pad('TASK / ACTIVITY', activityW)}${g}${pad('PROGRESS', progressW)}${g}${pad('LAST', lastW)}${c.reset}`;
      out += hdr + '\n';
      out += `  ${c.dim}${'─'.repeat(statusW)}${g}${'─'.repeat(unitW)}${g}${'─'.repeat(nameW)}${g}${'─'.repeat(activityW)}${g}${'─'.repeat(progressW)}${g}${'─'.repeat(lastW)}${c.reset}\n`;
      usedRows += 2;

      for (const a of visible) {
        const st = statusStyle[a.opStatus] || statusStyle['OFFLINE'];
        const unitStr = a.unit != null ? a.unit : '—';
        const displayName = a.name;

        // Task / Activity text
        let taskText = '—';
        if (a.opStatus === 'WORKING' && a.activity) {
          taskText = a.activity;
        } else if (a.progress && a.progress.detail) {
          taskText = a.progress.detail;
        } else if (a.activity && a.activity !== 'IDLE') {
          taskText = a.activity;
        }
        const actClr = a.opStatus === 'WORKING' ? c.blue : a.opStatus === 'QUEUED' ? c.yellow : c.gray;

        // Progress bar
        let progStr = '';
        if (a.progress && a.progress.pct != null) {
          progStr = progressBar(a.progress.pct, progressW);
        } else {
          progStr = pad('', progressW);
        }

        // Last run
        const lastCron = a.lastCron;
        const lastStr = lastCron && lastCron.lastRun ? timeAgoShort(lastCron.lastRun) : '';

        const safeTaskText = taskText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        let row = `  ${st.clr}${pad(st.sym, statusW)}${c.reset}${g}${c.dim}${pad(unitStr, unitW)}${c.reset}${g}${c.white}${pad(displayName, nameW)}${c.reset}${g}${actClr}${pad(safeTaskText.slice(0, activityW), activityW)}${c.reset}${g}${progStr}${g}${c.dim}${pad(lastStr, lastW)}${c.reset}`;
        out += row + '\n';
        usedRows++;
      }

      // ── Pending tasks — always visible ──
      {
        out += `\n  ${c.bold}${c.yellow}PENDING TASKS (${pendingTasks.length})${c.reset}\n`;
        usedRows += 2;
        const statusClr: Record<string, string> = { 'WORKING': c.blue, 'PENDING': c.yellow, 'DONE': c.green, 'CANCELLED': c.dim };
        const ptIncW = 6;
        const ptCreatedW = 11;
        const ptElapsedW = Math.max(8, Math.floor(content * 0.07));
        const ptAgentW = Math.max(18, Math.floor(content * 0.14));
        const ptStatusW = Math.max(10, Math.floor(content * 0.08));
        const ptDescW = Math.max(20, content - ptIncW - ptCreatedW - ptElapsedW - ptAgentW - ptStatusW - (gap * 5));
        // Header
        out += `  ${c.dim}${pad('INC#', ptIncW)}${g}${pad('CREATED', ptCreatedW)}${g}${pad('ELAPSED', ptElapsedW)}${g}${pad('AGENT', ptAgentW)}${g}${pad('STATUS', ptStatusW)}${g}${pad('TASK', ptDescW)}${c.reset}\n`;
        out += `  ${c.dim}${'\u2500'.repeat(ptIncW)}${g}${'\u2500'.repeat(ptCreatedW)}${g}${'\u2500'.repeat(ptElapsedW)}${g}${'\u2500'.repeat(ptAgentW)}${g}${'\u2500'.repeat(ptStatusW)}${g}${'\u2500'.repeat(ptDescW)}${c.reset}\n`;
        usedRows += 2;
        if (pendingTasks.length === 0) {
          out += `  ${c.dim}No pending tasks${c.reset}\n`;
          usedRows++;
        } else {
          for (const pt of pendingTasks) {
            const ds = String((pt as any).displayStatus || (pt.status === 'in-progress' ? 'WORKING' : pt.status === 'completed' ? 'DONE' : pt.status === 'cancelled' ? 'CANCELLED' : 'PENDING'));
            const sc = statusClr[ds] || (ds === 'DONE' ? c.green : ds === 'CANCELLED' ? c.dim : ds === 'PENDING' ? c.yellow : c.blue);
            const elapsed = String((pt as any).elapsed || pt.age || '');
            const dimRow = (pt.status === 'completed' || pt.status === 'cancelled') ? c.dim : '';
            const dimEnd = dimRow ? c.reset : '';
            // Format created time
            const ptCr = (pt as any).createdAt ? new Date((pt as any).createdAt) : null;
            const ptCrStr = ptCr ? `${ptCr.getMonth()+1}/${String(ptCr.getDate()).padStart(2,' ')} ${String(ptCr.getHours()).padStart(2,'0')}:${String(ptCr.getMinutes()).padStart(2,'0')}` : '';
            const ptInc = shortInc(String((pt as any).id || ''));
            out += `  ${c.blue}${pad(ptInc, ptIncW)}${c.reset}${g}${c.dim}${pad(ptCrStr, ptCreatedW)}${c.reset}${g}${c.dim}${pad(elapsed, ptElapsedW)}${c.reset}${g}${dimRow}${c.white}${pad(String(pt.agent), ptAgentW)}${c.reset}${g}${sc}${pad(ds, ptStatusW)}${c.reset}${g}${dimRow}${String(pt.title).slice(0, Math.max(20, ptDescW))}${dimEnd}\n`;
            usedRows++;
          }
        }
      }

      // ── Completed tasks — always visible ──
      {
        out += `\n  ${c.bold}${c.green}COMPLETED TASKS (${completedTasks.length})${c.reset}\n`;
        usedRows += 2;
        const ctIncW = 6;
        const ctAgentW = Math.max(18, Math.floor(content * 0.16));
        const ctTimeW = 5;
        const ctAgoW = 5;
        const ctDescW = Math.max(20, content - ctIncW - ctAgentW - ctTimeW - ctAgoW - 2 - (gap * 5));
        // Header
        out += `  ${c.dim}${pad('INC#', ctIncW)}${g}${pad('TIME', ctTimeW)}${g}${pad('AGO', ctAgoW)}${g}${pad('', 2)}${g}${pad('AGENT', ctAgentW)}${g}${pad('TASK', ctDescW)}${c.reset}\n`;
        out += `  ${c.dim}${'\u2500'.repeat(ctIncW)}${g}${'\u2500'.repeat(ctTimeW)}${g}${'\u2500'.repeat(ctAgoW)}${g}${'\u2500'.repeat(2)}${g}${'\u2500'.repeat(ctAgentW)}${g}${'\u2500'.repeat(ctDescW)}${c.reset}\n`;
        usedRows += 2;
        if (completedTasks.length === 0) {
          out += `  ${c.dim}No completed tasks${c.reset}\n`;
          usedRows++;
        } else {
          for (const ct of completedTasks) {
            const ctTime = ct.completedAt ? new Date(ct.completedAt) : null;
            const ctTs = ctTime ? `${String(ctTime.getHours()).padStart(2, '0')}:${String(ctTime.getMinutes()).padStart(2, '0')}` : '     ';
            const ctAgo = String(ct.ago || '');
            const ctTitle = String(ct.title || '').slice(0, Math.max(20, ctDescW));
            const ctUnit = ct.unit ? ` (${ct.unit})` : '';
            const ctInc = shortInc(String(ct.id || ''));
            out += `  ${c.blue}${pad(ctInc, ctIncW)}${c.reset}${g}${c.green}${ctTs}${c.reset}${g}${c.dim}${pad(ctAgo, ctAgoW)}${c.reset}${g}${c.green}${c.bold}\u2713${c.reset}${g}${c.green}${pad(String(ct.agent) + ctUnit, ctAgentW)}${c.reset}${g}${c.green}${ctTitle}${c.reset}\n`;
            usedRows++;
          }
        }
      }

      // ── Activity feed — fill remaining terminal rows ──
      out += `\n  ${c.dim}${'\u2500'.repeat(usable)}${c.reset}\n`;
      out += `  ${c.bold}${c.blue}ACTIVITY FEED${c.reset}\n`;
      usedRows += 3;

      const footerRows = 1; // footer line
      const availableEventRows = Math.max(3, rows - usedRows - footerRows);

      // Activity feed column widths
      const afTimeW = 5;
      const afAgoW = 4;
      const afIconW = 2;
      const afAgentW = Math.max(18, Math.floor(content * 0.18));
      const afDetailW = Math.max(20, content - afTimeW - afAgoW - afIconW - afAgentW - (gap * 3));

      // Header
      out += `  ${c.dim}${pad('TIME', afTimeW)}${g}${pad('AGO', afAgoW)}${g}${pad('', afIconW)}${g}${pad('AGENT', afAgentW)}${g}${pad('DETAIL', afDetailW)}${c.reset}\n`;
      out += `  ${c.dim}${'\u2500'.repeat(afTimeW)}${g}${'\u2500'.repeat(afAgoW)}${g}${'\u2500'.repeat(afIconW)}${g}${'\u2500'.repeat(afAgentW)}${g}${'\u2500'.repeat(afDetailW)}${c.reset}\n`;
      usedRows += 2;

      if (events.length === 0) {
        out += `  ${c.dim}No activity${c.reset}\n`;
      } else {
        const typeClr: Record<string, string> = { ok: c.green, error: c.red, working: c.blue, queued: c.yellow, tool: c.cyan };
        const typeIcon: Record<string, string> = { ok: '✓', error: '✖', working: '▶', queued: '◆', tool: '‣' };
        // Per-tool-type colors for the CLI
        const toolClr: Record<string, string> = {
          Read: c.blue,           // reading/inspecting
          Write: c.purple,        // creating files
          Edit: c.orange,         // modifying files
          Bash: c.gray,           // shell commands
          Grep: c.green,          // searching content
          Glob: c.brightGreen,    // finding files
          Agent: c.yellow,        // delegating
          WebSearch: c.cyan,      // web search
          WebFetch: c.cyan,       // web fetch
        };
        for (const ev of events.slice(0, availableEventRows)) {
          const evT = ev.time ? new Date(ev.time) : null;
          const ts = evT ? `${String(evT.getHours()).padStart(2, '0')}:${String(evT.getMinutes()).padStart(2, '0')}` : '     ';
          const ms = evT ? Date.now() - evT.getTime() : 0;
          let ago = '';
          if (ms < 60000) ago = 'now';
          else if (ms < 3600000) ago = Math.floor(ms / 60000) + 'm';
          else ago = Math.floor(ms / 3600000) + 'h';
          // Completion detection — only actual task completions get full green
          const isCompletion = ev.type === 'ok' && ev.detail && (ev.detail.startsWith('\u2713 Completed:') || ev.detail.startsWith('\u2713 Cancelled:') || ev.detail.startsWith('\u2716 Cancelled:'));
          // Use tool-specific color when available
          const evToolClr = ev.type === 'tool' && (ev as any).toolName ? (toolClr[(ev as any).toolName] || c.cyan) : null;
          const tc = isCompletion ? c.green : evToolClr || (ev.type === 'ok' ? c.dim : typeClr[ev.type]) || c.gray;
          const ti = typeIcon[ev.type] || '·';
          const detailClr = isCompletion ? c.green : evToolClr || (ev.type === 'working' ? c.blue : c.gray);
          const agentClr = isCompletion ? c.green : ev.type === 'tool' ? c.gray : c.white;
          const tsClr = isCompletion ? c.green : c.dim;
          const agoClr = isCompletion ? c.green : c.gray;
          out += `  ${tsClr}${pad(ts, afTimeW)}${c.reset}${g}${agoClr}${pad(ago, afAgoW)}${c.reset}${g}${tc}${c.bold}${pad(ti, afIconW)}${c.reset}${g}${agentClr}${pad(ev.agent, afAgentW)}${c.reset}${g}${detailClr}${(ev.detail || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').slice(0, Math.max(20, afDetailW))}${c.reset}\n`;
        }
      }

      out += `${c.dim}  ${pad('', usable)}${c.reset}\n`;
      out += `${c.dim}  Refreshing every 10s · [r] roster · ${cols}x${rows} · Ctrl+C to exit${c.reset}`;
      process.stdout.write(out);
    }

    // ── Roster screen (toggled with 'r') ──
    async function renderRoster() {
      if (!lastData) return;
      const cols = process.stdout.columns || 120;
      const agents = (lastData.agents || []) as Array<Record<string, any>>;
      const completedTasks = (lastData.completedTasks || []) as Array<Record<string, any>>;

      // Count completed tasks per agent
      const completedCounts: Record<string, number> = {};
      for (const ct of completedTasks) {
        const name = ct.agent || '';
        completedCounts[name] = (completedCounts[name] || 0) + 1;
      }

      const statusStyle: Record<string, { sym: string; clr: string }> = {
        'AVAILABLE': { sym: 'READY', clr: c.green },
        'WORKING': { sym: 'BUSY', clr: c.blue },
        'QUEUED': { sym: 'QUEUED', clr: c.yellow },
        'CONNECTING': { sym: 'CONN', clr: c.yellow },
        'ERROR': { sym: 'ERROR', clr: c.red },
        'OFFLINE': { sym: 'OFF', clr: c.gray },
      };

      const nameW = 20;
      const unitW = 7;
      const statusW = 8;
      const modelW = 7;
      const doneW = 6;
      const usable2 = cols - 4;
      const gap2 = 2;
      const g2 = '  ';
      const descW = Math.max(20, usable2 - nameW - unitW - statusW - modelW - doneW - (gap2 * 5));

      let out = c.clear;
      out += `  ${c.bold}${c.blue}AGENT ROSTER${c.reset}  ${c.dim}${agents.filter(a => a.deployed).length} deployed${c.reset}\n`;
      out += `  ${c.dim}${'\u2500'.repeat(usable2)}${c.reset}\n`;
      out += `  ${c.dim}${pad('AGENT', nameW)}${g2}${pad('UNIT', unitW)}${g2}${pad('STATUS', statusW)}${g2}${pad('MODEL', modelW)}${g2}${pad('DONE', doneW)}${g2}${pad('SPECIALTY / ROLE', descW)}${c.reset}\n`;
      out += `  ${c.dim}${'\u2500'.repeat(nameW)}${g2}${'\u2500'.repeat(unitW)}${g2}${'\u2500'.repeat(statusW)}${g2}${'\u2500'.repeat(modelW)}${g2}${'\u2500'.repeat(doneW)}${g2}${'\u2500'.repeat(descW)}${c.reset}\n`;

      const sorted = [...agents].sort((a, b) => {
        if (a.slug === '19q1') return -1;
        if (b.slug === '19q1') return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      for (const a of sorted) {
        if (!a.deployed) continue;
        const st = statusStyle[a.opStatus] || statusStyle['OFFLINE'];
        const name = a.name || a.slug;
        const unit = a.unit || '';
        const model = a.model || 'sonnet';
        const done = completedCounts[name] || 0;
        const desc = (a.description || '').slice(0, descW);
        const nameClr = a.opStatus === 'AVAILABLE' ? c.white : a.opStatus === 'WORKING' ? c.blue : c.gray;
        out += `  ${nameClr}${pad(name, nameW)}${c.reset}${g2}${c.dim}${pad(unit, unitW)}${c.reset}${g2}${st.clr}${pad(st.sym, statusW)}${c.reset}${g2}${c.dim}${pad(model, modelW)}${c.reset}${g2}${done > 0 ? c.green : c.dim}${pad(String(done), doneW)}${c.reset}${g2}${c.gray}${desc}${c.reset}\n`;
        if (a.opStatus === 'WORKING' && a.activity) {
          out += `  ${' '.repeat(nameW)}${g2}${' '.repeat(unitW)}${g2}${c.blue}${pad('', statusW)}${c.reset}${g2}${' '.repeat(modelW)}${g2}${' '.repeat(doneW)}${g2}${c.cyan}${a.activity.slice(0, descW)}${c.reset}\n`;
        }
      }

      // Communication topology
      out += `\n  ${c.dim}${'\u2500'.repeat(usable2)}${c.reset}\n`;
      out += `  ${c.bold}${c.blue}COMMUNICATION${c.reset}\n\n`;
      for (const a of sorted) {
        if (!a.deployed) continue;
        const canMsg = a.canMessage || [];
        if (canMsg.length > 0) {
          const targets = canMsg.map((slug: string) => {
            const target = agents.find((x: Record<string, any>) => x.slug === slug);
            return target ? target.name : slug;
          }).join(', ');
          out += `  ${c.white}${pad(a.name || a.slug, nameW)}${c.reset}${g2}${c.dim}can message:${c.reset} ${targets}\n`;
        }
      }

      // Channels
      out += `\n  ${c.dim}${'\u2500'.repeat(usable2)}${c.reset}\n`;
      out += `  ${c.bold}${c.blue}CHANNELS${c.reset}\n\n`;
      for (const a of sorted) {
        if (!a.deployed || !a.channel) continue;
        out += `  ${c.white}${pad(a.name || a.slug, nameW)}${c.reset}${g2}${c.dim}#${a.channel}${c.reset}\n`;
      }

      out += `\n${c.dim}  Press [o] for ops board · Ctrl+C to exit${c.reset}`;
      process.stdout.write(out);
    }

    await render();
    if (opts.watch !== false) {
      setInterval(render, 10000);

      // Keyboard handling for screen switching
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (key: string) => {
          if (key === '\u0003') { process.exit(); } // Ctrl+C
          if (key === 'r' && currentScreen === 'ops') {
            currentScreen = 'roster';
            render();
          } else if ((key === 'o' || key === '\u001b') && currentScreen === 'roster') { // 'o' or Escape
            currentScreen = 'ops';
            render();
          }
        });
      }
    }
  });

program
  .command('roster')
  .description('Show agent roster with specialties, availability, and recent workload')
  .action(async () => {
    const { readFileSync, existsSync, readdirSync } = await import('node:fs');
    const pathMod = await import('node:path');
    const BASE_DIR = process.env.CLEMENTINE_HOME || pathMod.default.join(process.env.HOME || '', '.clementine');
    const tokenPath = pathMod.default.join(BASE_DIR, '.dashboard-token');

    const c = {
      reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
      green: '\x1b[32m', blue: '\x1b[34m', yellow: '\x1b[33m', red: '\x1b[31m',
      cyan: '\x1b[36m', gray: '\x1b[90m', white: '\x1b[97m',
      orange: '\x1b[38;5;208m', purple: '\x1b[38;5;141m',
    };

    function pad(s: string, w: number) { return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); }

    // Fetch from dashboard API
    let data: Record<string, unknown> | null = null;
    if (existsSync(tokenPath)) {
      try {
        const token = readFileSync(tokenPath, 'utf-8').trim();
        const resp = await fetch('http://127.0.0.1:3030/api/ops-board', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) data = await resp.json() as Record<string, unknown>;
      } catch { /* dashboard not running */ }
    }

    if (!data) {
      console.log('  Dashboard not running. Start with: clementine dashboard');
      process.exit(1);
    }

    const agents = (data.agents || []) as Array<Record<string, any>>;
    const completedTasks = (data.completedTasks || []) as Array<Record<string, any>>;
    const cols = process.stdout.columns || 120;
    const usable = cols - 4;
    const gap = 2;
    const g = ' '.repeat(gap);

    // Count completed tasks per agent (recent)
    const completedCounts: Record<string, number> = {};
    for (const ct of completedTasks) {
      const name = ct.agent || '';
      completedCounts[name] = (completedCounts[name] || 0) + 1;
    }

    // Status styling
    const statusStyle: Record<string, { sym: string; clr: string }> = {
      'AVAILABLE':  { sym: 'READY', clr: c.green },
      'WORKING':    { sym: 'BUSY', clr: c.blue },
      'QUEUED':     { sym: 'QUEUED', clr: c.yellow },
      'CONNECTING': { sym: 'CONN', clr: c.yellow },
      'ERROR':      { sym: 'ERROR', clr: c.red },
      'OFFLINE':    { sym: 'OFF', clr: c.gray },
    };

    // Column widths
    const nameW = 20;
    const unitW = 7;
    const statusW = 8;
    const modelW = 7;
    const doneW = 6;
    const descW = Math.max(20, usable - nameW - unitW - statusW - modelW - doneW - (gap * 5));

    // Header
    console.log();
    console.log(`  ${c.bold}${c.blue}AGENT ROSTER${c.reset}  ${c.dim}${agents.length} deployed${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(usable)}${c.reset}`);
    console.log(`  ${c.dim}${pad('AGENT', nameW)}${g}${pad('UNIT', unitW)}${g}${pad('STATUS', statusW)}${g}${pad('MODEL', modelW)}${g}${pad('DONE', doneW)}${g}${pad('SPECIALTY / ROLE', descW)}${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(nameW)}${g}${'─'.repeat(unitW)}${g}${'─'.repeat(statusW)}${g}${'─'.repeat(modelW)}${g}${'─'.repeat(doneW)}${g}${'─'.repeat(descW)}${c.reset}`);

    // Sort: Q1 first, then deployed agents alphabetically
    const sorted = [...agents].sort((a, b) => {
      if (a.slug === '19q1') return -1;
      if (b.slug === '19q1') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    for (const a of sorted) {
      if (!a.deployed) continue;
      const st = statusStyle[a.opStatus] || statusStyle['OFFLINE'];
      const name = a.name || a.slug;
      const unit = a.unit || '';
      const model = a.model || 'sonnet';
      const done = completedCounts[name] || 0;
      const desc = (a.description || '').slice(0, descW);
      const nameClr = a.opStatus === 'AVAILABLE' ? c.white : a.opStatus === 'WORKING' ? c.blue : c.gray;

      console.log(
        `  ${nameClr}${pad(name, nameW)}${c.reset}${g}` +
        `${c.dim}${pad(unit, unitW)}${c.reset}${g}` +
        `${st.clr}${pad(st.sym, statusW)}${c.reset}${g}` +
        `${c.dim}${pad(model, modelW)}${c.reset}${g}` +
        `${done > 0 ? c.green : c.dim}${pad(String(done), doneW)}${c.reset}${g}` +
        `${c.gray}${desc}${c.reset}`
      );

      // If working, show current activity indented
      if (a.opStatus === 'WORKING' && a.activity) {
        console.log(`  ${' '.repeat(nameW)}${g}${' '.repeat(unitW)}${g}${c.blue}${pad('', statusW)}${c.reset}${g}${' '.repeat(modelW)}${g}${' '.repeat(doneW)}${g}${c.cyan}${a.activity.slice(0, descW)}${c.reset}`);
      }
    }

    // Show who can message whom
    console.log();
    console.log(`  ${c.dim}${'─'.repeat(usable)}${c.reset}`);
    console.log(`  ${c.bold}${c.blue}COMMUNICATION${c.reset}`);
    console.log();
    for (const a of sorted) {
      if (!a.deployed) continue;
      const canMsg = a.canMessage || [];
      if (canMsg.length > 0) {
        const targets = canMsg.map((slug: string) => {
          const target = agents.find(x => x.slug === slug);
          return target ? target.name : slug;
        }).join(', ');
        console.log(`  ${c.white}${pad(a.name || a.slug, nameW)}${c.reset}${g}${c.dim}can message:${c.reset} ${targets}`);
      }
    }

    // Show channel assignments
    console.log();
    console.log(`  ${c.dim}${'─'.repeat(usable)}${c.reset}`);
    console.log(`  ${c.bold}${c.blue}CHANNELS${c.reset}`);
    console.log();
    for (const a of sorted) {
      if (!a.deployed || !a.channel) continue;
      console.log(`  ${c.white}${pad(a.name || a.slug, nameW)}${c.reset}${g}${c.dim}#${a.channel}${c.reset}`);
    }

    console.log();
  });

program
  .command('chat')
  .description('Interactive chat with Q1 — full MCP tools, named sessions, streaming')
  .option('-m, --model <tier>', 'Model tier (haiku, sonnet, opus)')
  .option('-n, --name <session-name>', 'Name this session (enables resume)')
  .option('-l, --list', 'List named sessions')
  .option('--project <name>', 'Set active project context')
  .option('--profile <slug>', 'Set agent profile')
  .action((opts: { model?: string; project?: string; profile?: string; name?: string; list?: boolean }) => {
    cmdChat(opts).catch((err: unknown) => {
      console.error('Chat error:', err);
      process.exit(1);
    });
  });

program
  .command('agent-chat')
  .description('Interactive chat session with a team agent')
  .argument('[slug]', 'Agent slug (supports fuzzy matching, e.g. "olivia" matches "olivia-pope")')
  .option('-m, --model <tier>', 'Model tier override (haiku, sonnet, opus)')
  .option('-l, --list', 'List available agents')
  .action((slug: string | undefined, opts: { model?: string; list?: boolean }) => {
    cmdAgentChat(slug ?? '', opts).catch((err: unknown) => {
      console.error('Agent chat error:', err);
      process.exit(1);
    });
  });

program
  .command('update')
  .description('Pull latest code, rebuild, and reinstall (preserves config)')
  .argument('[action]', 'Optional: "restart" to restart daemon after update')
  .option('--restart', 'Restart daemon after update')
  .option('--dry-run', 'Preview what would happen without making changes')
  .action((action: string | undefined, options: { restart?: boolean; dryRun?: boolean }) => {
    if (action === 'restart') options.restart = true;
    cmdUpdate(options).catch((err: unknown) => {
      console.error('Update failed:', err);
      process.exit(1);
    });
  });

const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('setup')
  .description('Run interactive setup wizard')
  .action(() => {
    ensureDataHome();
    runSetup().catch((err: unknown) => {
      console.error('Setup failed:', err);
      process.exit(1);
    });
  });

configCmd
  .command('set <key> <value>')
  .description('Set a config value in .env')
  .action(cmdConfigSet);

configCmd
  .command('get <key>')
  .description('Get a config value from .env')
  .action(cmdConfigGet);

configCmd
  .command('list')
  .description('List all config values')
  .action(cmdConfigList);

// ── Update command ──────────────────────────────────────────────────

async function cmdUpdate(options: { restart?: boolean; dryRun?: boolean }): Promise<void> {
  const DIM = '\x1b[0;90m';
  const GREEN = '\x1b[0;32m';
  const YELLOW = '\x1b[1;33m';
  const RED = '\x1b[0;31m';
  const RESET = '\x1b[0m';

  console.log();
  console.log(`  ${DIM}Updating ${getAssistantName()}...${RESET}`);
  console.log();

  // 1. Check we're in a git repo
  if (!existsSync(path.join(PACKAGE_ROOT, '.git'))) {
    console.error(`  ${RED}FAIL${RESET}  Package root is not a git repository: ${PACKAGE_ROOT}`);
    console.error('  Update requires a git-cloned installation.');
    process.exit(1);
  }

  let step = 0;
  const S = () => `[${++step}]`;

  // 2. Ensure we're on main and reset any local src/ changes.
  //    Source modifications are tracked in ~/.clementine/ (not git),
  //    so resetting the working tree is safe — mods get re-applied after pull.
  if (!options.dryRun) {
    try {
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: PACKAGE_ROOT,
        encoding: 'utf-8',
      }).trim();
      if (currentBranch !== 'main') {
        console.log(`  ${S()} Switching to main branch...`);
        execSync('git checkout main', { cwd: PACKAGE_ROOT, stdio: 'pipe' });
        console.log(`  ${GREEN}OK${RESET}  Switched to main`);
      }
    } catch { /* best effort */ }

    try {
      execSync('git checkout -- src/', { cwd: PACKAGE_ROOT, stdio: 'pipe' });
    } catch { /* no local src/ changes to reset */ }
  }

  // 3. Stash any remaining local changes (package-lock.json, etc.)
  let didStash = false;
  try {
    const status = execSync('git status --porcelain', { cwd: PACKAGE_ROOT, encoding: 'utf-8' }).trim();
    if (status) {
      console.log(`  ${S()} Stashing local changes...`);
      const stashOut = execSync('git stash', { cwd: PACKAGE_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      didStash = !stashOut.includes('No local changes');
      if (didStash) {
        console.log(`  ${GREEN}OK${RESET}  Stashed local changes`);
      }
    }
  } catch {
    // not fatal — pull may still succeed if changes don't conflict
  }

  // 3. Back up user config
  const backupDir = path.join(BASE_DIR, 'backups', `pre-update-${localISO().slice(0, 19).replace(/[T:]/g, '-')}`);
  console.log(`  ${S()} Backing up config...`);

  if (!options.dryRun) {
    mkdirSync(backupDir, { recursive: true });

    // .env
    if (existsSync(ENV_PATH)) {
      const envContent = readFileSync(ENV_PATH, 'utf-8');
      writeFileSync(path.join(backupDir, '.env'), envContent);
    }

    // Cron state
    const cronStateFile = path.join(BASE_DIR, '.cron_last_run.json');
    if (existsSync(cronStateFile)) {
      writeFileSync(
        path.join(backupDir, '.cron_last_run.json'),
        readFileSync(cronStateFile, 'utf-8'),
      );
    }

    // Heartbeat state
    const hbStateFile = path.join(BASE_DIR, '.heartbeat_state.json');
    if (existsSync(hbStateFile)) {
      writeFileSync(
        path.join(backupDir, '.heartbeat_state.json'),
        readFileSync(hbStateFile, 'utf-8'),
      );
    }

    // Sessions
    const sessionsFile = path.join(BASE_DIR, '.sessions.json');
    if (existsSync(sessionsFile)) {
      writeFileSync(
        path.join(backupDir, '.sessions.json'),
        readFileSync(sessionsFile, 'utf-8'),
      );
    }

    console.log(`  ${GREEN}OK${RESET}  Config backed up`);
  } else {
    console.log(`  ${DIM}(dry run — skipping backup)${RESET}`);
  }

  // 4. Stop running daemon
  const pid = readPid();
  const wasRunning = pid && isProcessAlive(pid);
  if (wasRunning) {
    console.log(`  ${S()} Stopping daemon (PID ${pid})...`);
    if (!options.dryRun) {
      stopDaemon(pid!);
      try { unlinkSync(getPidFilePath()); } catch { /* ignore */ }
    }
    console.log(`  ${GREEN}OK${RESET}  Daemon stopped`);
  }

  // Helper: if update fails after stopping daemon, relaunch before exiting
  function failAndRestart(backupDir: string): never {
    if (wasRunning) {
      console.log();
      console.log(`  Restarting daemon (was running before update)...`);
      try {
        cmdLaunch({});
        console.log(`  ${GREEN}OK${RESET}  Daemon restarted`);
      } catch {
        console.error(`  ${YELLOW}WARN${RESET}  Could not restart daemon — run: clementine launch`);
      }
    }
    console.log();
    console.log(`  ${DIM}Config backup is at: ${backupDir}${RESET}`);
    process.exit(1);
  }

  if (options.dryRun) {
    console.log();
    console.log(`  ${DIM}Dry run — would execute:${RESET}`);
    console.log(`    ${S()} Reset local src/ (mods tracked in ~/.clementine/)`);
    console.log(`    ${S()} Pull latest (git pull --ff-only)`);
    console.log(`    ${S()} Install dependencies (npm install)`);
    console.log(`    ${S()} Build (clean)`);
    console.log(`    ${S()} Verify build output`);
    console.log(`    ${S()} Reinstall CLI globally`);
    console.log(`    ${S()} Restore local changes`);
    console.log(`    ${S()} Reconcile source modifications`);
    console.log(`    ${S()} Run vault migrations`);
    console.log(`    ${S()} Run health check (clementine doctor)`);
    if (options.restart || wasRunning) {
      console.log(`    ${S()} Restart daemon`);
    }
    console.log();
    return;
  }

  // 5. Git pull
  console.log(`  ${S()} Pulling latest...`);
  let commitsPulled = 0;
  let pullSummary = '';
  try {
    // Count how many commits we're behind before pulling
    try {
      execSync('git fetch origin main --quiet', { cwd: PACKAGE_ROOT, stdio: 'pipe', timeout: 30_000 });
      const countStr = execSync('git rev-list HEAD..origin/main --count', {
        cwd: PACKAGE_ROOT, encoding: 'utf-8',
      }).trim();
      commitsPulled = parseInt(countStr, 10) || 0;
      if (commitsPulled > 0) {
        pullSummary = execSync('git log HEAD..origin/main --oneline --no-decorate', {
          cwd: PACKAGE_ROOT, encoding: 'utf-8',
        }).trim();
      }
    } catch { /* non-fatal — we'll still pull */ }

    const pullOutput = execSync('git pull --ff-only', {
      cwd: PACKAGE_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (pullOutput.includes('Already up to date')) {
      console.log(`  ${GREEN}OK${RESET}  Already up to date`);
    } else {
      console.log(`  ${GREEN}OK${RESET}  Pulled updates`);
    }
  } catch (err) {
    const errStr = String(err);
    if (errStr.includes('local changes') || errStr.includes('overwritten by merge')) {
      console.error(`  ${RED}FAIL${RESET}  Local file changes conflict with the update.`);
      console.error();
      console.error(`  Fix — run these commands, then retry:`);
      console.error(`    cd ${PACKAGE_ROOT}`);
      console.error(`    git stash`);
      console.error(`    clementine update`);
      console.error();
      console.error(`  ${DIM}Your local changes will be saved. Restore after update with: git stash pop${RESET}`);
    } else if (errStr.includes('Not possible to fast-forward')) {
      console.error(`  ${RED}FAIL${RESET}  Cannot fast-forward. Local commits conflict with upstream.`);
      console.error();
      console.error(`  Fix — run these commands, then retry:`);
      console.error(`    cd ${PACKAGE_ROOT}`);
      console.error(`    git stash`);
      console.error(`    git pull --rebase`);
      console.error(`    git stash pop`);
    } else {
      console.error(`  ${RED}FAIL${RESET}  git pull failed: ${errStr.slice(0, 200)}`);
    }
    if (didStash) {
      console.log(`  ${DIM}Restoring stashed changes...${RESET}`);
      try { execSync('git stash pop', { cwd: PACKAGE_ROOT, stdio: 'pipe' }); } catch { /* best effort */ }
    }
    failAndRestart(backupDir);
  }

  // 6. npm install
  console.log(`  ${S()} Installing dependencies...`);
  try {
    execSync('npm install --loglevel=error --no-audit', {
      cwd: PACKAGE_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`  ${GREEN}OK${RESET}  Dependencies installed`);
  } catch (err) {
    console.error(`  ${RED}FAIL${RESET}  npm install failed: ${String(err).slice(0, 200)}`);
    failAndRestart(backupDir);
  }

  // 6b. Rebuild native modules (better-sqlite3) for current Node version
  try {
    execSync('npm rebuild better-sqlite3', {
      cwd: PACKAGE_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`  ${GREEN}OK${RESET}  Native modules rebuilt`);
  } catch {
    console.error(`  ${YELLOW}WARN${RESET}  Native module rebuild failed — memory search may not work`);
  }

  // 6c. Verify graph engine system dependencies + binaries
  console.log(`  ${S()} Verifying graph engine...`);
  const missingDeps: string[] = [];
  try { execSync('which redis-server', { stdio: 'pipe' }); } catch { missingDeps.push('redis-server'); }
  const libompPath = process.platform === 'darwin'
    ? '/opt/homebrew/opt/libomp/lib/libomp.dylib'
    : '/usr/lib/libomp.so';
  if (!existsSync(libompPath)) missingDeps.push('libomp');

  if (missingDeps.length > 0) {
    console.error(`  ${YELLOW}WARN${RESET}  Knowledge graph dependencies missing: ${missingDeps.join(', ')}`);
    if (process.platform === 'darwin') {
      console.error(`       Fix: brew install ${missingDeps.map(d => d === 'redis-server' ? 'redis' : d).join(' ')}`);
    } else {
      console.error(`       Fix: sudo apt install ${missingDeps.map(d => d === 'redis-server' ? 'redis-server' : 'libomp-dev').join(' ')}`);
    }
  }

  try {
    execSync(
      `node -e "const{BinaryManager}=require('falkordblite/dist/binary-manager.js');new BinaryManager().ensureBinaries().then(()=>process.exit(0)).catch(()=>process.exit(1))"`,
      { cwd: PACKAGE_ROOT, stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 },
    );
    if (missingDeps.length === 0) {
      console.log(`  ${GREEN}OK${RESET}  FalkorDB graph engine ready`);
    } else {
      console.log(`  ${GREEN}OK${RESET}  FalkorDB binaries ready (install system deps above for full graph support)`);
    }
  } catch {
    console.error(`  ${YELLOW}WARN${RESET}  FalkorDB graph engine setup failed — knowledge graph features will be disabled`);
    console.error(`       Run: cd ${PACKAGE_ROOT} && node node_modules/falkordblite/scripts/postinstall.js`);
  }

  // 7. Build (clean)
  console.log(`  ${S()} Building (clean)...`);
  try {
    execSync('npm run build', {
      cwd: PACKAGE_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`  ${GREEN}OK${RESET}  Build succeeded`);
  } catch (err) {
    // Build failed — retry with fresh npm install (handles missing typescript after pull)
    console.error(`  ${YELLOW}WARN${RESET}  Build failed — retrying with fresh dependency install...`);
    try {
      execSync('npm install --loglevel=error --no-audit && npm run build', {
        cwd: PACKAGE_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(`  ${GREEN}OK${RESET}  Build succeeded (after reinstall)`);
    } catch (retryErr) {
      console.error(`  ${RED}FAIL${RESET}  Build failed after update: ${String(retryErr).slice(0, 200)}`);
      failAndRestart(backupDir);
    }
  }

  // 7b. Verify build output is fresh
  const distEntry = path.join(PACKAGE_ROOT, 'dist', 'cli', 'index.js');
  if (existsSync(distEntry)) {
    const distStat = statSync(distEntry);
    const ageMs = Date.now() - distStat.mtimeMs;
    if (ageMs > 30_000) {
      console.error(`  ${YELLOW}WARN${RESET}  Build output appears stale (${Math.round(ageMs / 1000)}s old) — retrying with clean build...`);
      try {
        execSync('rm -rf dist && npm run build', { cwd: PACKAGE_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
        console.log(`  ${GREEN}OK${RESET}  Clean rebuild succeeded`);
      } catch (err) {
        console.error(`  ${RED}FAIL${RESET}  Clean rebuild failed: ${String(err).slice(0, 200)}`);
        failAndRestart(backupDir);
      }
    }
  }

  // 8. Reinstall globally
  console.log(`  ${S()} Reinstalling CLI globally...`);
  try {
    execSync('npm install -g . --loglevel=error --no-audit', {
      cwd: PACKAGE_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`  ${GREEN}OK${RESET}  CLI reinstalled`);
  } catch (err) {
    console.error(`  ${YELLOW}WARN${RESET}  Global reinstall failed (may need sudo): ${String(err).slice(0, 200)}`);
    // Non-fatal — local dist is already updated
  }

  // 9. Restore stashed local changes
  if (didStash) {
    console.log(`  ${S()} Restoring local changes...`);
    try {
      execSync('git stash pop', {
        cwd: PACKAGE_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(`  ${GREEN}OK${RESET}  Local changes restored`);
    } catch {
      console.error(`  ${YELLOW}WARN${RESET}  Could not auto-restore stashed changes`);
      console.log(`       Your changes are saved in: git -C "${PACKAGE_ROOT}" stash list`);
    }
  }

  // 10. Reconcile source modifications from self-improve
  //     Source mods are tracked in ~/.clementine/self-improve/source-mods/
  //     After pulling new code, we check each active mod and re-apply if needed.
  console.log(`  ${S()} Reconciling source modifications...`);
  let reconcileResult: { reapplied: string[]; superseded: string[]; needsReconciliation: string[]; failed: string[] } | null = null;
  try {
    const { reconcileSourceMods } = await import('../agent/source-mods.js');
    const result = reconcileSourceMods(PACKAGE_ROOT);
    reconcileResult = result;

    const total = result.reapplied.length + result.superseded.length +
      result.needsReconciliation.length + result.failed.length;

    if (total === 0) {
      console.log(`  ${GREEN}OK${RESET}  No source modifications to reconcile`);
    } else {
      if (result.superseded.length > 0) {
        console.log(`  ${GREEN}OK${RESET}  ${result.superseded.length} mod(s) already in upstream — marked superseded`);
      }
      if (result.reapplied.length > 0) {
        console.log(`  ${GREEN}OK${RESET}  ${result.reapplied.length} mod(s) re-applied successfully`);
        // Rebuild with re-applied mods
        console.log(`  ${S()} Rebuilding with re-applied modifications...`);
        try {
          execSync('npm run build', { cwd: PACKAGE_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
          console.log(`  ${GREEN}OK${RESET}  Rebuild succeeded`);
        } catch {
          console.error(`  ${YELLOW}WARN${RESET}  Rebuild failed — continuing with base build`);
          try { execSync('git checkout -- src/', { cwd: PACKAGE_ROOT, stdio: 'pipe' }); } catch { /* best effort */ }
        }
      }
      if (result.needsReconciliation.length > 0) {
        console.log(`  ${YELLOW}NOTE${RESET}  ${result.needsReconciliation.length} mod(s) need reconciliation`);
        console.log(`       ${getAssistantName()} will re-apply these intelligently on next startup.`);
      }
      if (result.failed.length > 0) {
        console.error(`  ${YELLOW}WARN${RESET}  ${result.failed.length} mod(s) failed typecheck — reverted`);
      }
    }
  } catch (err) {
    console.error(`  ${YELLOW}WARN${RESET}  Source mod reconciliation failed: ${String(err).slice(0, 150)}`);
  }

  // 10b. Run vault migrations (structural updates to user vault files)
  console.log(`  ${S()} Running vault migrations...`);
  try {
    const { runVaultMigrations } = await import('../vault-migrations/runner.js');
    const migResult = await runVaultMigrations(
      path.join(BASE_DIR, 'vault'),
      backupDir,
    );

    const migApplied = migResult.applied.length;
    const migSkipped = migResult.skipped.length;
    const migFailed = migResult.failed.length;

    if (migApplied > 0) {
      console.log(`  ${GREEN}OK${RESET}  Applied ${migApplied} vault migration(s): ${migResult.applied.join(', ')}`);
    }
    if (migSkipped > 0) {
      console.log(`  ${GREEN}OK${RESET}  ${migSkipped} migration(s) already present — skipped`);
    }
    if (migFailed > 0) {
      console.error(`  ${YELLOW}WARN${RESET}  ${migFailed} migration(s) failed — will retry on next update`);
      for (const e of migResult.errors) {
        console.error(`       ${e.id}: ${e.error}`);
      }
    }
    if (migApplied === 0 && migSkipped === 0 && migFailed === 0) {
      console.log(`  ${GREEN}OK${RESET}  No new vault migrations`);
    }
  } catch (err) {
    console.error(`  ${YELLOW}WARN${RESET}  Vault migration failed: ${String(err).slice(0, 150)}`);
  }

  // 11. Doctor check
  console.log();
  console.log(`  ${S()} Running health check...`);
  cmdDoctor();

  // 11. Kill any running dashboard process so it picks up new code on next start
  try {
    const dashPids = execSync("pgrep -f 'clementine.*dashboard' || true", { encoding: 'utf-8' }).trim();
    if (dashPids) {
      for (const dp of dashPids.split('\n').filter(Boolean)) {
        const dpid = parseInt(dp, 10);
        if (!isNaN(dpid) && dpid !== process.pid) {
          try { process.kill(dpid, 'SIGTERM'); } catch { /* ignore */ }
        }
      }
      console.log(`  ${GREEN}OK${RESET}  Stopped dashboard process (restart with: clementine dashboard)`);
    }
  } catch { /* no dashboard running */ }

  // 12. Write update sentinel so the daemon can report what happened
  let commitHash = '';
  let commitDate = '';
  try {
    commitHash = execSync('git rev-parse --short HEAD', {
      cwd: PACKAGE_ROOT, encoding: 'utf-8',
    }).trim();
    commitDate = execSync('git log -1 --format=%ci HEAD', {
      cwd: PACKAGE_ROOT, encoding: 'utf-8',
    }).trim().slice(0, 10);
  } catch { /* best effort */ }

  if (options.restart || wasRunning) {
    const sentinelPath = path.join(BASE_DIR, '.restart-sentinel.json');
    const sentinel: import('../types.js').RestartSentinel = {
      previousPid: process.pid,
      restartedAt: localISO(),
      reason: 'update',
      updateDetails: {
        commitHash,
        commitDate,
        commitsBehind: commitsPulled,
        summary: pullSummary.split('\n').slice(0, 5).join('; '),
        modsReapplied: reconcileResult?.reapplied.length ?? 0,
        modsSuperseded: reconcileResult?.superseded.length ?? 0,
        modsNeedReconciliation: reconcileResult?.needsReconciliation.length ?? 0,
        modsFailed: reconcileResult?.failed.length ?? 0,
      },
    };
    writeFileSync(sentinelPath, JSON.stringify(sentinel, null, 2));

    // Ensure build output is fully flushed before spawning new process
    execSync('sync', { stdio: 'pipe' });
    console.log(`  ${S()} Restarting daemon...`);
    cmdLaunch({});
  }

  // 13. Show current version
  console.log();
  if (commitHash) {
    console.log(`  ${GREEN}Updated to ${commitHash} (${commitDate})${RESET}`);
  } else {
    console.log(`  ${GREEN}Update complete.${RESET}`);
  }

  console.log(`  ${DIM}Config backup: ${backupDir}${RESET}`);
  console.log();
}

// ── Cron commands ───────────────────────────────────────────────────

const cronCmd = program
  .command('cron')
  .description('Manage and run cron jobs');

cronCmd
  .command('list')
  .description('List all cron jobs from CRON.md')
  .action(() => {
    cmdCronList().catch((err: unknown) => {
      console.error('Error:', err);
      process.exit(1);
    });
  });

cronCmd
  .command('run <jobName>')
  .description('Run a specific cron job')
  .action((jobName: string) => {
    cmdCronRun(jobName).catch((err: unknown) => {
      console.error('Error:', err);
      process.exit(1);
    });
  });

cronCmd
  .command('run-due')
  .description('Run all jobs that are due now (for OS scheduler)')
  .action(() => {
    cmdCronRunDue().catch((err: unknown) => {
      console.error('Error:', err);
      process.exit(1);
    });
  });

cronCmd
  .command('runs [jobName]')
  .description('View run history (all jobs or a specific job)')
  .action((jobName?: string) => {
    cmdCronRuns(jobName).catch((err: unknown) => {
      console.error('Error:', err);
      process.exit(1);
    });
  });

cronCmd
  .command('add <name> <schedule> <prompt>')
  .description('Add a new cron job to CRON.md')
  .option('--tier <n>', 'Security tier (1-3)', '1')
  .action(async (name: string, schedule: string, prompt: string, opts: { tier?: string }) => {
    await cmdCronAdd(name, schedule, prompt, opts).catch((err: unknown) => {
      console.error('Error:', err);
      process.exit(1);
    });
  });

cronCmd
  .command('test <job>')
  .description('Dry-run a cron job immediately (does not log to history)')
  .action(async (job: string) => {
    await cmdCronTest(job).catch((err: unknown) => {
      console.error('Error:', err);
      process.exit(1);
    });
  });

cronCmd
  .command('install')
  .description('Install OS-level scheduler (launchd on macOS, crontab on Linux)')
  .action(cmdCronInstall);

cronCmd
  .command('uninstall')
  .description('Remove OS-level cron scheduler')
  .action(cmdCronUninstall);

// ── Workflow commands ────────────────────────────────────────────────

const workflowCmd = program
  .command('workflow')
  .description('Manage and run multi-step workflows');

workflowCmd
  .command('list')
  .description('List all workflows from Meta/Clementine/workflows/')
  .action(async () => {
    try {
      const { parseAllWorkflows } = await import('../agent/workflow-runner.js');
      const config = await import('../config.js');
      const workflows = parseAllWorkflows(config.WORKFLOWS_DIR);

      if (workflows.length === 0) {
        console.log('No workflows found. Add .md files to Meta/Clementine/workflows/.');
        return;
      }

      for (const wf of workflows) {
        const status = wf.enabled ? 'enabled' : 'disabled';
        const trigger = wf.trigger.schedule ? `schedule: ${wf.trigger.schedule}` : 'manual';
        console.log(`  ${wf.name} [${status}] — ${trigger}`);
        if (wf.description) console.log(`    ${wf.description}`);
        console.log(`    Steps: ${wf.steps.map(s => s.id).join(' → ')}`);
        if (Object.keys(wf.inputs).length > 0) {
          const inputStr = Object.entries(wf.inputs)
            .map(([k, v]) => `${k}${v.default ? `="${v.default}"` : ''}`)
            .join(', ');
          console.log(`    Inputs: ${inputStr}`);
        }
      }
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

workflowCmd
  .command('run <name>')
  .description('Run a workflow by name')
  .option('--input <key=val...>', 'Input overrides', (val: string, prev: string[]) => {
    prev.push(val);
    return prev;
  }, [] as string[])
  .action(async (name: string, opts: { input: string[] }) => {
    try {
      const { parseAllWorkflows, WorkflowRunner } = await import('../agent/workflow-runner.js');
      const config = await import('../config.js');
      const { PersonalAssistant } = await import('../agent/assistant.js');

      const workflows = parseAllWorkflows(config.WORKFLOWS_DIR);
      const wf = workflows.find(w => w.name === name);
      if (!wf) {
        const available = workflows.map(w => w.name).join(', ');
        console.error(`Workflow "${name}" not found. Available: ${available || 'none'}`);
        process.exit(1);
      }

      // Parse inputs
      const inputs: Record<string, string> = {};
      for (const kv of opts.input) {
        const eq = kv.indexOf('=');
        if (eq > 0) inputs[kv.slice(0, eq)] = kv.slice(eq + 1);
      }

      console.log(`Running workflow: ${name} (${wf.steps.length} steps)`);

      const assistant = new PersonalAssistant();
      const runner = new WorkflowRunner(assistant);

      const result = await runner.run(wf, inputs, (updates) => {
        // Print progress
        for (const u of updates) {
          if (u.status === 'running') console.log(`  [running] ${u.stepId}`);
          else if (u.status === 'done') console.log(`  [done]    ${u.stepId} (${Math.round((u.durationMs ?? 0) / 1000)}s)`);
          else if (u.status === 'failed') console.log(`  [failed]  ${u.stepId}`);
        }
      });

      console.log(`\nResult (${result.status}):\n${result.output}`);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

// ── Self-Improvement commands ────────────────────────────────────────

const siCmd = program
  .command('self-improve')
  .description('Manage Clementine self-improvement');

siCmd
  .command('status')
  .description('Show self-improvement state and baseline metrics')
  .action(async () => {
    try {
      const { SelfImproveLoop } = await import('../agent/self-improve.js');
      const { PersonalAssistant } = await import('../agent/assistant.js');
      const assistant = new PersonalAssistant();
      const loop = new SelfImproveLoop(assistant);
      const state = loop.loadState();
      const m = state.baselineMetrics;
      console.log(`Status: ${state.status}`);
      console.log(`Last run: ${state.lastRunAt || 'never'}`);
      console.log(`Total experiments: ${state.totalExperiments}`);
      console.log(`Pending approvals: ${state.pendingApprovals}`);
      console.log(`Baseline — Feedback: ${(m.feedbackPositiveRatio * 100).toFixed(0)}% positive, Cron: ${(m.cronSuccessRate * 100).toFixed(0)}% success, Quality: ${m.avgResponseQuality.toFixed(2)}`);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

siCmd
  .command('run')
  .description('Trigger a self-improvement cycle')
  .action(async () => {
    try {
      const { SelfImproveLoop } = await import('../agent/self-improve.js');
      const { PersonalAssistant } = await import('../agent/assistant.js');
      const assistant = new PersonalAssistant();
      const loop = new SelfImproveLoop(assistant);

      console.log('Starting self-improvement cycle...');
      const state = await loop.run(async (experiment) => {
        console.log(`  Proposal: ${experiment.area} | "${experiment.hypothesis.slice(0, 60)}" | ${(experiment.score * 10).toFixed(1)}/10`);
      });
      console.log(`\nCompleted: ${state.status}, ${state.currentIteration} iterations, ${state.pendingApprovals} pending approvals`);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

siCmd
  .command('history')
  .description('Show experiment history')
  .option('-n, --limit <n>', 'Number of entries to show', '10')
  .action(async (opts: { limit: string }) => {
    try {
      const { SelfImproveLoop } = await import('../agent/self-improve.js');
      const { PersonalAssistant } = await import('../agent/assistant.js');
      const assistant = new PersonalAssistant();
      const loop = new SelfImproveLoop(assistant);
      const limit = parseInt(opts.limit, 10) || 10;
      const log = loop.loadExperimentLog().slice(-limit).reverse();

      if (log.length === 0) {
        console.log('No experiment history yet.');
        return;
      }

      for (const e of log) {
        const status = e.accepted
          ? (e.approvalStatus === 'approved' ? '✅ approved' : '⏳ pending')
          : '❌ rejected';
        console.log(`#${e.iteration} | ${e.area} | ${(e.score * 10).toFixed(1)}/10 | ${status}`);
        console.log(`  ${e.hypothesis.slice(0, 80)}`);
      }
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

siCmd
  .command('apply <id>')
  .description('Approve and apply a pending change')
  .action(async (id: string) => {
    try {
      const { SelfImproveLoop } = await import('../agent/self-improve.js');
      const { PersonalAssistant } = await import('../agent/assistant.js');
      const assistant = new PersonalAssistant();
      const loop = new SelfImproveLoop(assistant);
      const result = await loop.applyApprovedChange(id);
      console.log(result);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

// ── Heartbeat command ───────────────────────────────────────────────

program
  .command('heartbeat')
  .description('Run a one-shot heartbeat check')
  .action(() => {
    cmdHeartbeat().catch((err: unknown) => {
      console.error('Error:', err);
      process.exit(1);
    });
  });

// ── OS scheduler install/uninstall ──────────────────────────────────

const CRON_LAUNCHD_LABEL = `com.${getAssistantName().toLowerCase()}.cron`;

function getCronPlistPath(): string {
  const home = process.env.HOME ?? '';
  return path.join(home, 'Library', 'LaunchAgents', `${CRON_LAUNCHD_LABEL}.plist`);
}

/**
 * Build a PATH string for launchd plists that includes all directories needed
 * to find node, claude CLI, and standard system binaries.
 */
function buildLaunchdPath(): string {
  const dirs = new Set<string>();

  // Include the directory containing the current node binary (nvm, homebrew, etc.)
  dirs.add(path.dirname(process.execPath));

  // Include directories where claude CLI might live
  const home = process.env.HOME ?? '';
  if (home) {
    dirs.add(path.join(home, '.local', 'bin'));  // common claude CLI location
  }

  // Standard system paths
  dirs.add('/usr/local/bin');
  dirs.add('/opt/homebrew/bin');
  dirs.add('/usr/bin');
  dirs.add('/bin');

  return [...dirs].join(':');
}

function cmdCronInstall(): void {
  const cliEntry = path.join(PACKAGE_ROOT, 'dist', 'cli', 'index.js');
  const nodePath = process.execPath;
  const logDir = path.join(BASE_DIR, 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  const cronLog = path.join(logDir, 'cron.log');

  if (process.platform === 'darwin') {
    // macOS: launchd plist
    const plistPath = getCronPlistPath();
    const plistDir = path.dirname(plistPath);
    if (!existsSync(plistDir)) {
      mkdirSync(plistDir, { recursive: true });
    }

    // Unload existing plist if already installed (idempotent reinstall)
    if (existsSync(plistPath)) {
      try {
        execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' });
      } catch {
        // not loaded — fine
      }
    }

    // Generate StartCalendarInterval entries for every 5th minute (wall-clock aligned)
    const calendarEntries = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
      .map((m) => `    <dict>\n      <key>Minute</key>\n      <integer>${m}</integer>\n    </dict>`)
      .join('\n');

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${CRON_LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${cliEntry}</string>
    <string>cron</string>
    <string>run-due</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${calendarEntries}
  </array>
  <key>StandardOutPath</key>
  <string>${cronLog}</string>
  <key>StandardErrorPath</key>
  <string>${cronLog}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${buildLaunchdPath()}</string>
    <key>CLEMENTINE_HOME</key>
    <string>${BASE_DIR}</string>
  </dict>
</dict>
</plist>`;

    writeFileSync(plistPath, plist);
    try {
      execSync(`launchctl load "${plistPath}"`);
      console.log(`  Installed cron scheduler: ${CRON_LAUNCHD_LABEL}`);
      console.log(`  Runs every 5 minutes via launchd`);
      console.log(`  Plist: ${plistPath}`);
      console.log(`  Logs:  ${cronLog}`);
      console.log();
      console.log(`  Note: This is a fallback for when the daemon is not running.`);
      console.log(`  If the daemon is active, its built-in scheduler handles cron jobs`);
      console.log(`  and the standalone runner will skip automatically.`);
    } catch (err) {
      console.error(`  Failed to load LaunchAgent: ${err}`);
    }
  } else {
    // Linux: crontab entry
    const marker = `# clementine-cron-runner`;
    const entry = `*/5 * * * * ${nodePath} ${cliEntry} cron run-due >> ${cronLog} 2>&1 ${marker}`;

    let existing = '';
    try {
      existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' });
    } catch {
      // no existing crontab
    }

    if (existing.includes(marker)) {
      // Replace existing entry
      const lines = existing.split('\n').filter((l) => !l.includes(marker));
      lines.push(entry);
      const tempFile = path.join(os.tmpdir(), 'clementine-crontab.tmp');
      writeFileSync(tempFile, lines.join('\n') + '\n');
      execSync(`crontab "${tempFile}"`);
      unlinkSync(tempFile);
      console.log('  Updated existing crontab entry.');
    } else {
      const tempFile = path.join(os.tmpdir(), 'clementine-crontab.tmp');
      writeFileSync(tempFile, existing.trimEnd() + '\n' + entry + '\n');
      execSync(`crontab "${tempFile}"`);
      unlinkSync(tempFile);
      console.log('  Installed crontab entry.');
    }

    console.log(`  Runs every 5 minutes`);
    console.log(`  Logs: ${cronLog}`);
  }
}

function cmdCronUninstall(): void {
  if (process.platform === 'darwin') {
    const plistPath = getCronPlistPath();
    if (existsSync(plistPath)) {
      try {
        execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' });
      } catch {
        // not loaded
      }
      unlinkSync(plistPath);
      console.log(`  Uninstalled cron scheduler: ${CRON_LAUNCHD_LABEL}`);
    } else {
      console.log('  Cron scheduler not installed.');
    }
  } else {
    const marker = `# clementine-cron-runner`;
    let existing = '';
    try {
      existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' });
    } catch {
      console.log('  No crontab found.');
      return;
    }

    if (!existing.includes(marker)) {
      console.log('  Cron scheduler not installed in crontab.');
      return;
    }

    const lines = existing.split('\n').filter((l) => !l.includes(marker));
    const tempFile = path.join(os.tmpdir(), 'clementine-crontab.tmp');
    writeFileSync(tempFile, lines.join('\n'));
    execSync(`crontab "${tempFile}"`);
    unlinkSync(tempFile);
    console.log('  Removed crontab entry.');
  }
}

// ── Logs command ────────────────────────────────────────────────────

function formatLogLine(line: string): string {
  try {
    const entry = JSON.parse(line);
    const ts = typeof entry.time === 'number'
      ? new Date(entry.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : String(entry.time ?? '').slice(11, 19);

    const level = entry.level ?? 30;
    const levelName = level <= 20 ? 'DEBUG' : level <= 30 ? 'INFO' : level <= 40 ? 'WARN' : 'ERROR';
    const levelColors: Record<string, string> = {
      DEBUG: '\x1b[0;90m', INFO: '\x1b[0;32m', WARN: '\x1b[1;33m', ERROR: '\x1b[0;31m',
    };
    const color = levelColors[levelName] ?? '';
    const RESET = '\x1b[0m';
    const DIM = '\x1b[0;90m';
    const component = entry.name ? entry.name.replace('clementine.', '') : '';
    const msg = entry.msg ?? '';
    return `${DIM}${ts}${RESET} ${color}${levelName.padEnd(5)}${RESET} ${DIM}[${component}]${RESET} ${msg}`;
  } catch {
    return line;
  }
}

function cmdLogs(opts: { follow?: boolean; lines?: string; filter?: string; cron?: boolean; json?: boolean }): void {
  const logDir = path.join(BASE_DIR, 'logs');
  const logFile = opts.cron
    ? path.join(logDir, 'cron.log')
    : path.join(logDir, 'clementine.log');

  if (!existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`);
    process.exit(1);
  }

  const numLines = parseInt(opts.lines ?? '50', 10) || 50;
  const filter = opts.filter?.toLowerCase();

  // Read last N lines
  const content = readFileSync(logFile, 'utf-8');
  let lines = content.split('\n').filter(Boolean);
  lines = lines.slice(-numLines);

  // Apply component filter
  if (filter) {
    lines = lines.filter(line => {
      try {
        const entry = JSON.parse(line);
        const name = String(entry.name ?? '').toLowerCase();
        return name.includes(filter);
      } catch {
        return line.toLowerCase().includes(filter);
      }
    });
  }

  // Output
  for (const line of lines) {
    if (opts.json) {
      console.log(line);
    } else {
      console.log(formatLogLine(line));
    }
  }

  // Follow mode
  if (opts.follow) {
    let lastSize = statSync(logFile).size;

    const poll = setInterval(() => {
      try {
        const currentSize = statSync(logFile).size;
        if (currentSize < lastSize) {
          // Log rotation — reset
          lastSize = 0;
        }
        if (currentSize === lastSize) return;

        // Read new bytes
        const fd = openSync(logFile, 'r');
        const buf = Buffer.alloc(currentSize - lastSize);
        readSync(fd, buf, 0, buf.length, lastSize);
        closeSync(fd);
        lastSize = currentSize;

        const newLines = buf.toString('utf-8').split('\n').filter(Boolean);
        for (const line of newLines) {
          if (filter) {
            try {
              const entry = JSON.parse(line);
              const name = String(entry.name ?? '').toLowerCase();
              if (!name.includes(filter)) continue;
            } catch {
              if (!line.toLowerCase().includes(filter)) continue;
            }
          }
          if (opts.json) {
            console.log(line);
          } else {
            console.log(formatLogLine(line));
          }
        }
      } catch {
        // File may be temporarily unavailable during rotation
      }
    }, 500);

    process.on('SIGINT', () => {
      clearInterval(poll);
      process.exit(0);
    });
  }
}

program
  .command('logs')
  .description('Tail and filter daemon logs')
  .option('-f, --follow', 'Follow mode (tail -f)')
  .option('-n, --lines <n>', 'Number of lines (default 50)', '50')
  .option('--filter <component>', 'Filter by component (e.g. discord, cron, gateway)')
  .option('--cron', 'Show cron log instead of daemon log')
  .option('--json', 'Raw JSON output')
  .action(cmdLogs);

program.parse();
