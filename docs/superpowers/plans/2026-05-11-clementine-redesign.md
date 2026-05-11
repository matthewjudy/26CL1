# Clementine Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 9-agent system with two focused agents (Email + Scheduler) backed by PMSC and the Obsidian vault as shared context layers.

**Architecture:** A cleanup phase removes all dead code (team agents, multi-channel routing, heartbeat, graph memory). New modules are built bottom-up: PMSC client and Vault client first (shared infrastructure), then Email Agent, then Scheduler Agent. A single entry point wires them together under node-cron.

**Tech Stack:** TypeScript ESM, `@anthropic-ai/claude-agent-sdk` (`query()`), `node-cron`, Microsoft Graph API (fetch-based), Vitest for tests, `pino` for logging, `zod` for validation, `discord.js` (notification DM only).

**Important path note:** The `.env` and runtime data live in `~/.watchcommander/` (not `~/clementine/`). Config reads from `BASE_DIR = ~/.watchcommander`. Update `~/clementine/.env.example` and the Mac Mini setup doc accordingly.

---

## File Map

**Create:**
- `src/pmsc/types.ts` — Goal, Initiative, Task, IntakePayload interfaces
- `src/pmsc/client.ts` — PmscClient class (GET goals/initiatives/tasks, POST intake)
- `src/vault/client.ts` — VaultClient (daily note log writer, voice profile reader/writer)
- `src/discord/notifier.ts` — send-DM only, no command receiving
- `src/email/graph-client.ts` — Microsoft Graph API wrapper (inbox, drafts, sent)
- `src/email/agent.ts` — Email Agent (hourly orchestrator)
- `src/email/voice-learner.ts` — nightly sent-folder analysis
- `src/scheduler/runner.ts` — cron job runner
- `src/scheduler/jobs/lsvr.ts` — LSVR Thursday job
- `src/scheduler/jobs/localact-export.ts` — LocalAct export Thursday job
- `src/scheduler/agent.ts` — Scheduler Agent (orchestrates jobs, uploads to PMSC)
- `vitest.config.ts` — test config
- `src/pmsc/client.test.ts`
- `src/vault/client.test.ts`
- `src/email/graph-client.test.ts`
- `src/email/agent.test.ts`
- `src/scheduler/runner.test.ts`

**Modify:**
- `package.json` — add Vitest, add test script, remove Slack/Telegram/WhatsApp/Twilio deps
- `src/config.ts` — add PMSC + email agent vars, remove heartbeat/team/channel vars
- `src/index.ts` — replace daemon startup with Email Agent + Scheduler Agent loop
- `.env.example` — document new vars, remove old ones

**Delete (Task 1):**
- `src/agent/agent-activity.ts`, `agent-manager.ts`, `agent-state.ts`, `auto-update.ts`
- `src/agent/hooks.ts`, `orchestrator.ts`, `profiles.ts`, `safe-restart.ts`
- `src/agent/self-improve.ts`, `source-mods.ts`, `source-preflight.ts`
- `src/agent/team-bus.ts`, `team-router.ts`, `tool-loop-detector.ts`
- `src/agent/workflow-runner.ts`, `workflow-variables.ts`
- `src/channels/discord-agent-bot.ts`, `discord-bot-manager.ts`, `discord-utils.ts`
- `src/channels/slack-agent-bot.ts`, `slack-bot-manager.ts`, `slack-utils.ts`, `slack.ts`
- `src/channels/telegram.ts`, `webhook.ts`, `whatsapp.ts`
- `src/gateway/heartbeat.ts`, `lanes.ts`, `notifications.ts`, `router.ts`
- `src/memory/graph-store.ts`, `mmr.ts`, `chunker.ts`
- `src/cli/agent-chat.ts`, `morning-brief.ts`, `setup.ts`

---

## Task 1: Cleanup — Delete dead code and add Vitest

**Files:**
- Delete: all files listed in File Map → Delete section
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Delete dead source files**

```bash
cd ~/clementine

# Agent team files
rm src/agent/agent-activity.ts src/agent/agent-manager.ts src/agent/agent-state.ts
rm src/agent/auto-update.ts src/agent/hooks.ts src/agent/orchestrator.ts
rm src/agent/profiles.ts src/agent/safe-restart.ts src/agent/self-improve.ts
rm src/agent/source-mods.ts src/agent/source-preflight.ts
rm src/agent/team-bus.ts src/agent/team-router.ts src/agent/tool-loop-detector.ts
rm src/agent/workflow-runner.ts src/agent/workflow-variables.ts

# Channels (everything except discord.ts — that gets modified later)
rm src/channels/discord-agent-bot.ts src/channels/discord-bot-manager.ts src/channels/discord-utils.ts
rm src/channels/slack-agent-bot.ts src/channels/slack-bot-manager.ts src/channels/slack-utils.ts src/channels/slack.ts
rm src/channels/telegram.ts src/channels/webhook.ts src/channels/whatsapp.ts

# Gateway
rm src/gateway/heartbeat.ts src/gateway/lanes.ts src/gateway/notifications.ts src/gateway/router.ts

# Memory (graph + MMR only; store.ts and search.ts survive)
rm src/memory/graph-store.ts src/memory/mmr.ts src/memory/chunker.ts

# CLI extras
rm src/cli/agent-chat.ts src/cli/morning-brief.ts src/cli/setup.ts
```

Expected: no errors. If a file is missing, skip it.

- [ ] **Step 2: Add Vitest to package.json and remove unused deps**

Replace the `devDependencies` and `scripts` sections in `package.json`:

