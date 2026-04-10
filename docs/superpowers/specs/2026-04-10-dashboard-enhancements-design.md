# Dashboard Enhancements -- Design Spec

**Date:** 2026-04-10
**Author:** Matthew Judy + Claude
**Status:** Approved
**Parent spec:** 2026-04-10-virtual-marketing-team-design.md (Sections 6.1-6.5)

---

## 1. Overview

Five dashboard enhancements for the Clementine virtual marketing team. Features span both the web dashboard (localhost:3030) and the CLI (`clementine ops`). The daily briefing is the highest-priority feature -- it replaces a broken morning brief with an interactive command center.

**Surfaces:**

| Feature | Web Dashboard | CLI (clementine ops) |
|---------|--------------|---------------------|
| 1. Daily Briefing | New page (replaces /morning-brief) | Web only |
| 2. Team Overview | Enhanced ops board + team page | Enhanced OPS + ROSTER screens |
| 3. Collaboration Feed | New section on team page | New [c] COMMS screen |
| 4. Goal Tracker | Enhanced Rocks page + briefing | Enhanced [g] ROCKS screen |
| 5. Agent Detail | New click-through panel | Web only |

---

## 2. Feature 1: Daily Briefing (Kill and Rebuild)

### Problem
The existing morning brief at `/morning-brief` is either broken or produces generic, unactionable output that Matthew doesn't read.

### Solution
Replace with an interactive "Command Center" page integrated into the main dashboard (not a separate route). Two-column layout designed to deliver the full picture in 60 seconds.

### Layout: Command Center

**Header bar:**
- Date, "Doug Stamper | Generated 7:00 AM"
- 3 goal pulse cards (right-aligned): lead gen growth, new FZ onboarding, vendor adoption
- Each card: current value, target, trajectory color (green = on track, amber = at risk, red = off track)

**Left column (Action):**
1. **Attention Required** -- decisions waiting, commitments overdue, escalations from agents. Red/amber left-border accent by urgency. Each item: title, context line, who flagged it.
2. **Today's Calendar** -- compact agenda from Outlook via Microsoft Graph. Columns: time, meeting title, prep status badge (green "Prep ready" / amber "Prep pending" / gray "No prep").
3. **Vendor Watch** -- each vendor shows: name, overall status (on track / overdue / due soon), commitment details, AND active agent tasks related to that vendor in blue text underneath. Vendors: Location3/LOCALACT, OneUpWeb, El Toro, Web Punch, Gain, plus any others with active commitments.

**Right column (Awareness):**
1. **Team Status** -- compact 10-agent grid. Columns: tier badge (OPU/SON/HAI color-coded), agent name, current activity or next scheduled job.
2. **From Sunday Planning** -- top ideas/initiatives from the weekly planning session.
3. **Overnight Activity** -- collapsed by default (`<details>` element), expandable. Chronological list of what agents did since yesterday's evening wrap.

### Data Source
New API endpoint: `GET /api/daily-briefing`

Aggregates:
- Morning brief JSON from `~/.clementine/morning-brief/latest.json`
- Agent states from bot-status.json + activity logs
- Team summary from activity aggregation
- Rocks/goals data from `~/.clementine/rocks/eos-data.json`
- Overnight activity from `.activity-log.jsonl` (last 12 hours)
- Calendar from Microsoft Graph (Outlook) via existing integration
- Vendor commitments from commitment ledger (vault-based)
- Planning ideas from `Meta/Clementine/planning/` (latest weekly plan)

### Navigation
- Replace the external `/morning-brief` link in sidebar nav with internal `page-briefing` nav item
- Keep `/morning-brief` route alive temporarily with a redirect banner
- Briefing page is the default landing page when Matthew opens the dashboard

### Delivery
- Rendered on the dashboard as an interactive page
- Also pushed as a compact summary to Matthew's Discord DM (dm:780266645473067050) for mobile access

---

## 3. Feature 2: Team Overview with Tier Badges

### Web Dashboard (Ops Board + Team Page)

