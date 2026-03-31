/**
 * Clementine CLI — Agent Chat session.
 *
 * Usage: clementine agent-chat <agent-slug>
 *
 * Spawns a Claude Code subprocess with the agent's agent.md as the system prompt.
 * Interactive stdin/stdout — user types, agent responds, loop until exit.
 * Conversations are logged to the vault automatically.
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  appendFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { AGENTS_DIR, VAULT_DIR, MODELS } from '../config.js';
import type { Models } from '../types.js';

// ── ANSI helpers ─────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[0;90m';
const CYAN = '\x1b[0;36m';
const YELLOW = '\x1b[1;33m';
const MAGENTA = '\x1b[0;35m';
const RESET = '\x1b[0m';

// ── Agent discovery ──────────────────────────────────────────────────

interface AgentMeta {
  slug: string;
  name: string;
  description: string;
  unit: string;
  model: string;
  agentFilePath: string;
}

function listAgentSlugs(): string[] {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(path.join(AGENTS_DIR, name, 'agent.md')));
}

function loadAgentMeta(slug: string): AgentMeta | null {
  const agentFile = path.join(AGENTS_DIR, slug, 'agent.md');
  if (!existsSync(agentFile)) return null;

  const raw = readFileSync(agentFile, 'utf-8');
  const { data } = matter(raw);

  return {
    slug,
    name: (data.name as string) || slug,
    description: (data.description as string) || '',
    unit: (data.unit as string) || '',
    model: (data.model as string) || 'sonnet',
    agentFilePath: agentFile,
  };
}

/**
 * Fuzzy-match an agent slug.
 * Tries exact match first, then prefix match, then substring match.
 */
function resolveAgentSlug(input: string): string | null {
  const slugs = listAgentSlugs();
  const lower = input.toLowerCase();

  // Exact match
  if (slugs.includes(lower)) return lower;

  // Prefix match
  const prefixMatches = slugs.filter((s) => s.startsWith(lower));
  if (prefixMatches.length === 1) return prefixMatches[0];

  // Substring match
  const subMatches = slugs.filter((s) => s.includes(lower));
  if (subMatches.length === 1) return subMatches[0];

  // Multiple matches — return null, caller will show candidates
  if (prefixMatches.length > 1 || subMatches.length > 1) return null;

  return null;
}

function getCandidates(input: string): string[] {
  const slugs = listAgentSlugs();
  const lower = input.toLowerCase();
  const prefixMatches = slugs.filter((s) => s.startsWith(lower));
  if (prefixMatches.length > 0) return prefixMatches;
  return slugs.filter((s) => s.includes(lower));
}

// ── Conversation logging ─────────────────────────────────────────────

function getLogPath(slug: string): string {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const convDir = path.join(AGENTS_DIR, slug, 'conversations');
  if (!existsSync(convDir)) mkdirSync(convDir, { recursive: true });

  return path.join(convDir, `${dateStr}.md`);
}

function initLogFile(logPath: string, agent: AgentMeta): void {
  if (existsSync(logPath)) {
    // Append a separator for a new session
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    appendFileSync(logPath, `\n---\n\n## Session — ${timeStr}\n\n`, 'utf-8');
    return;
  }

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const frontmatter = [
    '---',
    `date: ${dateStr}`,
    `agent: "[[${agent.name}]]"`,
    `slug: ${agent.slug}`,
    'tags:',
    '  - agent-chat',
    '  - conversation',
    '---',
    '',
    `# Chat with ${agent.name} — ${dateStr}`,
    '',
    `## Session — ${timeStr}`,
    '',
  ].join('\n');

  writeFileSync(logPath, frontmatter, 'utf-8');
}

// ── Main command ─────────────────────────────────────────────────────

export async function cmdAgentChat(agentInput: string, opts: {
  model?: string;
  list?: boolean;
}): Promise<void> {
  // List mode
  if (opts.list || !agentInput) {
    const slugs = listAgentSlugs();
    console.log(`${BOLD}Available agents:${RESET}\n`);
    for (const slug of slugs.sort()) {
      const meta = loadAgentMeta(slug);
      if (meta) {
        const desc = meta.description.length > 70
          ? meta.description.slice(0, 67) + '...'
          : meta.description;
        console.log(`  ${CYAN}${slug}${RESET}  ${DIM}${desc}${RESET}`);
      }
    }
    console.log(`\n${DIM}Usage: clementine agent-chat <slug>${RESET}`);
    return;
  }

  // Resolve the slug
  const slug = resolveAgentSlug(agentInput);
  if (!slug) {
    const candidates = getCandidates(agentInput);
    if (candidates.length > 0) {
      console.error(`${YELLOW}Ambiguous match "${agentInput}". Did you mean:${RESET}`);
      for (const c of candidates) {
        console.error(`  ${CYAN}${c}${RESET}`);
      }
    } else {
      console.error(`${YELLOW}No agent found matching "${agentInput}".${RESET}`);
      console.error(`${DIM}Run "clementine agent-chat --list" to see available agents.${RESET}`);
    }
    process.exit(1);
  }

  const agent = loadAgentMeta(slug);
  if (!agent) {
    console.error(`${YELLOW}Could not load agent "${slug}".${RESET}`);
    process.exit(1);
  }

  // Resolve model
  const modelTier = (opts.model ?? agent.model ?? 'sonnet').toLowerCase() as keyof Models;
  const model = MODELS[modelTier] ?? MODELS.sonnet;

  // Show header
  console.log();
  console.log(`${MAGENTA}${BOLD}${agent.name}${RESET}`);
  if (agent.unit) console.log(`${DIM}Unit: ${agent.unit}${RESET}`);
  if (agent.description) {
    const desc = agent.description.length > 100
      ? agent.description.slice(0, 97) + '...'
      : agent.description;
    console.log(`${DIM}${desc}${RESET}`);
  }
  console.log(`${DIM}Model: ${modelTier} (${model})${RESET}`);
  console.log(`${DIM}Type "exit" or "quit" to end. Ctrl+C also works.${RESET}`);
  console.log();

  // Set up conversation log
  const logPath = getLogPath(slug);
  initLogFile(logPath, agent);

  // Find claude binary
  let claudeBin: string;
  try {
    const { execSync } = await import('node:child_process');
    claudeBin = execSync('which claude', { encoding: 'utf-8', env: process.env }).trim();
  } catch {
    // Fallback to common locations
    const fallbacks = [
      path.join(os.homedir(), '.local', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];
    const found = fallbacks.find((p) => existsSync(p));
    if (found) {
      claudeBin = found;
    } else {
      console.error(`${YELLOW}Could not find "claude" CLI in PATH.${RESET}`);
      process.exit(1);
    }
  }

  // Spawn Claude Code with the agent's system prompt file
  const child = spawn(claudeBin, [
    '--system-prompt-file', agent.agentFilePath,
    '--model', model,
    '--add-dir', VAULT_DIR,
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Ensure vault is accessible
    },
  });

  // Log session start
  const startTime = new Date();
  const startStr = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  appendFileSync(logPath, `> *Session started at ${startStr}*\n\n`, 'utf-8');

  // Handle process exit
  child.on('close', (code) => {
    const endTime = new Date();
    const endStr = endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    appendFileSync(logPath, `> *Session ended at ${endStr}*\n\n`, 'utf-8');

    console.log();
    console.log(`${DIM}Conversation logged to: ${path.relative(VAULT_DIR, logPath)}${RESET}`);
    process.exit(code ?? 0);
  });

  // Forward signals
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}