```json
{
  "scripts": {
    "build": "rm -rf dist && tsc && chmod +x dist/cli/index.js",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.81",
    "@anthropic-ai/sdk": "^0.78.0",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "better-sqlite3": "^11.7.0",
    "commander": "^13.1.0",
    "cron-parser": "^5.5.0",
    "discord.js": "^14.18.0",
    "gray-matter": "^4.0.3",
    "node-cron": "^3.0.3",
    "pino": "^9.6.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.12.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install updated dependencies**

```bash
cd ~/clementine && npm install
```

Expected: installs Vitest, removes @slack/bolt, grammy, twilio, @inquirer/prompts, express, falkordblite from node_modules.

- [ ] **Step 5: Run typecheck to see baseline errors**

```bash
cd ~/clementine && npm run typecheck 2>&1 | head -40
```

Expected: errors from imports referencing deleted files. Note them — they'll be fixed as each new module is built.

- [ ] **Step 6: Commit**

```bash
cd ~/clementine
git add -A
git commit -m "chore: delete dead code, add Vitest, remove unused deps"
```

---

## Task 2: Update config.ts

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Write the failing test**

Create `src/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('config', () => {
  it('exports PMSC_BASE_URL', async () => {
    const { PMSC_BASE_URL } = await import('./config.js');
    expect(typeof PMSC_BASE_URL).toBe('string');
  });

  it('exports EMAIL_AGENT_START_HOUR and EMAIL_AGENT_END_HOUR', async () => {
    const { EMAIL_AGENT_START_HOUR, EMAIL_AGENT_END_HOUR } = await import('./config.js');
    expect(EMAIL_AGENT_START_HOUR).toBe(7);
    expect(EMAIL_AGENT_END_HOUR).toBe(19);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/clementine && npx vitest run src/config.test.ts
```

Expected: FAIL — `PMSC_BASE_URL` not exported yet.

- [ ] **Step 3: Add PMSC and Email Agent config to config.ts**

Add these exports after the existing Outlook section (around line 200):

```typescript
// ── PMSC ─────────────────────────────────────────────────────────────

export const PMSC_BASE_URL = getEnv('PMSC_BASE_URL', 'https://pmsc.fcifloors.com');
export const PMSC_API_TOKEN = getSecret('PMSC_API_TOKEN');
export const PMSC_USER_ID = getEnv('PMSC_USER_ID');

// ── Email Agent ───────────────────────────────────────────────────────

/** Hour (0-23, Eastern) when the Email Agent starts running. */
export const EMAIL_AGENT_START_HOUR = parseInt(getEnv('EMAIL_AGENT_START_HOUR', '7'), 10);
/** Hour (0-23, Eastern) when the Email Agent stops running. */
export const EMAIL_AGENT_END_HOUR = parseInt(getEnv('EMAIL_AGENT_END_HOUR', '19'), 10);

// ── Voice Profile ────────────────────────────────────────────────────

export const VOICE_PROFILE_FILE = path.join(SYSTEM_DIR, 'voice-patterns.md');
export const PENDING_UPLOADS_DIR = path.join(SYSTEM_DIR, 'pending-uploads');
```

Also remove these exports that are no longer needed (delete the lines):
- `HEARTBEAT_INTERVAL_MINUTES`, `HEARTBEAT_ACTIVE_START`, `HEARTBEAT_ACTIVE_END`, `HEARTBEAT_MAX_TURNS`
- `UNLEASHED_PHASE_TURNS`, `UNLEASHED_DEFAULT_MAX_HOURS`, `UNLEASHED_MAX_PHASES`
- `TEAM_COMMS_CHANNEL`, `TEAM_COMMS_LOG`
- `SELF_IMPROVE_DIR`, `SOURCE_MODS_DIR`
- `STAGING_DIR`
- `CHANNEL_SLACK`, `CHANNEL_TELEGRAM`, `CHANNEL_WHATSAPP`, `CHANNEL_WEBHOOK`
- `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_OWNER_USER_ID`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `WHATSAPP_OWNER_PHONE`, `WHATSAPP_FROM_PHONE`, `WHATSAPP_WEBHOOK_PORT`
- `WEBHOOK_ENABLED`, `WEBHOOK_PORT`, `WEBHOOK_SECRET`
- `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- `GOOGLE_API_KEY`

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/clementine && npx vitest run src/config.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/clementine
git add src/config.ts src/config.test.ts
git commit -m "feat(config): add PMSC and Email Agent config, remove dead vars"
```

---

## Task 3: PMSC Client

**Files:**
- Create: `src/pmsc/types.ts`
- Create: `src/pmsc/client.ts`
- Create: `src/pmsc/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/pmsc/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PmscClient } from './client.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PmscClient', () => {
  let client: PmscClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new PmscClient('https://pmsc.test', 'test-token', 'user-1');
  });

  it('fetchGoals returns parsed goals', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'g1', title: 'SEM Leads 2026', progress: 0.45 }],
    });

    const goals = await client.fetchGoals();
    expect(goals).toHaveLength(1);
    expect(goals[0].title).toBe('SEM Leads 2026');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://pmsc.test/api/goals',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    );
  });

  it('submitIntake POSTs payload and returns id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'intake-123' }),
    });

    const result = await client.submitIntake({ jobName: 'lsvr', data: { leads: 100 }, goalId: 'g1' });
    expect(result.id).toBe('intake-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://pmsc.test/api/intake',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await expect(client.fetchGoals()).rejects.toThrow('PMSC 401');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/clementine && npx vitest run src/pmsc/client.test.ts
```

Expected: FAIL — `PmscClient` not found.

- [ ] **Step 3: Create src/pmsc/types.ts**

```typescript
export interface Goal {
  id: string;
  title: string;
  description?: string;
  progress: number;       // 0.0 – 1.0
  targetValue?: number;
  currentValue?: number;
  dueDate?: string;       // ISO date
}

export interface Initiative {
  id: string;
  goalId: string;
  title: string;
  status: 'active' | 'completed' | 'paused';
  owner?: string;
}

export interface Task {
  id: string;
  initiativeId?: string;
  title: string;
  status: 'open' | 'in_progress' | 'done';
  dueDate?: string;
  assignee?: string;
}

export interface IntakePayload {
  jobName: string;
  data: Record<string, unknown>;
  goalId?: string;
  initiativeId?: string;
  runAt?: string;         // ISO timestamp
}

export interface IntakeResult {
  id: string;
}
```

- [ ] **Step 4: Create src/pmsc/client.ts**

```typescript
import type { Goal, Initiative, Task, IntakePayload, IntakeResult } from './types.js';

export class PmscClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly userId: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PMSC ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async fetchGoals(): Promise<Goal[]> {
    return this.request<Goal[]>('/goals');
  }

  async fetchInitiatives(): Promise<Initiative[]> {
    return this.request<Initiative[]>('/initiatives');
  }

  async fetchTasks(): Promise<Task[]> {
    return this.request<Task[]>(`/tasks?assignee=${encodeURIComponent(this.userId)}`);
  }

  async submitIntake(payload: IntakePayload): Promise<IntakeResult> {
    return this.request<IntakeResult>('/intake', {
      method: 'POST',
      body: JSON.stringify({ ...payload, runAt: payload.runAt ?? new Date().toISOString() }),
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/clementine && npx vitest run src/pmsc/client.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
cd ~/clementine
git add src/pmsc/
git commit -m "feat(pmsc): add PmscClient with goals/initiatives/tasks/intake"
```

---

## Task 4: Vault Client

**Files:**
- Create: `src/vault/client.ts`
- Create: `src/vault/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/vault/client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VaultClient } from './client.js';

const TMP = path.join(os.tmpdir(), 'vault-client-test-' + Date.now());

beforeEach(() => {
  mkdirSync(path.join(TMP, 'Daily'), { recursive: true });
  mkdirSync(path.join(TMP, 'Meta/Clementine'), { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('VaultClient', () => {
  it('appendDailyLog creates the log section if missing', () => {
    const client = new VaultClient(TMP);
    client.appendDailyLog('08:00', 'Email scan', 'Found 2 actionable emails.');

    const date = new Date().toISOString().slice(0, 10);
    const content = readFileSync(path.join(TMP, 'Daily', `${date}.md`), 'utf-8');
    expect(content).toContain('## Log');
    expect(content).toContain('**08:00** - Email scan');
    expect(content).toContain('Found 2 actionable emails.');
  });

  it('appendDailyLog appends to existing log section', () => {
    const client = new VaultClient(TMP);
    client.appendDailyLog('08:00', 'First entry', 'Summary A.');
    client.appendDailyLog('09:00', 'Second entry', 'Summary B.');

    const date = new Date().toISOString().slice(0, 10);
    const content = readFileSync(path.join(TMP, 'Daily', `${date}.md`), 'utf-8');
    expect(content).toContain('**08:00** - First entry');
    expect(content).toContain('**09:00** - Second entry');
  });

  it('readVoiceProfile returns empty string when file missing', () => {
    const client = new VaultClient(TMP);
    expect(client.readVoiceProfile()).toBe('');
  });

  it('writeVoiceProfile creates the file', () => {
    const client = new VaultClient(TMP);
    client.writeVoiceProfile('Lead with the bottom line. Direct and concise.');
    const content = readFileSync(path.join(TMP, 'Meta/Clementine/voice-patterns.md'), 'utf-8');
    expect(content).toContain('Lead with the bottom line');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/clementine && npx vitest run src/vault/client.test.ts
```

Expected: FAIL — `VaultClient` not found.

- [ ] **Step 3: Create src/vault/client.ts**

```typescript
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import path from 'node:path';

export class VaultClient {
  private readonly dailyDir: string;
  private readonly systemDir: string;
  private readonly voiceProfilePath: string;
  private readonly pendingUploadsDir: string;

  constructor(vaultPath: string) {
    this.dailyDir = path.join(vaultPath, 'Daily');
    this.systemDir = path.join(vaultPath, 'Meta', 'Clementine');
    this.voiceProfilePath = path.join(this.systemDir, 'voice-patterns.md');
    this.pendingUploadsDir = path.join(this.systemDir, 'pending-uploads');
  }

  private todayPath(): string {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.dailyDir, `${date}.md`);
  }

  appendDailyLog(time: string, title: string, summary: string, next?: string): void {
    const filePath = this.todayPath();
    mkdirSync(this.dailyDir, { recursive: true });

    const entry = [
      `**${time}** - ${title}`,
      `- **Summary:** ${summary}`,
      next ? `- **Next:** ${next}` : null,
      '',
    ].filter(Boolean).join('\n');

    if (!existsSync(filePath)) {
      writeFileSync(filePath, `## Log\n\n${entry}`);
      return;
    }

    const content = readFileSync(filePath, 'utf-8');
    if (content.includes('## Log')) {
      writeFileSync(filePath, content.trimEnd() + '\n\n' + entry);
    } else {
      appendFileSync(filePath, '\n\n## Log\n\n' + entry);
    }
  }

  readVoiceProfile(): string {
    if (!existsSync(this.voiceProfilePath)) return '';
    return readFileSync(this.voiceProfilePath, 'utf-8');
  }

  writeVoiceProfile(content: string): void {
    mkdirSync(this.systemDir, { recursive: true });
    writeFileSync(this.voiceProfilePath, content);
  }

  writePendingUpload(jobName: string, data: Record<string, unknown>): string {
    mkdirSync(this.pendingUploadsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date}-${jobName}.json`;
    const filePath = path.join(this.pendingUploadsDir, filename);
    writeFileSync(filePath, JSON.stringify({ jobName, data, savedAt: new Date().toISOString() }, null, 2));
    return filePath;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/clementine && npx vitest run src/vault/client.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd ~/clementine
git add src/vault/
git commit -m "feat(vault): add VaultClient with daily log writer and voice profile"
```

---

## Task 5: Discord Notifier

**Files:**
- Create: `src/discord/notifier.ts`

- [ ] **Step 1: Create src/discord/notifier.ts**

Discord.js is already a dependency. This module sends DMs only — it does not listen for commands.

```typescript
import { Client, GatewayIntentBits, type TextChannel, type DMChannel } from 'discord.js';
import pino from 'pino';

const logger = pino({ name: 'clementine.discord' });

let client: Client | null = null;

async function getClient(token: string): Promise<Client> {
  if (client?.isReady()) return client;

  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });
  await client.login(token);

  await new Promise<void>((resolve) => {
    client!.once('ready', () => resolve());
  });

  return client;
}

export async function sendOwnerDM(token: string, ownerId: string, message: string): Promise<void> {
  try {
    const discord = await getClient(token);
    const user = await discord.users.fetch(ownerId);
    await user.send(message);
    logger.info({ ownerId }, 'Discord DM sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send Discord DM');
  }
}

export async function destroyDiscordClient(): Promise<void> {
  if (client) {
    await client.destroy();
    client = null;
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd ~/clementine && npx tsc --noEmit 2>&1 | grep discord
```

Expected: no errors on `src/discord/notifier.ts`.

- [ ] **Step 3: Commit**

```bash
cd ~/clementine
git add src/discord/notifier.ts
git commit -m "feat(discord): add notification-only DM sender, remove command routing"
```

---

## Task 6: Microsoft Graph Email Client

**Files:**
- Create: `src/email/graph-client.ts`
- Create: `src/email/graph-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/email/graph-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphEmailClient } from './graph-client.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const client = new GraphEmailClient({
  tenantId: 't1',
  clientId: 'c1',
  clientSecret: 's1',
  userEmail: 'test@example.com',
});

describe('GraphEmailClient', () => {
  beforeEach(() => mockFetch.mockReset());

  it('getAccessToken fetches and caches token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok123', expires_in: 3600 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: [] }),
    });

    await client.getInboxSince(new Date());
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('oauth2/v2.0/token'),
      expect.anything(),
    );
  });

  it('getInboxSince returns emails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          { id: 'e1', subject: 'Test', from: { emailAddress: { address: 'a@b.com' } }, bodyPreview: 'Hello', receivedDateTime: '2026-05-11T08:00:00Z', isRead: false },
        ],
      }),
    });

    const emails = await client.getInboxSince(new Date('2026-05-11T07:00:00Z'));
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe('Test');
  });

  it('saveDraft calls the drafts endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'draft-1' }) });

    const id = await client.saveDraft({ subject: 'Re: Test', body: 'Sure thing.', to: 'a@b.com' });
    expect(id).toBe('draft-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/clementine && npx vitest run src/email/graph-client.test.ts
```

Expected: FAIL — `GraphEmailClient` not found.

- [ ] **Step 3: Create src/email/graph-client.ts**

```typescript
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
}

export interface DraftInput {
  subject: string;
  body: string;
  to: string;
  replyToId?: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class GraphEmailClient {
  private tokenCache: TokenCache | null = null;

  constructor(private readonly creds: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    userEmail: string;
  }) {}

  async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const { tenantId, clientId, clientSecret } = this.creds;
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });

    if (!res.ok) throw new Error(`Graph auth failed: ${await res.text()}`);
    const data = await res.json() as { access_token: string; expires_in: number };
    this.tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return data.access_token;
  }

  private async graphGet<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Graph GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async graphPost<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Graph POST ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getInboxSince(since: Date): Promise<EmailMessage[]> {
    const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
    const select = 'id,subject,from,bodyPreview,receivedDateTime,isRead';
    const data = await this.graphGet<{ value: any[] }>(
      `/users/${this.creds.userEmail}/mailFolders/inbox/messages?$filter=${filter}&$select=${select}&$orderby=receivedDateTime%20desc&$top=50`,
    );
    return data.value.map((m) => ({
      id: m.id,
      subject: m.subject ?? '(no subject)',
      from: m.from?.emailAddress?.address ?? 'unknown',
      bodyPreview: m.bodyPreview ?? '',
      receivedDateTime: m.receivedDateTime,
      isRead: m.isRead,
    }));
  }

  async getSentSince(since: Date): Promise<EmailMessage[]> {
    const filter = encodeURIComponent(`sentDateTime ge ${since.toISOString()}`);
    const select = 'id,subject,toRecipients,bodyPreview,sentDateTime';
    const data = await this.graphGet<{ value: any[] }>(
      `/users/${this.creds.userEmail}/mailFolders/sentItems/messages?$filter=${filter}&$select=${select}&$orderby=sentDateTime%20desc&$top=20`,
    );
    return data.value.map((m) => ({
      id: m.id,
      subject: m.subject ?? '(no subject)',
      from: this.creds.userEmail,
      bodyPreview: m.bodyPreview ?? '',
      receivedDateTime: m.sentDateTime,
      isRead: true,
    }));
  }

  async saveDraft(draft: DraftInput): Promise<string> {
    const body = {
      subject: draft.subject,
      body: { contentType: 'Text', content: draft.body },
      toRecipients: [{ emailAddress: { address: draft.to } }],
    };
    const result = await this.graphPost<{ id: string }>(
      `/users/${this.creds.userEmail}/messages`,
      body,
    );
    return result.id;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/clementine && npx vitest run src/email/graph-client.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd ~/clementine
git add src/email/graph-client.ts src/email/graph-client.test.ts
git commit -m "feat(email): add GraphEmailClient for inbox/sent/drafts via Microsoft Graph"
```

---

## Task 7: Email Agent

**Files:**
- Create: `src/email/agent.ts`
- Create: `src/email/agent.test.ts`

The Email Agent runs Claude (via `query()`) with email context, instructing it to classify each email, draft replies, and identify FYI items. Claude writes drafts by calling `saveDraft` and returns a structured JSON summary that the agent logs to the vault.

- [ ] **Step 1: Write the failing test**

Create `src/email/agent.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildEmailAgentPrompt } from './agent.js';

describe('buildEmailAgentPrompt', () => {
  it('includes email subjects in the prompt', () => {
    const emails = [
      { id: 'e1', subject: 'Quarterly report', from: 'boss@fci.com', bodyPreview: 'Please review.', receivedDateTime: '2026-05-11T08:00:00Z', isRead: false },
    ];
    const voiceProfile = 'Direct and concise. Lead with bottom line.';
    const prompt = buildEmailAgentPrompt(emails, voiceProfile, []);

    expect(prompt).toContain('Quarterly report');
    expect(prompt).toContain('Direct and concise');
  });

  it('includes active goals context', () => {
    const prompt = buildEmailAgentPrompt([], '', [
      { id: 'g1', title: 'SEM Leads 2026', progress: 0.45 },
    ] as any);
    expect(prompt).toContain('SEM Leads 2026');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/clementine && npx vitest run src/email/agent.test.ts
```

Expected: FAIL — `buildEmailAgentPrompt` not found.

- [ ] **Step 3: Create src/email/agent.ts**

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import pino from 'pino';
import {
  MODELS,
  VAULT_DIR,
  MS_TENANT_ID,
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_USER_EMAIL,
  localISO,
} from '../config.js';
import { GraphEmailClient, type EmailMessage } from './graph-client.js';
import { VaultClient } from '../vault/client.js';
import { sendOwnerDM } from '../discord/notifier.js';
import type { Goal } from '../pmsc/types.js';

const logger = pino({ name: 'clementine.email-agent' });

const STATE_KEY = 'email-agent-last-run';

export function buildEmailAgentPrompt(
  emails: EmailMessage[],
  voiceProfile: string,
  goals: Goal[],
): string {
  const emailList = emails.length === 0
    ? 'No new emails since last run.'
    : emails.map((e, i) =>
        `[${i + 1}] ID: ${e.id}\nFrom: ${e.from}\nSubject: ${e.subject}\nPreview: ${e.bodyPreview}\nReceived: ${e.receivedDateTime}`
      ).join('\n\n');

  const goalsContext = goals.length === 0
    ? ''
    : `Active 2026 goals:\n${goals.map((g) => `- ${g.title} (${Math.round(g.progress * 100)}% progress)`).join('\n')}\n\n`;

  return `You are Clementine, Matthew Judy's always-on assistant. Matthew is VP of Performance Marketing at Floor Coverings International (300+ franchise locations).

${goalsContext}Matthew's voice profile for drafting:
${voiceProfile || 'Direct and concise. Lead with the bottom line. No hedging.'}

---

New emails since last run:

${emailList}

---

For each email, classify it as one of:
- ACTIONABLE: needs a reply from Matthew
- FYI: informational — a commitment made to Matthew, a decision, a metric, vendor update, or anything he'd want to find later
- NOISE: newsletter, notification, automated mail — skip entirely

For ACTIONABLE emails: draft a reply in Matthew's voice using the voice profile above. Be specific and direct. The draft should be ready to send with minimal editing.

For FYI emails: write a one-sentence summary of what's worth remembering.

Respond with a JSON object in this exact format:
{
  "actionable": [
    { "emailId": "...", "subject": "...", "from": "...", "draftSubject": "Re: ...", "draftBody": "...", "draftTo": "..." }
  ],
  "fyi": [
    { "emailId": "...", "subject": "...", "summary": "..." }
  ],
  "urgent": [
    { "emailId": "...", "subject": "...", "reason": "..." }
  ]
}

urgent[] = emails that cannot wait for Matthew's next check — time-sensitive decisions, blocked initiatives, or direct asks from key stakeholders. Keep this list empty unless genuinely urgent.`;
}

interface AgentResult {
  actionable: Array<{ emailId: string; subject: string; from: string; draftSubject: string; draftBody: string; draftTo: string }>;
  fyi: Array<{ emailId: string; subject: string; summary: string }>;
  urgent: Array<{ emailId: string; subject: string; reason: string }>;
}

export async function runEmailAgent(options: {
  graphClient: GraphEmailClient;
  vault: VaultClient;
  goals: Goal[];
  discordToken?: string;
  discordOwnerId?: string;
  sinceDate: Date;
}): Promise<void> {
  const { graphClient, vault, goals, discordToken, discordOwnerId, sinceDate } = options;

  logger.info({ since: sinceDate.toISOString() }, 'Email Agent starting');

  const [emails, voiceProfile] = await Promise.all([
    graphClient.getInboxSince(sinceDate),
    Promise.resolve(vault.readVoiceProfile()),
  ]);

  if (emails.length === 0) {
    logger.info('No new emails — skipping');
    return;
  }

  logger.info({ count: emails.length }, 'Fetched emails');

  const prompt = buildEmailAgentPrompt(emails, voiceProfile, goals);
  let resultJson = '';

  // cwd=VAULT_DIR ensures CLAUDE.md is in scope. SDK uses stored Claude Code credentials.
  for await (const msg of query({
    prompt,
    options: {
      model: MODELS.sonnet,
      maxTurns: 3,
      cwd: VAULT_DIR,
    },
  })) {
    if (msg.type === 'assistant' && msg.message.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') resultJson += block.text;
      }
    }
  }

  let result: AgentResult;
  try {
    const jsonMatch = resultJson.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch?.[0] ?? '{}') as AgentResult;
  } catch {
    logger.error({ resultJson }, 'Failed to parse agent JSON response');
    return;
  }

  // Save drafts
  for (const item of result.actionable ?? []) {
    try {
      await graphClient.saveDraft({
        subject: item.draftSubject,
        body: item.draftBody,
        to: item.draftTo,
      });
      logger.info({ subject: item.draftSubject }, 'Draft saved');
    } catch (err) {
      logger.error({ err, subject: item.draftSubject }, 'Failed to save draft');
    }
  }

  // Log to daily note
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fyiSummary = (result.fyi ?? []).map((f) => f.summary).join(' ');
  const draftCount = (result.actionable ?? []).length;
  const urgentCount = (result.urgent ?? []).length;

  const summary = [
    fyiSummary || null,
    draftCount > 0 ? `${draftCount} draft${draftCount > 1 ? 's' : ''} saved to Outlook Drafts.` : null,
  ].filter(Boolean).join(' ');

  const next = urgentCount > 0
    ? (result.urgent ?? []).map((u) => `"${u.subject}" — ${u.reason}`).join('; ')
    : undefined;

  if (summary) {
    vault.appendDailyLog(time, 'Email scan', summary, next);
  }

  // Discord urgent alerts
  if (urgentCount > 0 && discordToken && discordOwnerId) {
    for (const item of result.urgent ?? []) {
      await sendOwnerDM(discordToken, discordOwnerId, `Urgent email: **${item.subject}**\n${item.reason}`);
    }
  }

  logger.info({ fyi: result.fyi?.length, drafts: draftCount, urgent: urgentCount }, 'Email Agent complete');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/clementine && npx vitest run src/email/agent.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd ~/clementine
git add src/email/agent.ts src/email/agent.test.ts
git commit -m "feat(email): add Email Agent with classify/draft/log pipeline"
```

---

## Task 8: Voice Learner (Nightly)

**Files:**
- Create: `src/email/voice-learner.ts`

- [ ] **Step 1: Create src/email/voice-learner.ts**

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import pino from 'pino';
import { MODELS } from '../config.js';
import type { GraphEmailClient } from './graph-client.js';
import type { VaultClient } from '../vault/client.js';

const logger = pino({ name: 'clementine.voice-learner' });

function buildVoiceLearnerPrompt(sentEmails: Array<{ subject: string; bodyPreview: string }>, existingProfile: string): string {
  if (sentEmails.length === 0) return '';

  const emailSamples = sentEmails
    .slice(0, 10)
    .map((e, i) => `[${i + 1}] Subject: ${e.subject}\n${e.bodyPreview}`)
    .join('\n\n');

  return `You are analyzing Matthew Judy's sent emails to build a voice profile that will guide future draft writing.

Current voice profile:
${existingProfile || '(none yet)'}

Today's sent emails:
${emailSamples}

Analyze these emails and update the voice profile. Extract patterns in:
- Tone (formal vs. casual, direct vs. diplomatic)
- Sentence structure (short/punchy vs. longer explanations)
- How he opens emails (salutation style, first sentence pattern)
- How he closes (sign-off style)
- What he leads with (bottom line first, context first, etc.)
- Level of detail vs. brevity
- Any recurring phrases or framings
- What he avoids (hedging, filler phrases, emojis, etc.)

Return ONLY the updated voice profile as plain text — 150-250 words. Write it as a style guide for someone drafting on his behalf. No headers, no bullet points — prose only.`;
}

export async function runVoiceLearner(options: {
  graphClient: GraphEmailClient;
  vault: VaultClient;
  vaultPath: string;
}): Promise<void> {
  const { graphClient, vault, vaultPath } = options;

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const sentEmails = await graphClient.getSentSince(since);
  if (sentEmails.length === 0) {
    logger.info('No sent emails today — skipping voice learning');
    return;
  }

  const existingProfile = vault.readVoiceProfile();
  const prompt = buildVoiceLearnerPrompt(sentEmails, existingProfile);

  let updatedProfile = '';
  for await (const msg of query({
    prompt,
    options: { model: MODELS.haiku, maxTurns: 1, cwd: vaultPath },
  })) {
    if (msg.type === 'assistant' && msg.message.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') updatedProfile += block.text;
      }
    }
  }

  if (updatedProfile.trim()) {
    vault.writeVoiceProfile(updatedProfile.trim());
    logger.info({ sentCount: sentEmails.length }, 'Voice profile updated');
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd ~/clementine && npx tsc --noEmit 2>&1 | grep voice-learner
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/clementine
git add src/email/voice-learner.ts
git commit -m "feat(email): add nightly voice learner from sent folder"
```

---

## Task 9: Scheduler Agent and Jobs

**Files:**
- Create: `src/scheduler/runner.ts`
- Create: `src/scheduler/jobs/lsvr.ts`
- Create: `src/scheduler/jobs/localact-export.ts`
- Create: `src/scheduler/agent.ts`
- Create: `src/scheduler/runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scheduler/runner.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { isWithinScheduleWindow } from './runner.js';

describe('isWithinScheduleWindow', () => {
  it('returns true when hour is within window', () => {
    expect(isWithinScheduleWindow(8, 7, 19)).toBe(true);
    expect(isWithinScheduleWindow(18, 7, 19)).toBe(true);
  });

  it('returns false when hour is outside window', () => {
    expect(isWithinScheduleWindow(6, 7, 19)).toBe(false);
    expect(isWithinScheduleWindow(20, 7, 19)).toBe(false);
    expect(isWithinScheduleWindow(19, 7, 19)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/clementine && npx vitest run src/scheduler/runner.test.ts
```

Expected: FAIL — `isWithinScheduleWindow` not found.

- [ ] **Step 3: Create src/scheduler/runner.ts**

```typescript
import pino from 'pino';
import type { PmscClient } from '../pmsc/client.js';
import type { VaultClient } from '../vault/client.js';

const logger = pino({ name: 'clementine.scheduler' });

export interface ScheduledJob {
  name: string;
  goalId?: string;
  run(): Promise<Record<string, unknown>>;
}

export function isWithinScheduleWindow(currentHour: number, startHour: number, endHour: number): boolean {
  return currentHour >= startHour && currentHour < endHour;
}

export async function executeJob(
  job: ScheduledJob,
  pmsc: PmscClient,
  vault: VaultClient,
): Promise<void> {
  const startedAt = new Date();
  const time = `${String(startedAt.getHours()).padStart(2, '0')}:${String(startedAt.getMinutes()).padStart(2, '0')}`;

  logger.info({ job: job.name }, 'Scheduler job starting');

  try {
    const data = await job.run();

    // Try PMSC upload; fall back to pending-uploads staging
    try {
      await pmsc.submitIntake({ jobName: job.name, data, goalId: job.goalId });
      vault.appendDailyLog(time, `Scheduler: ${job.name}`, 'Completed. Data uploaded to PMSC.');
      logger.info({ job: job.name }, 'Job complete — uploaded to PMSC');
    } catch (pmscErr) {
      const stagingPath = vault.writePendingUpload(job.name, data);
      vault.appendDailyLog(time, `Scheduler: ${job.name}`, `Completed. PMSC unavailable — staged to ${stagingPath}.`);
      logger.warn({ job: job.name, pmscErr }, 'PMSC upload failed — staged locally');
    }
  } catch (err) {
    vault.appendDailyLog(time, `Scheduler: ${job.name} FAILED`, String(err), 'Manual review needed.');
    logger.error({ job: job.name, err }, 'Job failed');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/clementine && npx vitest run src/scheduler/runner.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Create src/scheduler/jobs/lsvr.ts**

```typescript
import { spawn } from 'node:child_process';
import type { ScheduledJob } from '../runner.js';

export function createLsvrJob(): ScheduledJob {
  return {
    name: 'lsvr',
    goalId: undefined, // set to SEM Leads 2026 goal ID once PMSC read API is live
    async run(): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        const proc = spawn('claude', ['--print', '/lsvr'], {
          cwd: process.env.HOME,
          env: { ...process.env },
          timeout: 10 * 60 * 1000, // 10 minutes
        });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`lsvr exited ${code}: ${stderr}`));
          } else {
            resolve({ output: stdout, completedAt: new Date().toISOString() });
          }
        });
      });
    },
  };
}
```

- [ ] **Step 6: Create src/scheduler/jobs/localact-export.ts**

```typescript
import { spawn } from 'node:child_process';
import type { ScheduledJob } from '../runner.js';

export function createLocalActExportJob(): ScheduledJob {
  return {
    name: 'localact-export',
    goalId: undefined, // set to Vendor Adoption goal ID once PMSC read API is live
    async run(): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        const proc = spawn('claude', ['--print', '/localact-export'], {
          cwd: process.env.HOME,
          env: { ...process.env },
          timeout: 15 * 60 * 1000, // 15 minutes
        });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`localact-export exited ${code}: ${stderr}`));
          } else {
            resolve({ output: stdout, completedAt: new Date().toISOString() });
          }
        });
      });
    },
  };
}
```

- [ ] **Step 7: Create src/scheduler/agent.ts**

```typescript
import pino from 'pino';
import { executeJob } from './runner.js';
import { createLsvrJob } from './jobs/lsvr.js';
import { createLocalActExportJob } from './jobs/localact-export.js';
import type { PmscClient } from '../pmsc/client.js';
import type { VaultClient } from '../vault/client.js';

