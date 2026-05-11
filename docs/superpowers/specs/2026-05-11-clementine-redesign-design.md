# Clementine Redesign — Design Spec
**Date:** 2026-05-11
**Status:** Approved

---

## Problem Statement

The current Clementine system is over-engineered and misaligned. Nine named agents with complex routing, a 30-minute heartbeat watchdog, multi-channel infrastructure (Discord/Slack/Telegram/WhatsApp), and graph memory are producing operational overhead without proportional value. Agents write noise into the Obsidian vault — standup notes, heartbeat logs, activity files — that clutter a workspace that also holds Matthew's personal life. The Mac Mini and main MacBook Pro run independently with no shared context, so proactive work on the Mac Mini isn't aligned to what Matthew is actually working on during the day.

---

## Design Goals

1. **Two focused agents** replace the nine-agent team. Each does real work, not coordination.
2. **PMSC is the source of truth for FCI work** — goals, initiatives, tasks. Both devices read from it.
3. **The Obsidian vault is the source of truth for personal and crossover content** — read/write, but with strict write discipline.
4. **Both devices are aligned** through shared PMSC context and shared vault. No separate state per machine.
5. **Vault writes are signal only** — Clementine only writes to the vault when there is something worth recording.

---

## Architecture

```
Mac Mini (always-on)
├── Scheduler Agent     — cron jobs, data exports, PMSC uploads
└── Email Agent         — inbox review, draft writing, sent-folder voice learning

Shared Context Layer
├── PMSC (pmsc.fcifloors.com)    — source of truth for FCI goals/initiatives/tasks
└── Obsidian Vault (~/2026 FCI)  — source of truth for personal + crossover content

Main Machine (MacBook Pro — active work)
└── Claude Code sessions
    — reads PMSC + vault at session start for alignment
    — no Clementine process running
```

---

## What Gets Deleted

The following are removed from the codebase entirely:

- All 9 agent profiles and their configuration files (Doug Stamper, Davis Park, Michael Scofield, Nate Lawson, Olivia Pope, Sasha Petrova, Quinn Mercer, Marcus Cole, Elena Voss, Ross Barrett)
- Team bus (`src/agent/team-bus.ts`)
- Team router (`src/agent/team-router.ts`)
- Gateway and lanes (`src/gateway/`)
- Heartbeat (`src/gateway/heartbeat.ts`, `HEARTBEAT.md`)
- Slack channel handlers (`src/channels/slack*.ts`)
- Telegram channel handler (`src/channels/telegram.ts`)
- WhatsApp channel handler (`src/channels/whatsapp.ts`)
- Discord bot manager and routing (bot receives no commands in the new design)
- Graph memory store, MMR, chunker (`src/memory/graph-store.ts`, `src/memory/mmr.ts`, `src/memory/chunker.ts`)
- Agent orchestrator (`src/agent/orchestrator.ts`)
- Self-improve module (`src/agent/self-improve.ts`)
- Auto-update module (`src/agent/auto-update.ts`)
- Vault standup notes, heartbeat logs, agent activity logs (stopped, existing files left in place)

What survives: cron scheduler, Outlook/email tools, vault read/write, config system, CLI skeleton, Discord as notification-only output.

---

## Module 1: Email Agent

**Purpose:** Monitor Outlook inbox, produce useful outputs, learn Matthew's voice from sent mail.

### Schedule

Runs hourly, 7am–7pm Eastern, every day.

### Inbox Scan (every run)

1. Fetch emails received since last run.
2. Classify each email:
   - **Actionable** — needs a reply. Draft one using the current voice profile and save to Outlook Drafts.
   - **FYI / informational** — data worth remembering (vendor update, commitment made to Matthew, decision flagged, metric shared). Append a brief entry to today's daily note under `## Log`.
   - **Noise** — newsletters, notifications, automated mail. Skip, no output.
3. If anything is genuinely urgent (time-sensitive decision, blocked initiative, direct ask from a key stakeholder), send a Discord DM immediately rather than waiting for the next cycle.

### Voice Learning (nightly)

1. Fetch emails sent that day from Outlook Sent folder.
2. Analyze tone, framing, how Matthew opened and closed, sentence rhythm, what he led with, level of directness.
3. Update `Meta/Clementine/voice-patterns.md` in the vault with extracted patterns.
4. Future draft creation pulls this file as the primary style reference.

### Outputs

| Output | Destination |
|--------|-------------|
| FYI email summaries | `Daily/YYYY-MM-DD.md` → `## Log` |
| Drafted replies | Outlook Drafts |
| Urgent flags | Discord DM |
| Voice pattern updates | `Meta/Clementine/voice-patterns.md` |

### Log Entry Format

Follows the existing vault log format from `CLAUDE.md`:

```markdown
**HH:MM** - Email scan
- **Summary:** [What was found — commitments, decisions, data worth keeping]
- **Drafts:** [N replies drafted and saved to Outlook Drafts]
- **Next:** [Anything requiring Matthew's attention]
```

Nothing is logged if the scan found nothing actionable or worth remembering.

---

## Module 2: Scheduler Agent

**Purpose:** Run time-based data work and upload results to PMSC.

### Jobs (initial set)

| Schedule | Job | Output |
|----------|-----|--------|
| Thursday 7am | Run `/lsvr` (lead source velocity report) | POST to PMSC against SEM Leads 2026 goal |
| Thursday 7am | Run `/localact-export` (paid media data) | POST to PMSC against Vendor Adoption goal |
| Expandable | Any future cron job | Plugs into same runner |

