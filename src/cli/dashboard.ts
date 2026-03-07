/**
 * Clementine Command Center — Local web dashboard.
 *
 * Serves an inline HTML SPA with JSON API from Express on localhost.
 * Zero extra deps — uses express, gray-matter, better-sqlite3 (all already installed).
 */

import express from 'express';
import { spawn, execSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
  readdirSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = process.env.CLEMENTINE_HOME || path.join(os.homedir(), '.clementine');
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const DIST_ENTRY = path.join(PACKAGE_ROOT, 'dist', 'cli', 'index.js');
const ENV_PATH = path.join(BASE_DIR, '.env');
const VAULT_DIR = path.join(BASE_DIR, 'vault');

// ── Helpers (mirrored from index.ts) ─────────────────────────────────

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

function getLaunchdLabel(): string {
  return `com.${getAssistantName().toLowerCase()}.assistant`;
}

function getLaunchdPlistPath(): string {
  const home = process.env.HOME ?? '';
  return path.join(home, 'Library', 'LaunchAgents', `${getLaunchdLabel()}.plist`);
}

// ── Data readers ─────────────────────────────────────────────────────

function getStatus(): Record<string, unknown> {
  const pid = readPid();
  const alive = pid ? isProcessAlive(pid) : false;
  const name = getAssistantName();

  let uptime = '';
  if (pid && alive) {
    try {
      const { mtimeMs } = statSync(getPidFilePath());
      const uptimeMs = Date.now() - mtimeMs;
      const hours = Math.floor(uptimeMs / 3600000);
      const minutes = Math.floor((uptimeMs % 3600000) / 60000);
      uptime = `${hours}h ${minutes}m`;
    } catch { /* ignore */ }
  }

  const channels: string[] = [];
  if (existsSync(ENV_PATH)) {
    const env = readFileSync(ENV_PATH, 'utf-8');
    if (/^DISCORD_TOKEN=.+$/m.test(env)) channels.push('Discord');
    if (/^SLACK_BOT_TOKEN=.+$/m.test(env) && /^SLACK_APP_TOKEN=.+$/m.test(env)) channels.push('Slack');
    if (/^TELEGRAM_BOT_TOKEN=.+$/m.test(env)) channels.push('Telegram');
    if (/^TWILIO_ACCOUNT_SID=.+$/m.test(env)) channels.push('WhatsApp');
    if (/^WEBHOOK_ENABLED=true$/m.test(env)) channels.push('Webhook');
  }

  let launchAgent: string | null = null;
  if (process.platform === 'darwin') {
    const plist = getLaunchdPlistPath();
    if (existsSync(plist)) {
      try {
        execSync(`launchctl list ${getLaunchdLabel()}`, { stdio: 'pipe' });
        launchAgent = 'loaded';
      } catch {
        launchAgent = 'installed';
      }
    } else {
      launchAgent = 'not installed';
    }
  }

  return { name, pid, alive, uptime, channels, launchAgent };
}

function getSessions(): Record<string, unknown> {
  const sessionsFile = path.join(BASE_DIR, '.sessions.json');
  if (!existsSync(sessionsFile)) return {};
  try {
    return JSON.parse(readFileSync(sessionsFile, 'utf-8'));
  } catch {
    return {};
  }
}

function getCronJobs(): Record<string, unknown> {
  const cronFile = path.join(VAULT_DIR, '00-System', 'CRON.md');
  let jobs: Array<Record<string, unknown>> = [];

  if (existsSync(cronFile)) {
    try {
      const raw = readFileSync(cronFile, 'utf-8');
      const parsed = matter(raw);
      jobs = (parsed.data.jobs ?? []) as Array<Record<string, unknown>>;
    } catch { /* ignore */ }
  }

  // Attach recent run history
  const runsDir = path.join(BASE_DIR, 'cron', 'runs');
  const enriched = jobs.map((job) => {
    const name = String(job.name ?? '');
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const logPath = path.join(runsDir, `${safe}.jsonl`);
    let recentRuns: unknown[] = [];
    if (existsSync(logPath)) {
      try {
        const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
        recentRuns = lines.slice(-10).map((l) => JSON.parse(l)).reverse();
      } catch { /* ignore */ }
    }
    return { ...job, recentRuns };
  });

  return { jobs: enriched };
}

function getTimers(): unknown[] {
  const timersFile = path.join(BASE_DIR, '.timers.json');
  if (!existsSync(timersFile)) return [];
  try {
    return JSON.parse(readFileSync(timersFile, 'utf-8'));
  } catch {
    return [];
  }
}

function getHeartbeat(): Record<string, unknown> {
  const hbFile = path.join(BASE_DIR, '.heartbeat_state.json');
  if (!existsSync(hbFile)) return {};
  try {
    return JSON.parse(readFileSync(hbFile, 'utf-8'));
  } catch {
    return {};
  }
}

async function getMemory(): Promise<Record<string, unknown>> {
  const memoryFile = path.join(VAULT_DIR, '00-System', 'MEMORY.md');
  let content = '';
  if (existsSync(memoryFile)) {
    try { content = readFileSync(memoryFile, 'utf-8'); } catch { /* ignore */ }
  }

  const dbPath = path.join(VAULT_DIR, '.memory.db');
  let dbStats: Record<string, unknown> = {};
  if (existsSync(dbPath)) {
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath, { readonly: true });
      const chunkCount = (db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number }).count;
      const fileCount = (db.prepare('SELECT COUNT(DISTINCT source_file) as count FROM chunks').get() as { count: number }).count;
      const { size } = statSync(dbPath);
      dbStats = { chunks: chunkCount, files: fileCount, sizeBytes: size };
      db.close();
    } catch { /* ignore */ }
  }

  return { content: content.slice(0, 5000), dbStats };
}