const logger = pino({ name: 'clementine.scheduler-agent' });

export async function runThursdayExports(pmsc: PmscClient, vault: VaultClient): Promise<void> {
  logger.info('Running Thursday export jobs');
  await executeJob(createLsvrJob(), pmsc, vault);
  await executeJob(createLocalActExportJob(), pmsc, vault);
}
```

- [ ] **Step 8: Commit**

```bash
cd ~/clementine
git add src/scheduler/
git commit -m "feat(scheduler): add job runner, lsvr and localact-export jobs, Scheduler Agent"
```

---

## Task 10: Main Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read current src/index.ts to understand what to replace**

```bash
head -40 ~/clementine/src/index.ts
```

- [ ] **Step 2: Replace src/index.ts with the new entry point**

```typescript
/**
 * Clementine — Mac Mini always-on agent.
 *
 * Two agents, two schedules:
 *   Email Agent: hourly, 7am–7pm Eastern
 *   Scheduler Agent: Thursday 7am (lsvr + localact-export)
 *   Voice Learner: nightly 9pm
 */

import cron from 'node-cron';
import pino from 'pino';
import {
  VAULT_DIR,
  SYSTEM_DIR,
  PMSC_BASE_URL,
  PMSC_API_TOKEN,
  PMSC_USER_ID,
  MS_TENANT_ID,
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_USER_EMAIL,
  DISCORD_TOKEN,
  DISCORD_OWNER_ID,
  EMAIL_AGENT_START_HOUR,
  EMAIL_AGENT_END_HOUR,
  ANTHROPIC_API_KEY,
  MODELS,
} from './config.js';
import { PmscClient } from './pmsc/client.js';
import { VaultClient } from './vault/client.js';
import { GraphEmailClient } from './email/graph-client.js';
import { runEmailAgent } from './email/agent.js';
import { runVoiceLearner } from './email/voice-learner.js';
import { runThursdayExports } from './scheduler/agent.js';

