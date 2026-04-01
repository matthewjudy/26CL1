/**
 * Clementine CLI — Interactive REPL chat session.
 *
 * Usage: clementine chat [--model sonnet] [--project myapp] [--profile researcher]
 *        clementine chat --name "project-review"  (named session, resumable)
 *        clementine chat --list                   (list active named sessions)
 *
 * Lazy-initializes a gateway instance and streams responses to stdout.
 * Bang commands: !model, !project, !clear, !name, !sessions, !help, !q, !d prefixes.
 */

import readline from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { Gateway } from '../gateway/router.js';

const BASE_DIR = process.env.CLEMENTINE_HOME || path.join(os.homedir(), '.clementine');
const ACTIVITY_LOG = path.join(BASE_DIR, '.activity-log.jsonl');
const SESSIONS_FILE = path.join(BASE_DIR, '.sessions.json');

// ── ANSI helpers ─────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[0;90m';
const CYAN = '\x1b[0;36m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const BLUE = '\x1b[0;34m';
const RESET = '\x1b[0m';

/** Simple ANSI markdown renderer for terminal output. */
function renderMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`)
    // Inline code
    .replace(/`([^`]+)`/g, `${DIM}$1${RESET}`)
    // Headers
    .replace(/^(#{1,3})\s+(.+)$/gm, (_m, hashes: string, title: string) => {
      const color = hashes.length === 1 ? CYAN : hashes.length === 2 ? GREEN : YELLOW;
      return `${color}${BOLD}${title}${RESET}`;
    });
}

/** Sanitize a session name into a stable key fragment. */
function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Write an entry to the activity log for ops board visibility. */
function logActivity(entry: Record<string, unknown>): void {
  try {
    appendFileSync(ACTIVITY_LOG, JSON.stringify({
      ts: new Date().toISOString(),
      agent: 'Clementine',
      unit: '19Q1',
      ...entry,
    }) + '\n');
  } catch { /* non-fatal */ }
}

/** List named CLI chat sessions from the sessions file. */
function listNamedSessions(): Array<{ name: string; key: string; exchanges: number; timestamp: string }> {
  if (!existsSync(SESSIONS_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
    const results: Array<{ name: string; key: string; exchanges: number; timestamp: string }> = [];
    for (const [key, entry] of Object.entries(data) as [string, { exchanges?: number; timestamp?: string }][]) {
      if (key.startsWith('cli:chat:')) {
        const name = key.slice('cli:chat:'.length);
        results.push({
          name,
          key,
          exchanges: entry.exchanges ?? 0,
          timestamp: entry.timestamp ?? '',
        });
      }
    }
    // Sort by most recent first
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return results;
  } catch {
    return [];
  }
}

// ── Lazy gateway init ────────────────────────────────────────────────

let gatewayInstance: Gateway | null = null;

async function getGateway(): Promise<Gateway> {
  if (gatewayInstance) return gatewayInstance;

  process.env.CLEMENTINE_HOME = BASE_DIR;
  delete process.env['CLAUDECODE'];

  // Redirect pino (and all other stdout JSON logs) to the log file
  // so they don't pollute the interactive REPL output.
  const logFile = path.join(BASE_DIR, 'logs', 'cli-chat.log');
  const { createWriteStream, mkdirSync: mkdirSyncFs } = await import('node:fs');
  mkdirSyncFs(path.dirname(logFile), { recursive: true });
  const logStream = createWriteStream(logFile, { flags: 'a' });
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]): boolean => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    // Detect pino JSON log lines and redirect them to the log file
    if (str.startsWith('{"level":')) {
      logStream.write(chunk as string, ...(args as []));
      return true;
    }
    return originalStdoutWrite(chunk, ...(args as []));
  }) as typeof process.stdout.write;

  const { PersonalAssistant } = await import('../agent/assistant.js');
  const assistant = new PersonalAssistant();
  const { Gateway: GatewayClass } = await import('../gateway/router.js');
  gatewayInstance = new GatewayClass(assistant);

  const { setApprovalCallback } = await import('../agent/hooks.js');
  setApprovalCallback(async () => false);

  return gatewayInstance;
}

// ── REPL ─────────────────────────────────────────────────────────────