### Skills Access

Skills live in `~/.claude/skills/`, which symlinks to iCloud Drive at `~/Library/Mobile Documents/com~apple~CloudDocs/Claude-Config/skills`. The Mac Mini uses the same symlink, so all skills are available on both machines without duplication or separate sync.

### PMSC Upload Flow

```
Cron fires → skill executes → structured JSON output
→ PMSC client POSTs to relevant goal/initiative
→ Daily note log entry (one line: job name, result, timestamp)
```

**Interim (while PMSC write endpoint is being built):** Results are written to `Meta/Clementine/pending-uploads/YYYY-MM-DD-{job}.json` and flushed to PMSC once the write API is ready. Nothing blocks.

### Log Entry Format

```markdown
**07:02** - Scheduler: lsvr + localact-export
- **Result:** Both completed successfully. Data uploaded to PMSC.
```

On failure:
```markdown
**07:02** - Scheduler: lsvr failed
- **Error:** [brief error description]
- **Next:** Manual review needed
```

---

## Module 3: PMSC Client

**Purpose:** Shared module used by both agents to read FCI context and write results.

### Location

`src/pmsc/client.ts`

### API Surface (initial)

```typescript
// Read
GET  /goals           → Goal[]          // 2026 goals + current progress
GET  /initiatives     → Initiative[]    // initiatives under each goal
GET  /tasks           → Task[]          // open tasks for mjudy@fcifloors.com

// Write (pending PMSC API work)
POST /intake          → accepts data export results from Scheduler Agent
```

### Auth

Read endpoints: separate auth mechanism to be determined as part of PMSC API work.
Write endpoint: existing webhook token (`pmsc_wh_...`) from `.env`.

### Usage Pattern

Both agents call the PMSC client at the start of each run to load current FCI context. The Email Agent uses goal/initiative data to determine whether incoming email is relevant to active work. The Scheduler Agent uses it to route export results to the correct goal.

---

## Vault Write Discipline

Clementine is permitted to write to exactly these locations:

| Location | Agent | Content |
|----------|-------|---------|
| `Daily/YYYY-MM-DD.md` → `## Log` | Email Agent + Scheduler | Hourly scan summaries, job completions |
| `Meta/Clementine/voice-patterns.md` | Email Agent | Nightly voice profile |
| `Meta/Clementine/pending-uploads/` | Scheduler Agent | Staged PMSC data (interim) |

**All other vault locations are read-only for Clementine.**

This list is intentionally extensible. As Matthew does more work away from his desk and the Mac Mini takes on more tasks, new write targets are added deliberately with a clear purpose. The discipline is that every write is named and intentional — not that writes are permanently restricted.

State files (`Meta/Clementine/state/`) remain as-is for operational bookkeeping but are never surfaced as vault content.

---

## Two-Device Alignment

### Shared via iCloud

| Asset | iCloud Path | Both Machines Symlink |
|-------|-------------|----------------------|
| Skills | `Claude-Config/skills/` | `~/.claude/skills` |
| Memory | `Claude-Config/memory/` | `~/.claude/projects/-Users-mjudy/memory/` |
| Settings (optional) | `Claude-Config/settings.json` | `~/.claude/settings.json` |

Memory sync is the key mechanism that makes the Mac Mini feel identical to the MacBook Pro — same preferences, same feedback patterns, same project context, accumulated over every session on either machine.

### Main Machine Session Start

When Matthew opens Claude Code on the MacBook to do active work:

1. Read `Daily/YYYY-MM-DD.md` — picks up everything the Mac Mini logged since last session
2. Read PMSC goals + active initiatives — FCI alignment established
3. Read `Meta/Clementine/voice-patterns.md` — voice profile available for any drafting

No separate briefing command. No ops board. Context is ambient.

### Away from Desk

Mac Mini continues running. Email Agent scans, drafts pile up in Outlook Drafts, daily note log accumulates. When Matthew returns or checks on mobile, he looks at two places: today's daily note and Outlook Drafts. That's the full handoff.

### Discord

Discord is notification-only output in the new design. The Mac Mini's Discord bot sends DMs when something requires Matthew's attention (urgent email, job failure, draft waiting). It receives no commands and routes nothing.

---

## What Is Not Changing

- Vault structure, filing rules, and conventions (`CLAUDE.md`)
- All Claude Code skills on the MacBook (unchanged, synced to Mac Mini via iCloud)
- PMSC app itself (API additions are additive, nothing breaks existing behavior)
- The Obsidian vault content already in place
- Discord as the notification channel

---

## Open Items (PMSC API Work)

These are required for full Scheduler Agent functionality but do not block the Email Agent or initial build:

- `POST /intake` endpoint to accept structured data export results
- `GET /goals` and `GET /initiatives` read endpoints with auth
- Decision on read auth mechanism (API key vs. JWT)

The Scheduler Agent stages results locally until these are ready.

---

## Mac Mini Setup

Full step-by-step setup instructions are at:
`~/2026 FCI/Meta/Clementine/Mac Mini Setup Instructions.md`

Summary:
1. MacBook Pro: move memory to iCloud, create symlink (give to Claude Code to run)
2. Mac Mini: install Claude Code, Node.js
3. Mac Mini: create skills symlink to iCloud
4. Mac Mini: create memory symlink to iCloud
5. Mac Mini: clone Clementine repo, `npm install`, `npm run build`, create `.env`
6. Mac Mini: authenticate MCP servers (Microsoft 365 / Outlook) in Claude Code
7. Mac Mini: configure Claude Code settings