Add to the agent table on the ops board:
- **TIER column** between STATUS and AGENT: colored badge showing OPU (purple #a371f7), SON (blue #58a6ff), or HAI (green #3fb950)
- **NEXT CRON column**: next scheduled job for this agent with time
- **Current task description**: already partially available, ensure it shows for all agents

Extend `/api/ops-board` response to include:
- `model` field from agent profile (available via AgentManager.listAll())
- Next scheduled cron time (compute from cron-parser, filter by agentSlug)

### CLI (clementine ops)

**OPS screen:** Add TIER column (3-char: OPU/SON/HAI) with ANSI color coding matching web colors. Insert between UNIT and AGENT columns.

**ROSTER screen:** Add TIER column and MODEL column. Show tier badge with color. Existing columns: STATUS, UNIT, AGENT, DONE, SPECIALTY. New: TIER after UNIT, MODEL after AGENT.

---

## 4. Feature 3: Collaboration Feed

### Message Types

| Type | Color | Source | Description |
|------|-------|--------|-------------|
| DELEGATION | Blue #58a6ff | delegate_task_now events | Doug assigns work to agents |
| MESSAGE | Purple #a371f7 | team_message calls | Direct agent-to-agent communication |
| CROSS-REVIEW | Green #3fb950 | L10 day review cron outputs | Peer review of scorecards |
| QA GATE | Green #3fb950 | Quinn's validation outputs | QA validation pass/fail |
| ESCALATION | Red #e74c3c | team_message to doug-stamper with urgency | Issues elevated for Matthew |

### Web Dashboard

New section on the team page (replaces or supplements existing "Inter-Agent Messages" card).

**Filter bar:** 3 dropdowns -- agent filter, time range (last 1h / 6h / 24h / 7d), type filter (all / messages / delegations / reviews).

**Feed entries:** Each entry shows:
- Timestamp
- Type badge (colored)
- From agent --> To agent (or "all" for QA gate)
- Content summary (1-2 lines)
- Background tint for cross-review and QA entries

### New API endpoint
`GET /api/collaboration-feed?agent=&since=&type=&limit=50`

Combines:
- Team bus messages from `~/.clementine/.team-comms.jsonl`
- Delegation events from agent task files
- Activity log entries with type 'invoke'

### CLI (clementine ops)

New **[c] COMMS** screen. Keyboard shortcut added to the navigation bar.

Table format:
```
TIME     TYPE        FROM             TO               SUMMARY
07:02    DELEGATE    Doug Stamper     M. Scofield      L3 monthly review prep
06:47    QA GATE     Quinn Mercer     all              3 scorecards validated
06:18    REVIEW      Davis Park       M. Scofield      Confirmed CPL trends
```

Color-coded by type matching web colors. Abbreviated agent names for column width. Shows last 24 hours by default, auto-refreshes with the 10-second cycle.

---

## 5. Feature 4: Goal Tracker

### Data Model

Extend `~/.clementine/rocks/eos-data.json` with a `goalMetrics` field:

```typescript
goalMetrics: {
  leadGenGrowth: {
    current: number;      // e.g., 18.2 (percent)
    target: number;       // 24
    trajectory: 'on-track' | 'at-risk' | 'off-track';
    trend: string;        // e.g., "+1.3% this month"
    updatedAt: string;    // ISO timestamp
  };
  newFranchiseeOnboarding: {
    hittingTarget: number; // e.g., 7
    total: number;         // e.g., 9
    atRisk: string[];      // e.g., ["SFID 4217 (45-day)", "SFID 5102 (60-day)"]
    trajectory: 'on-track' | 'at-risk' | 'off-track';
    updatedAt: string;
  };
  vendorAdoption: {
    current: number;       // e.g., 68 (percent)
    target: number;        // 75
    trajectory: 'on-track' | 'at-risk' | 'off-track';
    trend: string;         // e.g., "+2% this month"
    updatedAt: string;
  };
}
```

Populated by Doug's cron jobs (weekly planning, goal check-in cadence). Lead gen growth sourced from /lsvr skill adaptation (manual until automated). Vendor adoption manually provided by Matthew.

### Web Dashboard

**Rocks page:** 3-card goal pulse header above the existing EOS tree. Each card:
- Goal name (uppercase label)
- Current value (large number) / target
- Progress bar (color-coded: green on-track, amber at-risk, red off-track)
- Status label + trend text

**Briefing page:** Same 3 cards appear in the header bar (already designed in Feature 1).

### CLI (clementine ops)

**ROCKS screen [g]:** Add a goal pulse box at the top before the existing EOS tree. 3 rows, each showing:
- Goal name (padded)
- Current / target values
- Unicode progress bar (filled blocks + empty blocks, color-coded)
- Status label (ON TRACK / AT RISK / OFF TRACK)

---

## 6. Feature 5: Agent Detail View (Web Only)

### Trigger
Click any agent name or card on the team grid, ops board agent table, or collaboration feed. Opens a slide-over panel or modal.

### Layout

**Header:** Agent name, role description, unit number. Right side: model tier badge, current status badge.

**Tabs:**
1. **Activity** -- chronological list of recent activity (from per-agent `activity.jsonl`). Each entry: timestamp, action description, output file if applicable.
2. **Workload** -- pending tasks (from `agents/{slug}/tasks/`), upcoming cron schedule (next 5 scheduled jobs with times).
3. **Performance** -- quick stats: tasks completed today, QA pass rate (from Quinn's validations), average task duration, error count. Computed from activity logs.
4. **Config** -- model, tier, canMessage list, allowedTools, channel assignment. Read-only display.

### New API endpoint
`GET /api/agent/:slug/detail`

Returns:
- Activity history (from `getAgentActivity()` in agent-activity.ts)
- Pending tasks (from vault delegation files)
- Performance metrics (computed from completed task files)
- Configuration (from agent profile via AgentManager)
- Cron schedule (jobs where agentSlug matches, with next fire times)

### Quick Stats Bar
4 metric cards below the tabs:
- Tasks Today (count, green)
- QA Pass Rate (percentage, blue)
- Avg Duration (time, neutral)
- Pending (count, neutral or red if > 3)

---

## 7. Architecture

### Files to Modify

| File | Changes |
|------|---------|
| `src/cli/dashboard.ts` | New API endpoints (/api/daily-briefing, /api/collaboration-feed, /api/agent/:slug/detail). Enhanced /api/ops-board response. New briefing page HTML. Team overview tier badges. Collaboration feed section. Agent detail modal. Goal tracker on Rocks page. |
| `src/cli/morning-brief.ts` | Add `buildBriefingSummary()` export for structured briefing data. Keep existing HTML for backward compat. |
| `src/cli/index.ts` | CLI ops board changes: TIER column on OPS and ROSTER screens. New [c] COMMS screen. Goal pulse header on ROCKS screen. |
| `src/agent/agent-activity.ts` | Add `getAgentPerformance(slug)` function for completion rate, avg duration, error rate. |

### Extraction Strategy

If `dashboard.ts` exceeds 11,000 lines after changes, extract the briefing page into a `src/cli/briefing.ts` module following the `morning-brief.ts` pattern (exports HTML generator + data aggregation function).

### Caching

New endpoints use 60-second TTL caches (matching existing `_projectCache` pattern) to avoid expensive filesystem reads on every request.

---

## 8. Implementation Order

1. **New API endpoints** (backend) -- /api/daily-briefing, /api/collaboration-feed, /api/agent/:slug/detail, enhanced /api/ops-board
2. **Daily briefing page** (web) -- new nav item, page HTML/CSS/JS, wire to API
3. **Team overview tier badges** (web + CLI) -- add TIER column to ops board table, ROSTER screen
4. **Collaboration feed** (web + CLI) -- new section on team page, new [c] COMMS screen
5. **Goal tracker** (web + CLI) -- goal pulse on Rocks page and ROCKS screen, extend eos-data.json
6. **Agent detail view** (web) -- click handler, modal/panel, tabbed content
7. **Build and test**