const logger = pino({ name: 'clementine' });

// Track the last email scan time so each run fetches only new emails
let lastEmailScan = new Date();
lastEmailScan.setHours(lastEmailScan.getHours() - 1);

function buildClients() {
  const pmsc = new PmscClient(PMSC_BASE_URL, PMSC_API_TOKEN, PMSC_USER_ID);
  const vault = new VaultClient(VAULT_DIR);
  const graph = new GraphEmailClient({
    tenantId: MS_TENANT_ID,
    clientId: MS_CLIENT_ID,
    clientSecret: MS_CLIENT_SECRET,
    userEmail: MS_USER_EMAIL,
  });
  return { pmsc, vault, graph };
}

async function emailAgentRun(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();
  if (hour < EMAIL_AGENT_START_HOUR || hour >= EMAIL_AGENT_END_HOUR) return;

  const { pmsc, vault, graph } = buildClients();
  const sinceDate = lastEmailScan;
  lastEmailScan = now;

  try {
    const goals = await pmsc.fetchGoals().catch(() => []);
    await runEmailAgent({
      graphClient: graph,
      vault,
      goals,
      discordToken: DISCORD_TOKEN || undefined,
      discordOwnerId: DISCORD_OWNER_ID || undefined,
      sinceDate,
    });
  } catch (err) {
    logger.error({ err }, 'Email Agent run failed');
  }
}