function getLogs(lines: number): string {
  const logFile = path.join(BASE_DIR, 'logs', 'clementine.log');
  if (!existsSync(logFile)) return '';
  try {
    const content = readFileSync(logFile, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  } catch {
    return '';
  }
}

// ── Express app ──────────────────────────────────────────────────────

export async function cmdDashboard(opts: { port?: string }): Promise<void> {
  const port = parseInt(opts.port ?? '3030', 10);
  const app = express();
  app.use(express.json());

  // ── GET routes ───────────────────────────────────────────────────

  app.get('/', (_req, res) => {
    res.type('html').send(getDashboardHTML());
  });

  app.get('/api/status', (_req, res) => {
    res.json(getStatus());
  });

  app.get('/api/sessions', (_req, res) => {
    res.json(getSessions());
  });

  app.get('/api/cron', (_req, res) => {
    res.json(getCronJobs());
  });

  app.get('/api/timers', (_req, res) => {
    res.json(getTimers());
  });

  app.get('/api/heartbeat', (_req, res) => {
    res.json(getHeartbeat());
  });

  app.get('/api/memory', async (_req, res) => {
    res.json(await getMemory());
  });

  app.get('/api/logs', (req, res) => {
    const lines = parseInt(String(req.query.lines ?? '200'), 10);
    res.json({ content: getLogs(lines) });
  });

  // ── POST routes ──────────────────────────────────────────────────

  app.post('/api/cron/run/:job', (req, res) => {
    const jobName = req.params.job;
    try {
      const child = spawn('node', [DIST_ENTRY, 'cron', 'run', jobName], {
        detached: true,
        stdio: 'ignore',
        cwd: BASE_DIR,
        env: { ...process.env, CLEMENTINE_HOME: BASE_DIR },
      });
      child.unref();
      res.json({ ok: true, message: `Triggered cron job: ${jobName}` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/restart', (_req, res) => {
    const pid = readPid();
    if (!pid || !isProcessAlive(pid)) {
      res.status(400).json({ error: 'Daemon is not running' });
      return;
    }
    try {
      process.kill(pid, 'SIGUSR1');
      res.json({ ok: true, message: 'Sent SIGUSR1 (restart signal)' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/stop', (_req, res) => {
    const pid = readPid();
    if (!pid || !isProcessAlive(pid)) {
      res.status(400).json({ error: 'Daemon is not running' });
      return;
    }
    try {
      // Unload LaunchAgent first to prevent respawn
      if (process.platform === 'darwin') {
        const plist = getLaunchdPlistPath();
        if (existsSync(plist)) {
          try { execSync(`launchctl unload "${plist}"`, { stdio: 'pipe' }); } catch { /* ignore */ }
        }
      }
      process.kill(pid, 'SIGTERM');
      res.json({ ok: true, message: `Sent SIGTERM to PID ${pid}` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/sessions/:key/clear', (req, res) => {
    const key = req.params.key;
    const sessionsFile = path.join(BASE_DIR, '.sessions.json');
    try {
      if (!existsSync(sessionsFile)) {
        res.status(404).json({ error: 'No sessions file' });
        return;
      }
      const sessions = JSON.parse(readFileSync(sessionsFile, 'utf-8'));
      if (!(key in sessions)) {
        res.status(404).json({ error: `Session "${key}" not found` });
        return;
      }
      delete sessions[key];
      writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
      res.json({ ok: true, message: `Cleared session: ${key}` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/timers/:id/cancel', (req, res) => {
    const timerId = req.params.id;
    const timersFile = path.join(BASE_DIR, '.timers.json');
    try {
      if (!existsSync(timersFile)) {
        res.status(404).json({ error: 'No timers file' });
        return;
      }
      const timers = JSON.parse(readFileSync(timersFile, 'utf-8')) as unknown[];
      const idx = (timers as Array<Record<string, unknown>>).findIndex(
        (t) => String(t.id) === timerId,
      );
      if (idx === -1) {
        res.status(404).json({ error: `Timer "${timerId}" not found` });
        return;
      }
      timers.splice(idx, 1);
      writeFileSync(timersFile, JSON.stringify(timers, null, 2));
      res.json({ ok: true, message: `Cancelled timer: ${timerId}` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Start server (auto-increment port if taken) ──────────────────

  const maxAttempts = 10;
  let actualPort = port;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const server = app.listen(actualPort, '127.0.0.1');
        server.once('listening', () => {
          const name = getAssistantName();
          console.log();
          console.log(`  ${name} Command Center`);
          console.log(`  http://localhost:${actualPort}`);
          if (actualPort !== port) {
            console.log(`  (port ${port} was in use)`);
          }
          console.log();
          console.log('  Press Ctrl+C to stop');
          console.log();
          resolve();
        });
        server.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            server.close();
            reject(err);
          } else {
            reject(err);
          }
        });
      });
      break; // successfully listening
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        actualPort++;
        if (attempt === maxAttempts - 1) {
          console.error(`  Could not find an open port (tried ${port}-${actualPort}).`);
          process.exit(1);
        }
      } else {
        throw err;
      }
    }
  }

  // Try to open in browser
  try {
    if (process.platform === 'darwin') {
      execSync(`open http://localhost:${actualPort}`, { stdio: 'ignore' });
    }
  } catch { /* ignore */ }

  // Keep alive
  await new Promise<void>(() => {});
}

// ── Inline HTML Dashboard ────────────────────────────────────────────

function getDashboardHTML(): string {
  const name = getAssistantName();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} Command Center</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
  }
  header {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  header h1 {
    font-size: 18px;
    font-weight: 600;
    color: #f0f6fc;
  }
  header h1 span { color: #f78166; }
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    color: #8b949e;
  }
  .refresh-indicator {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #238636;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 16px;
  }
  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    overflow: hidden;
  }
  .card-header {
    padding: 12px 16px;
    border-bottom: 1px solid #30363d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    color: #f0f6fc;
  }
  .card-body {
    padding: 16px;
    font-size: 13px;
    line-height: 1.6;
  }
  .card-body.logs {
    max-height: 400px;
    overflow-y: auto;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-all;
    color: #8b949e;
    padding: 12px;
  }
  .dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .dot-green { background: #238636; }
  .dot-yellow { background: #d29922; }
  .dot-red { background: #da3633; }
  .dot-gray { background: #484f58; }
  .kv-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid #21262d;
  }
  .kv-row:last-child { border-bottom: none; }
  .kv-key { color: #8b949e; }
  .kv-val { color: #c9d1d9; font-weight: 500; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }
  .badge-green { background: rgba(35,134,54,0.2); color: #3fb950; }
  .badge-red { background: rgba(218,54,51,0.2); color: #f85149; }
  .badge-yellow { background: rgba(210,153,34,0.2); color: #d29922; }
  .badge-gray { background: rgba(72,79,88,0.2); color: #8b949e; }
  button, .btn {
    background: #21262d;
    color: #c9d1d9;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }
  button:hover, .btn:hover {
    background: #30363d;
  }
  .btn-danger {
    border-color: #da3633;
    color: #f85149;
  }
  .btn-danger:hover {
    background: rgba(218,54,51,0.2);
  }
  .btn-primary {
    border-color: #238636;
    color: #3fb950;
  }
  .btn-primary:hover {
    background: rgba(35,134,54,0.2);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    padding: 8px;
    border-bottom: 1px solid #30363d;
    color: #8b949e;
    font-weight: 500;
  }
  td {
    padding: 8px;
    border-bottom: 1px solid #21262d;
  }
  .empty-state {
    text-align: center;
    padding: 24px;
    color: #484f58;
    font-style: italic;
  }
  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000;
  }
  .toast {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 8px;
    font-size: 13px;
    animation: slideIn 0.3s ease;
    max-width: 350px;
  }
  .toast.success { border-color: #238636; }
  .toast.error { border-color: #da3633; }
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .memory-preview {
    max-height: 300px;
    overflow-y: auto;
    white-space: pre-wrap;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    color: #8b949e;
    background: #0d1117;
    border-radius: 6px;
    padding: 12px;
    margin-top: 8px;
  }
  .full-width {
    grid-column: 1 / -1;
  }
</style>
</head>
<body>
<header>
  <h1><span>${name}</span> Command Center</h1>
  <div class="header-right">
    <div class="refresh-indicator"></div>
    <span>Auto-refresh 5s</span>
    <span id="last-update"></span>
  </div>
</header>
<main>
  <!-- Daemon Status -->
  <div class="card">
    <div class="card-header">
      <span>Daemon Status</span>
      <div>
        <button class="btn-primary" onclick="apiPost('/api/restart')">Restart</button>
        <button class="btn-danger" onclick="apiPost('/api/stop')">Stop</button>
      </div>
    </div>
    <div class="card-body" id="panel-status">
      <div class="empty-state">Loading...</div>
    </div>
  </div>

  <!-- Active Sessions -->
  <div class="card">
    <div class="card-header">
      <span>Active Sessions</span>
    </div>
    <div class="card-body" id="panel-sessions">
      <div class="empty-state">Loading...</div>
    </div>
  </div>

  <!-- Cron Jobs -->
  <div class="card">
    <div class="card-header">
      <span>Cron Jobs</span>
    </div>
    <div class="card-body" id="panel-cron">
      <div class="empty-state">Loading...</div>
    </div>
  </div>

  <!-- Heartbeat -->
  <div class="card">
    <div class="card-header">
      <span>Heartbeat</span>
    </div>
    <div class="card-body" id="panel-heartbeat">
      <div class="empty-state">Loading...</div>
    </div>
  </div>

  <!-- Pending Timers -->
  <div class="card">
    <div class="card-header">
      <span>Pending Timers</span>
    </div>
    <div class="card-body" id="panel-timers">
      <div class="empty-state">Loading...</div>
    </div>
  </div>

  <!-- Memory -->
  <div class="card">
    <div class="card-header">
      <span>Memory</span>
    </div>
    <div class="card-body" id="panel-memory">
      <div class="empty-state">Loading...</div>
    </div>
  </div>

  <!-- LaunchAgent -->
  <div class="card" id="card-launchagent" style="display:none">
    <div class="card-header">
      <span>LaunchAgent (macOS)</span>
    </div>
    <div class="card-body" id="panel-launchagent">
      <div class="empty-state">Loading...</div>
    </div>
  </div>

  <!-- Logs -->
  <div class="card full-width">
    <div class="card-header">
      <span>Logs</span>
      <button onclick="refreshLogs()">Refresh</button>
    </div>
    <div class="card-body logs" id="panel-logs">
      <div class="empty-state">Loading...</div>
    </div>
  </div>
</main>

<div class="toast-container" id="toasts"></div>

<script>
function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return Math.round(ms/1000) + 's ago';
  if (ms < 3600000) return Math.round(ms/60000) + 'm ago';
  if (ms < 86400000) return Math.round(ms/3600000) + 'h ago';
  return Math.round(ms/86400000) + 'd ago';
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function apiPost(url) {
  try {
    const r = await fetch(url, { method: 'POST' });
    const d = await r.json();
    if (d.ok) toast(d.message, 'success');
    else toast(d.error || 'Error', 'error');
    setTimeout(refreshAll, 1000);
  } catch(e) { toast(String(e), 'error'); }
}

async function apiDelete(url) {
  try {
    const r = await fetch(url, { method: 'POST' });
    const d = await r.json();
    if (d.ok) toast(d.message, 'success');
    else toast(d.error || 'Error', 'error');
    setTimeout(refreshAll, 500);
  } catch(e) { toast(String(e), 'error'); }
}

async function refreshStatus() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    const dot = d.alive ? 'dot-green' : 'dot-red';
    const status = d.alive ? 'Running' : 'Stopped';
    let html = '<div class="kv-row"><span class="kv-key">Status</span>'
      + '<span class="kv-val"><span class="dot ' + dot + '"></span>' + esc(status) + '</span></div>';
    if (d.pid) html += '<div class="kv-row"><span class="kv-key">PID</span><span class="kv-val">' + esc(d.pid) + '</span></div>';
    if (d.uptime) html += '<div class="kv-row"><span class="kv-key">Uptime</span><span class="kv-val">' + esc(d.uptime) + '</span></div>';
    if (d.channels && d.channels.length > 0) {
      html += '<div class="kv-row"><span class="kv-key">Channels</span><span class="kv-val">'
        + d.channels.map(function(c) { return '<span class="badge badge-green">' + esc(c) + '</span> '; }).join('')
        + '</span></div>';
    }
    if (d.launchAgent) {
      const laCard = document.getElementById('card-launchagent');
      laCard.style.display = '';
      const laDot = d.launchAgent === 'loaded' ? 'dot-green' : d.launchAgent === 'installed' ? 'dot-yellow' : 'dot-gray';
      document.getElementById('panel-launchagent').innerHTML =
        '<div class="kv-row"><span class="kv-key">Status</span>'
        + '<span class="kv-val"><span class="dot ' + laDot + '"></span>' + esc(d.launchAgent) + '</span></div>';
    }
    document.getElementById('panel-status').innerHTML = html;
  } catch(e) { document.getElementById('panel-status').innerHTML = '<div class="empty-state">Error loading</div>'; }
}

async function refreshSessions() {
  try {
    const r = await fetch('/api/sessions');
    const d = await r.json();
    const keys = Object.keys(d);
    if (keys.length === 0) {
      document.getElementById('panel-sessions').innerHTML = '<div class="empty-state">No active sessions</div>';
      return;
    }
    let html = '<table><tr><th>Session</th><th>Exchanges</th><th>Last Active</th><th></th></tr>';
    for (const key of keys) {
      const s = d[key];
      html += '<tr><td>' + esc(key) + '</td>'
        + '<td>' + esc(s.exchanges || 0) + '</td>'
        + '<td>' + esc(timeAgo(s.timestamp)) + '</td>'
        + '<td><button class="btn-danger" onclick="apiDelete(\\'/api/sessions/' + encodeURIComponent(key) + '/clear\\')">Clear</button></td></tr>';
    }
    html += '</table>';
    document.getElementById('panel-sessions').innerHTML = html;
  } catch(e) { document.getElementById('panel-sessions').innerHTML = '<div class="empty-state">Error loading</div>'; }
}

async function refreshCron() {
  try {
    const r = await fetch('/api/cron');
    const d = await r.json();
    if (!d.jobs || d.jobs.length === 0) {
      document.getElementById('panel-cron').innerHTML = '<div class="empty-state">No cron jobs defined</div>';
      return;
    }
    let html = '<table><tr><th>Job</th><th>Schedule</th><th>Status</th><th>Last Run</th><th></th></tr>';
    for (const job of d.jobs) {
      const enabled = job.enabled !== false;
      const statusBadge = enabled
        ? '<span class="badge badge-green">enabled</span>'
        : '<span class="badge badge-gray">disabled</span>';
      let lastRun = 'never';
      let lastStatus = '';
      if (job.recentRuns && job.recentRuns.length > 0) {
        const lr = job.recentRuns[0];
        lastRun = timeAgo(lr.finishedAt);
        lastStatus = lr.status === 'ok'
          ? ' <span class="badge badge-green">ok</span>'
          : ' <span class="badge badge-red">' + esc(lr.status) + '</span>';
      }
      html += '<tr><td>' + esc(job.name) + '</td>'
        + '<td><code>' + esc(job.schedule) + '</code></td>'
        + '<td>' + statusBadge + '</td>'
        + '<td>' + esc(lastRun) + lastStatus + '</td>'
        + '<td><button class="btn-primary" onclick="apiPost(\\'/api/cron/run/' + encodeURIComponent(job.name) + '\\')">Run</button></td></tr>';
    }
    html += '</table>';
    document.getElementById('panel-cron').innerHTML = html;
  } catch(e) { document.getElementById('panel-cron').innerHTML = '<div class="empty-state">Error loading</div>'; }
}

async function refreshTimers() {
  try {
    const r = await fetch('/api/timers');
    const d = await r.json();
    if (!Array.isArray(d) || d.length === 0) {
      document.getElementById('panel-timers').innerHTML = '<div class="empty-state">No pending timers</div>';
      return;
    }
    let html = '<table><tr><th>ID</th><th>Fires At</th><th>Message</th><th></th></tr>';
    for (const t of d) {
      html += '<tr><td>' + esc(t.id || '?') + '</td>'
        + '<td>' + esc(t.fireAt || t.fire_at || t.time || '') + '</td>'
        + '<td>' + esc((t.message || t.prompt || '').slice(0, 80)) + '</td>'
        + '<td><button class="btn-danger" onclick="apiDelete(\\'/api/timers/' + encodeURIComponent(t.id) + '/cancel\\')">Cancel</button></td></tr>';
    }
    html += '</table>';
    document.getElementById('panel-timers').innerHTML = html;
  } catch(e) { document.getElementById('panel-timers').innerHTML = '<div class="empty-state">Error loading</div>'; }
}

async function refreshHeartbeat() {
  try {
    const r = await fetch('/api/heartbeat');
    const d = await r.json();
    if (!d.timestamp) {
      document.getElementById('panel-heartbeat').innerHTML = '<div class="empty-state">No heartbeat data</div>';
      return;
    }
    let html = '<div class="kv-row"><span class="kv-key">Last Beat</span><span class="kv-val">' + esc(timeAgo(d.timestamp)) + '</span></div>';
    html += '<div class="kv-row"><span class="kv-key">Fingerprint</span><span class="kv-val"><code>' + esc((d.fingerprint||'').slice(0,12)) + '</code></span></div>';
    if (d.details) {
      for (const [k,v] of Object.entries(d.details)) {
        html += '<div class="kv-row"><span class="kv-key">' + esc(k) + '</span><span class="kv-val">' + esc(v) + '</span></div>';
      }
    }
    document.getElementById('panel-heartbeat').innerHTML = html;
  } catch(e) { document.getElementById('panel-heartbeat').innerHTML = '<div class="empty-state">Error loading</div>'; }
}

async function refreshMemory() {
  try {
    const r = await fetch('/api/memory');
    const d = await r.json();
    let html = '';
    if (d.dbStats && d.dbStats.chunks != null) {
      html += '<div class="kv-row"><span class="kv-key">DB Chunks</span><span class="kv-val">' + esc(d.dbStats.chunks) + '</span></div>';
      html += '<div class="kv-row"><span class="kv-key">Indexed Files</span><span class="kv-val">' + esc(d.dbStats.files) + '</span></div>';
      html += '<div class="kv-row"><span class="kv-key">DB Size</span><span class="kv-val">' + esc(Math.round((d.dbStats.sizeBytes||0)/1024) + ' KB') + '</span></div>';
    }
    if (d.content) {
      html += '<div class="memory-preview">' + esc(d.content) + '</div>';
    } else {
      html += '<div class="empty-state">No MEMORY.md found</div>';
    }
    document.getElementById('panel-memory').innerHTML = html;
  } catch(e) { document.getElementById('panel-memory').innerHTML = '<div class="empty-state">Error loading</div>'; }
}

async function refreshLogs() {
  try {
    const r = await fetch('/api/logs?lines=200');
    const d = await r.json();
    const el = document.getElementById('panel-logs');
    if (!d.content) {
      el.innerHTML = '<div class="empty-state">No log file found</div>';
      return;
    }
    el.textContent = d.content;
    el.scrollTop = el.scrollHeight;
  } catch(e) { document.getElementById('panel-logs').innerHTML = '<div class="empty-state">Error loading</div>'; }
}

function refreshAll() {
  refreshStatus();
  refreshSessions();
  refreshCron();
  refreshTimers();
  refreshHeartbeat();
  refreshMemory();
  refreshLogs();
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
}

refreshAll();
setInterval(refreshAll, 5000);
</script>
</body>
</html>`;
}