export async function cmdChat(opts: {
  model?: string;
  project?: string;
  profile?: string;
  name?: string;
  list?: boolean;
}): Promise<void> {
  // List mode: show named sessions
  if (opts.list) {
    const sessions = listNamedSessions();
    if (sessions.length === 0) {
      console.log(`${DIM}No named sessions.${RESET}`);
    } else {
      console.log(`${BOLD}Named sessions:${RESET}\n`);
      for (const s of sessions) {
        const age = s.timestamp ? timeAgo(s.timestamp) : '?';
        console.log(`  ${CYAN}${s.name}${RESET}  ${DIM}${s.exchanges} exchanges, last active ${age}${RESET}`);
      }
      console.log(`\n${DIM}Resume with: clementine chat --name <session-name>${RESET}`);
    }
    return;
  }

  // Build session key
  let sessionName = opts.name ? sanitizeName(opts.name) : null;
  let sessionKey = sessionName
    ? `cli:chat:${sessionName}`
    : `cli:repl:${process.pid}`;

  // Header
  const label = sessionName
    ? `${CYAN}${BOLD}Clementine Chat${RESET} ${BLUE}${sessionName}${RESET}`
    : `${CYAN}${BOLD}Clementine Chat${RESET}`;
  console.log(`${label} ${DIM}(Ctrl+C to exit)${RESET}`);

  // Check if resuming an existing session
  if (sessionName) {
    const sessions = listNamedSessions();
    const existing = sessions.find(s => s.name === sessionName);
    if (existing && existing.exchanges > 0) {
      console.log(`${DIM}Resuming session: ${existing.exchanges} prior exchanges, last active ${timeAgo(existing.timestamp)}${RESET}`);
    }
  }

  console.log();

  const gateway = await getGateway();

  // Apply initial model override
  if (opts.model) {
    const { MODELS } = await import('../config.js');
    const tier = opts.model.toLowerCase() as keyof typeof MODELS;
    if (tier in MODELS) {
      gateway.setSessionModel(sessionKey, MODELS[tier]);
      console.log(`${DIM}Model: ${tier} (${MODELS[tier]})${RESET}`);
    }
  }

  // Apply initial project override
  if (opts.project) {
    const { findProjectByName } = await import('../agent/assistant.js');
    const project = findProjectByName(opts.project);
    if (project) {
      gateway.setSessionProject(sessionKey, project);
      console.log(`${DIM}Project: ${path.basename(project.path)}${RESET}`);
    } else {
      console.log(`${YELLOW}Project "${opts.project}" not found — using auto-matching${RESET}`);
    }
  }

  // Apply initial profile override
  if (opts.profile) {
    const { PROFILES_DIR, AGENTS_DIR } = await import('../config.js');
    const { AgentManager } = await import('../agent/agent-manager.js');
    const pm = new AgentManager(AGENTS_DIR, PROFILES_DIR);
    const profile = pm.get(opts.profile);
    if (profile) {
      gateway.setSessionProfile(sessionKey, opts.profile);
      console.log(`${DIM}Profile: ${profile.name}${RESET}`);
    } else {
      console.log(`${YELLOW}Profile "${opts.profile}" not found${RESET}`);
    }
  }

  console.log();

  // Log session start to activity feed
  logActivity({
    type: 'start',
    trigger: 'cli-chat',
    detail: `Interactive chat${sessionName ? ': ' + sessionName : ''}`,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}>${RESET} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }

    // ── Bang commands ────────────────────────────────────────────
    if (text === '!help' || text === '!h') {
      console.log([
        `${BOLD}Commands:${RESET}`,
        `  ${CYAN}!model [haiku|sonnet|opus]${RESET} — Switch model`,
        `  ${CYAN}!project <name|list|clear|status>${RESET} — Set project context`,
        `  ${CYAN}!name <session-name>${RESET} — Name this session (enables resume)`,
        `  ${CYAN}!sessions${RESET} — List named sessions`,
        `  ${CYAN}!clear${RESET} — Reset conversation`,
        `  ${CYAN}!q <msg>${RESET} — Quick reply (Haiku)`,
        `  ${CYAN}!d <msg>${RESET} — Deep reply (Opus)`,
        `  ${CYAN}!help${RESET} — This message`,
        `  ${DIM}Ctrl+C to exit${RESET}`,
      ].join('\n'));
      rl.prompt();
      return;
    }

    if (text === '!clear') {
      gateway.clearSession(sessionKey);
      console.log(`${DIM}Session cleared.${RESET}`);
      rl.prompt();
      return;
    }

    if (text.startsWith('!name')) {
      const newName = text.slice(5).trim();
      if (!newName) {
        if (sessionName) {
          console.log(`${DIM}Current session: ${sessionName}${RESET}`);
        } else {
          console.log(`${DIM}Session is unnamed. Usage: !name <session-name>${RESET}`);
        }
        rl.prompt();
        return;
      }
      const sanitized = sanitizeName(newName);
      const newKey = `cli:chat:${sanitized}`;
      // Migrate session state if we have an existing session
      if (sessionKey !== newKey) {
        gateway.clearSession(newKey); // ensure clean target
      }
      sessionName = sanitized;
      sessionKey = newKey;
      console.log(`${DIM}Session named: ${CYAN}${sanitized}${DIM}. You can resume with: clementine chat --name ${sanitized}${RESET}`);
      rl.prompt();
      return;
    }

    if (text === '!sessions') {
      const sessions = listNamedSessions();
      if (sessions.length === 0) {
        console.log(`${DIM}No named sessions.${RESET}`);
      } else {
        for (const s of sessions) {
          const age = s.timestamp ? timeAgo(s.timestamp) : '?';
          const active = s.key === sessionKey ? ` ${GREEN}(current)${RESET}` : '';
          console.log(`  ${CYAN}${s.name}${RESET}  ${DIM}${s.exchanges} exchanges, ${age}${RESET}${active}`);
        }
      }
      rl.prompt();
      return;
    }

    if (text.startsWith('!model')) {
      const parts = text.split(/\s+/);
      const tier = parts[1]?.toLowerCase();
      const { MODELS } = await import('../config.js');
      if (tier && tier in MODELS) {
        gateway.setSessionModel(sessionKey, MODELS[tier as keyof typeof MODELS]);
        console.log(`${DIM}Model switched to ${tier} (${MODELS[tier as keyof typeof MODELS]})${RESET}`);
      } else {
        const current = gateway.getSessionModel(sessionKey) ?? 'default';
        console.log(`${DIM}Current model: ${current}. Options: haiku, sonnet, opus${RESET}`);
      }
      rl.prompt();
      return;
    }

    if (text.startsWith('!project')) {
      const parts = text.split(/\s+/);
      const subCmd = parts[1]?.toLowerCase();

      if (subCmd === 'clear') {
        gateway.clearSessionProject(sessionKey);
        console.log(`${DIM}Project context cleared.${RESET}`);
      } else if (subCmd === 'status') {
        const current = gateway.getSessionProject(sessionKey);
        if (current) {
          console.log(`${DIM}Active: ${path.basename(current.path)} — ${current.path}${RESET}`);
        } else {
          console.log(`${DIM}No active project. Using auto-matching.${RESET}`);
        }
      } else if (subCmd === 'list' || !subCmd) {
        const { getLinkedProjects } = await import('../agent/assistant.js');
        const projects = getLinkedProjects();
        if (projects.length === 0) {
          console.log(`${DIM}No linked projects.${RESET}`);
        } else {
          const current = gateway.getSessionProject(sessionKey);
          for (const p of projects) {
            const name = path.basename(p.path);
            const active = current && p.path === current.path ? ` ${GREEN}(active)${RESET}` : '';
            console.log(`  ${CYAN}${name}${RESET}${active}`);
          }
        }
      } else {
        // Set project
        const projectName = parts.slice(1).join(' ');
        const { findProjectByName } = await import('../agent/assistant.js');
        const project = findProjectByName(projectName);
        if (project) {
          gateway.clearSession(sessionKey);
          gateway.setSessionProject(sessionKey, project);
          console.log(`${DIM}Switched to ${path.basename(project.path)}. Session cleared.${RESET}`);
        } else {
          console.log(`${YELLOW}Project "${projectName}" not found.${RESET}`);
        }
      }
      rl.prompt();
      return;
    }

    // ── Per-message model prefix ───────────────────────────────
    let effectiveText = text;
    let oneOffModel: string | undefined;
    if (text.startsWith('!q ')) {
      const { MODELS } = await import('../config.js');
      oneOffModel = MODELS.haiku;
      effectiveText = text.slice(3);
    } else if (text.startsWith('!d ')) {
      const { MODELS } = await import('../config.js');
      oneOffModel = MODELS.opus;
      effectiveText = text.slice(3);
    }

    // ── Send message ──────────────────────────────────────────
    process.stdout.write('\n');
    let hasOutput = false;

    try {
      const response = await gateway.handleMessage(
        sessionKey,
        effectiveText,
        async (token: string) => {
          hasOutput = true;
          process.stdout.write(token);
        },
        oneOffModel,
        undefined,
        async (toolName: string) => {
          // Show tool activity inline
          const shortName = toolName.replace(/^mcp__19q1-tools__/, '');
          process.stdout.write(`\n${DIM}  [${shortName}]${RESET} `);
        },
      );

      if (!hasOutput && response) {
        // Fallback: no streaming happened, print full response
        process.stdout.write(renderMarkdown(response));
      }
      process.stdout.write('\n\n');
    } catch (err) {
      if (!hasOutput) {
        process.stdout.write('\n');
      }
      console.error(`${YELLOW}Error: ${err}${RESET}`);
      console.log();
    }

    rl.prompt();
  });

  rl.on('close', () => {
    logActivity({
      type: 'done',
      trigger: 'cli-chat',
      detail: `Session ended${sessionName ? ': ' + sessionName : ''}`,
    });
    console.log(`\n${DIM}Goodbye.${RESET}`);
    process.exit(0);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 60000) return 'just now';
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