async function voiceLearnerRun(): Promise<void> {
  const { graph, vault } = buildClients();
  try {
    await runVoiceLearner({ graphClient: graph, vault, vaultPath: VAULT_DIR });
  } catch (err) {
    logger.error({ err }, 'Voice Learner run failed');
  }
}

async function schedulerRun(): Promise<void> {
  const { pmsc, vault } = buildClients();
  try {
    await runThursdayExports(pmsc, vault);
  } catch (err) {
    logger.error({ err }, 'Scheduler Agent run failed');
  }
}

function start(): void {
  logger.info({ vault: VAULT_DIR, pmsc: PMSC_BASE_URL }, 'Clementine starting');

  // Email Agent: every hour during business hours (7am–7pm)
  cron.schedule('0 7-19 * * *', () => { void emailAgentRun(); }, { timezone: 'America/New_York' });

  // Voice Learner: nightly at 9pm
  cron.schedule('0 21 * * *', () => { void voiceLearnerRun(); }, { timezone: 'America/New_York' });

  // Scheduler: Thursday 7am
  cron.schedule('0 7 * * 4', () => { void schedulerRun(); }, { timezone: 'America/New_York' });

  logger.info('All cron jobs scheduled. Clementine is running.');
}

start();
```

- [ ] **Step 3: Run typecheck**

```bash
cd ~/clementine && npm run typecheck 2>&1 | head -30
```

Expected: errors only for files that reference deleted modules (cli/dashboard.ts, cli/cron.ts if they import dead code). Fix any remaining import errors by removing the dead imports from `src/cli/index.ts` and `src/cli/cron.ts`.

- [ ] **Step 4: Build**

```bash
cd ~/clementine && npm run build 2>&1 | tail -10
```

Expected: builds cleanly into `dist/`.

- [ ] **Step 5: Commit**

```bash
cd ~/clementine
git add src/index.ts
git commit -m "feat: replace daemon with Email Agent + Scheduler Agent entry point"
```

---

## Task 11: Run Full Test Suite and Mac Mini Launchd

**Files:**
- Create: `com.clementine.plist` (launchd plist for Mac Mini)

- [ ] **Step 1: Run full test suite**

```bash
cd ~/clementine && npm test
```

Expected: all tests pass. If any fail, fix before continuing.

- [ ] **Step 2: Create launchd plist**

This file goes on the Mac Mini at `~/Library/LaunchAgents/com.clementine.plist`. Create it in the repo for reference, install manually on the Mac Mini.

```bash
cat > ~/clementine/com.clementine.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.clementine</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/mjudy/clementine/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/mjudy/2026 FCI</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TZ</key>
    <string>America/New_York</string>
    <key>WATCHCOMMANDER_HOME</key>
    <string>/Users/mjudy/.watchcommander</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/mjudy/.watchcommander/logs/clementine.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/mjudy/.watchcommander/logs/clementine.err</string>
