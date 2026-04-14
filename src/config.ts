/**
 * Watch Commander — Configuration and paths.
 *
 * Reads .env into a local record — never pollutes process.env.
 * The Claude Code SDK subprocess inherits process.env, so keeping
 * secrets out of it prevents accidental leakage.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Models } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Path split: code vs data ────────────────────────────────────────

/** Package/code root (wherever npm installed the package). */
export const PKG_DIR = path.resolve(__dirname, '..');

/** Data home — user data, vault, .env, logs, sessions. */
const newDataDir = path.join(os.homedir(), '.watchcommander');
const legacyDataDir = path.join(os.homedir(), '.clementine');
export const BASE_DIR = process.env.WATCHCOMMANDER_HOME || process.env.CLEMENTINE_HOME || (existsSync(newDataDir) ? newDataDir : existsSync(legacyDataDir) ? legacyDataDir : newDataDir);

// ── .env parser (never sets process.env) ────────────────────────────

function readEnvFile(): Record<string, string> {
  const envPath = path.join(BASE_DIR, '.env');
  if (!existsSync(envPath)) return {};

  const result: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    let value = trimmed.slice(eqIndex + 1);
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const env = readEnvFile();

// ── Timezone ────────────────────────────────────────────────────────
// TZ must be set on process.env BEFORE any Date operations so that
// getHours(), toLocaleString(), etc. use the correct local time —
// especially under launchd which does not inherit the user's timezone.
// This is safe to expose (not a secret).
if (env.TZ || process.env.TZ) {
  process.env.TZ = env.TZ ?? process.env.TZ;
}

/** Look up a config value: local .env first, then process.env fallback. */
function getEnv(key: string, fallback = ''): string {
  return env[key] ?? process.env[key] ?? fallback;
}

/** IANA timezone for the owner (from TZ in .env or system default). */
export const TIMEZONE = getEnv('TZ') || Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * ISO-like timestamp in local time: `2026-03-22T16:33:14`.
 * Drop-in replacement for `new Date().toISOString()` that respects TZ
 * so user-facing timestamps don't show UTC offsets.
 */
export function localISO(date?: Date): string {
  const d = date ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Paths ────────────────────────────────────────────────────────────
// VAULT_PATH in .env allows pointing at an external Obsidian vault.
// Folder names are configurable via .env to match any vault structure.

export const VAULT_DIR = getEnv('VAULT_PATH') || path.join(BASE_DIR, 'vault');

export const SYSTEM_DIR = path.join(VAULT_DIR, getEnv('VAULT_SYSTEM_DIR', 'Meta/Clementine'));
export const DAILY_NOTES_DIR = path.join(VAULT_DIR, getEnv('VAULT_DAILY_DIR', 'Daily'));
export const PEOPLE_DIR = path.join(VAULT_DIR, getEnv('VAULT_PEOPLE_DIR', 'People'));
export const PROJECTS_DIR = path.join(VAULT_DIR, getEnv('VAULT_PROJECTS_DIR', 'Planning'));
export const TOPICS_DIR = path.join(VAULT_DIR, getEnv('VAULT_TOPICS_DIR', 'Topics'));
export const TASKS_DIR = path.join(VAULT_DIR, getEnv('VAULT_TASKS_DIR', 'Meta/Clementine'));
export const TEMPLATES_DIR = path.join(VAULT_DIR, getEnv('VAULT_TEMPLATES_DIR', 'Templates'));
export const INBOX_DIR = path.join(VAULT_DIR, getEnv('VAULT_INBOX_DIR', 'Inbox'));
export const ORGANIZATIONS_DIR = path.join(VAULT_DIR, getEnv('VAULT_ORGS_DIR', 'Organizations'));
export const RESEARCH_DIR = path.join(VAULT_DIR, getEnv('VAULT_RESEARCH_DIR', 'Research'));
export const RESOURCES_DIR = path.join(VAULT_DIR, getEnv('VAULT_RESOURCES_DIR', 'Resources'));
export const PROFILES_DIR = path.join(SYSTEM_DIR, 'profiles');
export const AGENTS_DIR = path.join(SYSTEM_DIR, 'agents');

export const VAULT_CLAUDE_MD = path.join(VAULT_DIR, 'CLAUDE.md');
export const SOUL_FILE = path.join(SYSTEM_DIR, 'SOUL.md');
export const AGENTS_FILE = path.join(SYSTEM_DIR, 'AGENTS.md');
export const MEMORY_FILE = path.join(SYSTEM_DIR, 'MEMORY.md');
export const HEARTBEAT_FILE = path.join(SYSTEM_DIR, 'HEARTBEAT.md');
export const CRON_FILE = path.join(SYSTEM_DIR, 'CRON.md');
export const WORKFLOWS_DIR = path.join(SYSTEM_DIR, 'workflows');
export const TASKS_FILE = path.join(TASKS_DIR, 'TASKS.md');
export const DAILY_TEMPLATE = path.join(TEMPLATES_DIR, '_Daily-Template.md');
export const PEOPLE_TEMPLATE = path.join(TEMPLATES_DIR, '_People-Template.md');
export const PROJECTS_META_FILE = path.join(BASE_DIR, 'projects.json');

// ── Assistant identity ───────────────────────────────────────────────

export const ASSISTANT_NAME = getEnv('ASSISTANT_NAME', 'Watch Commander');
export const ASSISTANT_NICKNAME = getEnv('ASSISTANT_NICKNAME', 'WCMDR');
export const OWNER_NAME = getEnv('OWNER_NAME');

// ── Secrets (with macOS Keychain fallback) ───────────────────────────

function getSecret(envKey: string, keychainService?: string): string {
  const value = env[envKey] ?? '';
  if (value) return value;

  const service = keychainService ?? ASSISTANT_NAME.toLowerCase();
  try {
    const result = execSync(
      `security find-generic-password -s "${service}" -a "${envKey}" -w`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return result.trim();
  } catch {
    return '';
  }
}

// ── Models ───────────────────────────────────────────────────────────

export const MODELS: Models = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

export const DEFAULT_MODEL_TIER = (getEnv('DEFAULT_MODEL_TIER', 'sonnet')) as keyof Models;
export const MODEL = MODELS[DEFAULT_MODEL_TIER] ?? MODELS.sonnet;

// ── Discord ──────────────────────────────────────────────────────────

export const DISCORD_TOKEN = getSecret('DISCORD_TOKEN');
export const DISCORD_OWNER_ID = getEnv('DISCORD_OWNER_ID', '0');
export const DISCORD_OPS_CHANNEL_ID = getEnv('DISCORD_OPS_CHANNEL_ID', '');
export const DISCORD_EMAIL_CHANNEL_ID = getEnv('DISCORD_EMAIL_CHANNEL_ID', '');
export const DISCORD_WATCHED_CHANNELS: string[] = getEnv('DISCORD_WATCHED_CHANNELS')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ── Slack ────────────────────────────────────────────────────────────

export const SLACK_BOT_TOKEN = getSecret('SLACK_BOT_TOKEN');
export const SLACK_APP_TOKEN = getSecret('SLACK_APP_TOKEN');
export const SLACK_OWNER_USER_ID = getEnv('SLACK_OWNER_USER_ID');

// ── Telegram ─────────────────────────────────────────────────────────

export const TELEGRAM_BOT_TOKEN = getSecret('TELEGRAM_BOT_TOKEN');
export const TELEGRAM_OWNER_ID = getEnv('TELEGRAM_OWNER_ID', '0');

// ── WhatsApp (Twilio) ────────────────────────────────────────────────

export const TWILIO_ACCOUNT_SID = getSecret('TWILIO_ACCOUNT_SID');
export const TWILIO_AUTH_TOKEN = getSecret('TWILIO_AUTH_TOKEN');
export const WHATSAPP_OWNER_PHONE = getEnv('WHATSAPP_OWNER_PHONE');
export const WHATSAPP_FROM_PHONE = getEnv('WHATSAPP_FROM_PHONE');
export const WHATSAPP_WEBHOOK_PORT = parseInt(getEnv('WHATSAPP_WEBHOOK_PORT', '8421'), 10);

// ── Webhook ──────────────────────────────────────────────────────────

export const WEBHOOK_ENABLED = getEnv('WEBHOOK_ENABLED', 'false').toLowerCase() === 'true';
export const WEBHOOK_PORT = parseInt(getEnv('WEBHOOK_PORT', '8420'), 10);
export const WEBHOOK_SECRET = getSecret('WEBHOOK_SECRET');

// ── Voice ────────────────────────────────────────────────────────────

export const GROQ_API_KEY = getSecret('GROQ_API_KEY');
export const ELEVENLABS_API_KEY = getSecret('ELEVENLABS_API_KEY');
export const ELEVENLABS_VOICE_ID = getEnv('ELEVENLABS_VOICE_ID');

// ── Video ────────────────────────────────────────────────────────────

export const GOOGLE_API_KEY = getSecret('GOOGLE_API_KEY');

// ── Outlook (Microsoft Graph) ───────────────────────────────────────

export const MS_TENANT_ID = getEnv('MS_TENANT_ID');
export const MS_CLIENT_ID = getEnv('MS_CLIENT_ID');
export const MS_CLIENT_SECRET = getSecret('MS_CLIENT_SECRET');
export const MS_USER_EMAIL = getEnv('MS_USER_EMAIL');

// ── Security ─────────────────────────────────────────────────────────

export const ALLOW_ALL_USERS = getEnv('ALLOW_ALL_USERS', 'false').toLowerCase() === 'true';

// ── Heartbeat ────────────────────────────────────────────────────────

export const HEARTBEAT_INTERVAL_MINUTES = parseInt(getEnv('HEARTBEAT_INTERVAL_MINUTES', '30'), 10);
export const HEARTBEAT_ACTIVE_START = parseInt(getEnv('HEARTBEAT_ACTIVE_START', '8'), 10);
export const HEARTBEAT_ACTIVE_END = parseInt(getEnv('HEARTBEAT_ACTIVE_END', '22'), 10);
export const HEARTBEAT_MAX_TURNS = parseInt(getEnv('HEARTBEAT_MAX_TURNS', '5'), 10);

// ── Unleashed mode ──────────────────────────────────────────────────

/** Max turns per phase in unleashed mode before checkpointing. */
export const UNLEASHED_PHASE_TURNS = 75;
/** Default max duration for unleashed tasks (hours). */
export const UNLEASHED_DEFAULT_MAX_HOURS = 6;
/** Max phases before forcing completion. */
export const UNLEASHED_MAX_PHASES = 50;

// ── Workspace ───────────────────────────────────────────────────────

export const WORKSPACE_DIRS: string[] = getEnv('WORKSPACE_DIRS')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ── Agent bot behavior ──────────────────────────────────────────────

/** Suppress the "X is online" DM embed that each agent bot sends on startup. */
export const SUPPRESS_AGENT_STARTUP_DM = getEnv('SUPPRESS_AGENT_STARTUP_DM', 'false').toLowerCase() === 'true';

// ── Channel availability flags ───────────────────────────────────────

export const CHANNEL_DISCORD = Boolean(DISCORD_TOKEN);
export const CHANNEL_SLACK = Boolean(SLACK_BOT_TOKEN && SLACK_APP_TOKEN);
export const CHANNEL_TELEGRAM = Boolean(TELEGRAM_BOT_TOKEN);
export const CHANNEL_WHATSAPP = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && WHATSAPP_OWNER_PHONE);
export const CHANNEL_WEBHOOK = WEBHOOK_ENABLED && Boolean(WEBHOOK_SECRET);
export const CHANNEL_OUTLOOK = Boolean(MS_TENANT_ID && MS_CLIENT_ID && MS_CLIENT_SECRET && MS_USER_EMAIL);

// ── Fail-closed secret validation ───────────────────────────────────
//
// If a secret is explicitly configured in .env but resolves to empty,
// that's a misconfiguration — fail loud instead of silently degrading.
// Only checks keys that are present in .env (not absent ones).

interface SecretValidation {
  key: string;
  channel: string;
  requiredWith?: string[]; // other keys that must also be set
}

const SECRET_VALIDATIONS: SecretValidation[] = [
  { key: 'DISCORD_TOKEN', channel: 'Discord' },
  { key: 'SLACK_BOT_TOKEN', channel: 'Slack', requiredWith: ['SLACK_APP_TOKEN'] },
  { key: 'SLACK_APP_TOKEN', channel: 'Slack', requiredWith: ['SLACK_BOT_TOKEN'] },
  { key: 'TELEGRAM_BOT_TOKEN', channel: 'Telegram' },
  { key: 'TWILIO_ACCOUNT_SID', channel: 'WhatsApp', requiredWith: ['TWILIO_AUTH_TOKEN', 'WHATSAPP_OWNER_PHONE'] },
  { key: 'ANTHROPIC_API_KEY', channel: 'API' },
];

/**
 * Validate that explicitly configured secrets actually resolved.
 * Call at startup — throws on misconfiguration.
 */
export function validateSecrets(): string[] {
  const warnings: string[] = [];
  for (const v of SECRET_VALIDATIONS) {
    // Only check if the key is explicitly present in .env (not process.env fallback)
    const explicitlyConfigured = v.key in env;
    if (!explicitlyConfigured) continue;

    const value = getSecret(v.key);
    if (!value) {
      warnings.push(
        `${v.channel}: ${v.key} is configured in .env but resolved to empty. ` +
        `Check your .env file or Keychain entry.`,
      );
    }

    // Check companion keys
    if (value && v.requiredWith) {
      for (const companion of v.requiredWith) {
        const companionValue = env[companion] ?? '';
        // Only warn if the companion is also in .env but empty
        if (companion in env && !companionValue) {
          warnings.push(
            `${v.channel}: ${v.key} is set but companion ${companion} is empty.`,
          );
        }
      }
    }
  }
  return warnings;
}

// ── Team ────────────────────────────────────────────────────────────

export const TEAM_COMMS_CHANNEL = getEnv('TEAM_COMMS_CHANNEL');
export const TEAM_COMMS_LOG = path.join(BASE_DIR, 'logs', 'team-comms.jsonl');

// ── Memory / Search ──────────────────────────────────────────────────

export const MEMORY_DB_PATH = path.join(BASE_DIR, '.memory.db');
export const GRAPH_DB_DIR = path.join(BASE_DIR, '.graph.db');
export const SEARCH_CONTEXT_LIMIT = 3;
export const SEARCH_RECENCY_LIMIT = 3;
export const SYSTEM_PROMPT_MAX_CONTEXT_CHARS = 12000;

// ── Session Persistence ──────────────────────────────────────────────

export const SESSION_EXCHANGE_HISTORY_SIZE = 10;
export const SESSION_EXCHANGE_MAX_CHARS = 2000;
export const INJECTED_CONTEXT_MAX_CHARS = 6000;

// ── Search Ranking ───────────────────────────────────────────────────

export const TEMPORAL_DECAY_HALF_LIFE_DAYS = 30;
export const EPISODIC_DECAY_HALF_LIFE_DAYS = 7;

// ── Self-Improvement ─────────────────────────────────────────────────

export const SELF_IMPROVE_DIR = path.join(BASE_DIR, 'self-improve');
export const SOURCE_MODS_DIR = path.join(SELF_IMPROVE_DIR, 'source-mods');

// ── Goals & Cron Progress ───────────────────────────────────────────

export const GOALS_DIR = path.join(BASE_DIR, 'goals');
export const CRON_PROGRESS_DIR = path.join(BASE_DIR, 'cron', 'progress');
export const CRON_REFLECTIONS_DIR = path.join(BASE_DIR, 'cron', 'reflections');
export const DELEGATIONS_DIR = path.join(SYSTEM_DIR, 'agents');
export const HANDOFFS_DIR = path.join(BASE_DIR, 'handoffs');
export const PLAN_STATE_DIR = path.join(BASE_DIR, 'plan-state');
export const VAULT_MIGRATIONS_STATE = path.join(BASE_DIR, '.vault-migrations.json');

// ── Source Self-Edit Staging ─────────────────────────────────────────

export const STAGING_DIR = path.join(BASE_DIR, 'staging');

// ── Task ID Generator ────────────────────────────────────────────────
// Format: YYYYMMDD00XXXX (e.g., 20260331000001)
// Short form: #XXXX (last 4 digits)

const TASK_COUNTER_FILE = path.join(SYSTEM_DIR, '.task-counter.json');

export function nextTaskId(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  let counter = 1;
  try {
    if (existsSync(TASK_COUNTER_FILE)) {
      const data = JSON.parse(readFileSync(TASK_COUNTER_FILE, 'utf-8'));
      if (data.date === dateStr) {
        counter = (data.counter || 0) + 1;
      }
    }
  } catch { /* start fresh */ }

  writeFileSync(TASK_COUNTER_FILE, JSON.stringify({ date: dateStr, counter }));
  return `${dateStr}00${String(counter).padStart(4, '0')}`;
}

/** Extract the short display ID (#XXXX) from a full task ID. */
export function shortTaskId(fullId: string): string {
  if (/^\d{14}$/.test(fullId)) {
    return '#' + fullId.slice(-4);
  }
  // Legacy hex IDs — show as-is
  return fullId.slice(0, 8);
}

// ── API ──────────────────────────────────────────────────────────────

export const ANTHROPIC_API_KEY = getSecret('ANTHROPIC_API_KEY');