</dict>
</plist>
EOF
```

Note: `WorkingDirectory` is set to `~/2026 FCI` so `CLAUDE.md` is in scope for any Claude sessions spawned by the agents.

- [ ] **Step 3: Update .env.example to reflect new vars**

```bash
cat > ~/clementine/.env.example << 'EOF'
# ── Identity ──────────────────────────────────────────────────────────
ASSISTANT_NAME=Clementine
OWNER_NAME=Matthew Judy
TZ=America/New_York

# ── Model ─────────────────────────────────────────────────────────────
DEFAULT_MODEL_TIER=sonnet

# ── Anthropic ─────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=

# ── Discord (notification output only) ───────────────────────────────
DISCORD_TOKEN=
DISCORD_OWNER_ID=

# ── Microsoft Graph (Outlook) ─────────────────────────────────────────
MS_TENANT_ID=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_USER_EMAIL=mjudy@fcifloors.com

# ── PMSC ──────────────────────────────────────────────────────────────
PMSC_BASE_URL=https://pmsc.fcifloors.com
PMSC_API_TOKEN=
PMSC_USER_ID=

# ── Vault ─────────────────────────────────────────────────────────────
VAULT_PATH=/Users/mjudy/2026 FCI

# ── Email Agent schedule (Eastern hour, 0-23) ─────────────────────────
EMAIL_AGENT_START_HOUR=7
EMAIL_AGENT_END_HOUR=19
EOF
```

- [ ] **Step 4: Commit final state**

```bash
cd ~/clementine
git add com.clementine.plist .env.example
git commit -m "feat: add launchd plist and updated .env.example for Mac Mini deployment"
```

- [ ] **Step 5: Mac Mini install instructions (manual — run on Mac Mini after setup)**

```bash
# After completing Mac Mini Setup Instructions.md:
mkdir -p ~/.watchcommander/logs

# Install and build
cd ~/clementine && npm install && npm run build

# Copy .env to data directory
cp ~/clementine/.env.example ~/.watchcommander/.env
# Edit ~/.watchcommander/.env and fill in all blank values

# Install launchd plist
cp ~/clementine/com.clementine.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.clementine.plist

# Verify it started
launchctl list | grep clementine
tail -f ~/.watchcommander/logs/clementine.log
```

Expected: `clementine` appears in launchctl list, log shows "Clementine starting" and "All cron jobs scheduled."
