# Dashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 dashboard features (daily briefing, team overview tier badges, collaboration feed, goal tracker, agent detail view) across the web dashboard and CLI.

**Architecture:** New API endpoints in dashboard.ts provide structured data. New page sections in the inline HTML SPA consume those endpoints. CLI index.ts gets a new COMMS screen and enhanced ROSTER/ROCKS screens. No new dependencies.

**Tech Stack:** TypeScript, Express, inline HTML/CSS/JS SPA, ANSI terminal rendering.

---

## File Map

| File | Responsibility | Action |
|------|---------------|--------|
| `src/cli/dashboard.ts` | Web dashboard API + SPA | Add 3 API endpoints, 1 page, modify ops board table, add collaboration section, add agent detail modal |
| `src/cli/index.ts` | CLI ops board TUI | Add TIER column to OPS + ROSTER, add [c] COMMS screen, add goal pulse to ROCKS |
| `src/agent/agent-activity.ts` | Activity logging | Add `getAgentPerformance()` helper |

---

### Task 1: Add /api/daily-briefing endpoint

**Files:**
- Modify: `src/cli/dashboard.ts` (insert after /api/rocks endpoint, ~line 1577)

- [ ] **Step 1: Add the briefing data cache**

Insert after the existing `_projectCache` block (~line 305):

```typescript
let _briefingCache: { data: Record<string, unknown>; ts: number } | null = null;
const BRIEFING_CACHE_TTL = 60_000;
```

- [ ] **Step 2: Add the /api/daily-briefing endpoint**

Insert after the `/api/rocks` endpoint (~line 1577). This endpoint aggregates data from multiple sources into the briefing structure:

```typescript
app.get('/api/daily-briefing', async (_req, res) => {
  try {
    if (_briefingCache && Date.now() - _briefingCache.ts < BRIEFING_CACHE_TTL) {
      return res.json(_briefingCache.data);
    }

    const gw = await getGateway();
    const mgr = gw.getAgentManager();
    const allAgents = mgr.listAll();

    // Agent states
    const botStatusPath = path.join(BASE_DIR, '.bot-status.json');
    let botStatuses: Record<string, unknown> = {};
    try { botStatuses = JSON.parse(fs.readFileSync(botStatusPath, 'utf-8')); } catch { /* empty */ }

    const teamStatus = allAgents
      .filter(a => !a.slug.startsWith('_'))
      .map(a => {
        const bs = (botStatuses as Record<string, Record<string, unknown>>)[a.slug] || {};
        const activity = (bs.activity as Record<string, string>) || {};
        return {
          slug: a.slug,
          name: a.name,
          model: a.model || 'sonnet',
          status: (bs.status as string) || 'OFFLINE',
          focus: activity.action || '--',
        };
      });

    // Goal metrics from eos-data
    let goalMetrics = null;
    try {
      const rocksData = loadRocksData();
      goalMetrics = (rocksData as Record<string, unknown>).goalMetrics || null;
    } catch { /* no metrics yet */ }

    // Morning brief data (if available)
    let briefData = null;
    const briefPath = path.join(BASE_DIR, 'morning-brief', 'latest.json');
    try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch { /* none */ }

    // Recent activity (last 12 hours)
    const activityPath = path.join(BASE_DIR, '.activity-log.jsonl');
    const overnightActivity: Record<string, unknown>[] = [];
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    try {
      const lines = fs.readFileSync(activityPath, 'utf-8').trim().split('\n');
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (new Date(entry.ts).getTime() > twelveHoursAgo) {
            overnightActivity.push(entry);
          }
        } catch { /* skip bad lines */ }
      }
    } catch { /* no activity file */ }

    // Planning ideas (latest weekly plan)
    let ideas: string[] = [];
    const planningDir = path.join(VAULT_DIR, 'Meta', 'Clementine', 'planning');
    try {
      const planFiles = fs.readdirSync(planningDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse();
      if (planFiles.length > 0) {
        const content = fs.readFileSync(path.join(planningDir, planFiles[0]), 'utf-8');
        const ideasMatch = content.match(/## Ideas[\s\S]*?(?=##|$)/i);
        if (ideasMatch) {
          ideas = ideasMatch[0].split('\n')
            .filter(l => l.match(/^\d+\.|^-/))
            .map(l => l.replace(/^\d+\.\s*|^-\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 5);
        }
      }
    } catch { /* no planning dir yet */ }

    const result = {
      date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      generated: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      goalMetrics,
      teamStatus,
      overnightActivity: overnightActivity.reverse().slice(0, 30),
      ideas,
      briefData,
    };

    _briefingCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 3: Verify endpoint**

Run: `cd ~/clementine && npm run build`
Start dashboard, then: `curl -s -H "Authorization: Bearer $(cat ~/.clementine/.dashboard-token)" http://localhost:3030/api/daily-briefing | head -c 200`
Expected: JSON object with date, generated, teamStatus array.

- [ ] **Step 4: Commit**

```bash
git add src/cli/dashboard.ts
git commit -m "feat: add /api/daily-briefing endpoint"
```

---

### Task 2: Add /api/collaboration-feed endpoint

**Files:**
- Modify: `src/cli/dashboard.ts` (insert after the new /api/daily-briefing endpoint)

- [ ] **Step 1: Add the collaboration feed endpoint**

Insert after the daily-briefing endpoint:

```typescript
app.get('/api/collaboration-feed', async (req, res) => {
  try {
    const agentFilter = req.query.agent as string || '';
    const sinceHours = parseInt(String(req.query.hours ?? '24'), 10);
    const typeFilter = req.query.type as string || '';
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
    const sinceTs = Date.now() - sinceHours * 60 * 60 * 1000;

    const gw = await getGateway();
    const messages = gw.getTeamBus().getRecentMessages(200);

    // Read delegation events from activity log
    const activityPath = path.join(BASE_DIR, '.activity-log.jsonl');
    const delegations: Record<string, unknown>[] = [];
    try {
      const lines = fs.readFileSync(activityPath, 'utf-8').trim().split('\n');
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'invoke' && new Date(entry.ts).getTime() > sinceTs) {
            delegations.push({
              type: 'delegation',
              ts: entry.ts,
              from: entry.agent || 'unknown',
              to: entry.detail?.match(/to (\S+)/)?.[1] || 'unknown',
              content: entry.detail || '',
            });
          }
        } catch { /* skip */ }
      }
    } catch { /* no activity */ }

    // Classify team messages
    const classified = messages
      .filter(m => new Date(m.timestamp).getTime() > sinceTs)
      .map(m => {
        let type = 'message';
        const content = String(m.content || '').toLowerCase();
        if (content.includes('cross-review') || content.includes('reviewed') || content.includes('scorecard')) type = 'cross-review';
        if (content.includes('qa') || content.includes('validated') || content.includes('verification')) type = 'qa-gate';
        if (content.includes('escalat') || m.toAgent === 'doug-stamper') type = 'escalation';
        return {
          type,
          ts: m.timestamp,
          from: m.fromAgent,
          to: m.toAgent,
          content: m.content,
        };
      });

    let feed = [...classified, ...delegations]
      .sort((a, b) => new Date(b.ts as string).getTime() - new Date(a.ts as string).getTime());

    if (agentFilter) {
      feed = feed.filter(f => f.from === agentFilter || f.to === agentFilter);
    }
    if (typeFilter) {
      feed = feed.filter(f => f.type === typeFilter);
    }

    res.json(feed.slice(0, limit));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Test: `curl -s -H "Authorization: Bearer $(cat ~/.clementine/.dashboard-token)" http://localhost:3030/api/collaboration-feed | head -c 200`

- [ ] **Step 3: Commit**

```bash
git add src/cli/dashboard.ts
git commit -m "feat: add /api/collaboration-feed endpoint"
```

---

### Task 3: Add /api/agent/:slug/detail endpoint

**Files:**
- Modify: `src/cli/dashboard.ts` (insert after collaboration-feed endpoint)
- Modify: `src/agent/agent-activity.ts` (add performance helper)

- [ ] **Step 1: Add getAgentPerformance() to agent-activity.ts**

Read the file first. Then add at the end of the file (before any closing exports):

```typescript
export function getAgentPerformance(slug: string): {
  tasksToday: number;
  errorsToday: number;
  avgDurationMs: number;
  totalCompleted: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(BASE_DIR, 'agents', slug, 'activity.jsonl');
  let tasksToday = 0;
  let errorsToday = 0;
  let durations: number[] = [];
  let totalCompleted = 0;

  try {
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'done') {
          totalCompleted++;
          if (entry.durationMs) durations.push(entry.durationMs);
          if (entry.ts?.startsWith(today)) tasksToday++;
        }
        if (entry.type === 'error' && entry.ts?.startsWith(today)) errorsToday++;
      } catch { /* skip */ }
    }
  } catch { /* no log */ }

  return {
    tasksToday,
    errorsToday,
    avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    totalCompleted,
  };
}
```

- [ ] **Step 2: Add the /api/agent/:slug/detail endpoint in dashboard.ts**

Import `getAgentPerformance` at the top of dashboard.ts (with the other agent-activity imports). Then add the endpoint:

```typescript
app.get('/api/agent/:slug/detail', async (req, res) => {
  try {
    const { slug } = req.params;
    const gw = await getGateway();
    const mgr = gw.getAgentManager();
    const profile = mgr.getProfile(slug);
    if (!profile) return res.status(404).json({ error: 'Agent not found' });

    // Activity
    const { getAgentActivity } = await import('./agent-activity.js');
    const activity = getAgentActivity(slug, undefined, 50);

    // Performance
    const { getAgentPerformance } = await import('../agent/agent-activity.js');
    const performance = getAgentPerformance(slug);

    // Pending tasks
    const tasksDir = path.join(VAULT_DIR, 'Meta', 'Clementine', 'agents', slug, 'tasks');
    const pendingTasks: Record<string, unknown>[] = [];
    try {
      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      for (const tf of taskFiles) {
        try {
          const task = JSON.parse(fs.readFileSync(path.join(tasksDir, tf), 'utf-8'));
          if (task.status === 'pending' || task.status === 'in-progress') {
            pendingTasks.push(task);
          }
        } catch { /* skip */ }
      }
    } catch { /* no tasks dir */ }

    // Config
    const config = {
      model: profile.model || 'sonnet',
      tier: profile.tier,
      unit: profile.unit,
      canMessage: profile.team?.canMessage || [],
      allowedTools: profile.team?.allowedTools || [],
      channelName: profile.team?.channelName || '',
      deployed: profile.deployed,
    };

    res.json({
      slug,
      name: profile.name,
      description: profile.description,
      activity,
      performance,
      pendingTasks,
      config,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Test: `curl -s -H "Authorization: Bearer $(cat ~/.clementine/.dashboard-token)" http://localhost:3030/api/agent/doug-stamper/detail | head -c 300`

- [ ] **Step 4: Commit**

```bash
git add src/agent/agent-activity.ts src/cli/dashboard.ts
git commit -m "feat: add /api/agent/:slug/detail endpoint with performance metrics"
```

---

### Task 4: Enhance /api/ops-board with model tier and next cron

**Files:**
- Modify: `src/cli/dashboard.ts` (within the existing /api/ops-board handler, ~line 2720)

- [ ] **Step 1: Add model field to the agent data returned by /api/ops-board**

In the `/api/ops-board` handler, find where the `agents` array is built (where agent profiles are mapped to response objects). Add `model: profile.model || 'sonnet'` to each agent object in the response.

Search for where `mgr.listAll()` results are mapped and ensure each agent entry includes:
```typescript
model: profile.model || 'sonnet',
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Test: `curl -s -H "Authorization: Bearer $(cat ~/.clementine/.dashboard-token)" http://localhost:3030/api/ops-board | python3 -c "import sys,json; d=json.load(sys.stdin); print([(a.get('name'),a.get('model')) for a in d.get('agents',[])])"` 
Expected: List of (name, model) tuples showing opus/sonnet/haiku.

- [ ] **Step 3: Commit**

```bash
git add src/cli/dashboard.ts
git commit -m "feat: add model tier to /api/ops-board response"
```

---

### Task 5: Add daily briefing page to web dashboard

**Files:**
- Modify: `src/cli/dashboard.ts` (sidebar nav ~line 5533, page containers ~line 5606, showPage ~line 6359, add refreshBriefing function)

- [ ] **Step 1: Add nav item for briefing page**

In the sidebar nav HTML (~line 5533), replace the morning-brief external link with an internal nav item. Find the line that has `href="/morning-brief"` and replace it with:

```html
<div class="nav-item" data-page="briefing">
  <span class="nav-icon">&#9788;</span> Daily Briefing
</div>
```

- [ ] **Step 2: Add page container**

After the last `<div class="page" id="page-...">` block (~line 5994), add:

```html
<div class="page" id="page-briefing">
  <div id="briefing-content" style="padding:16px;max-width:1200px;margin:0 auto;">
    <div style="color:#7d8590;text-align:center;padding:40px;">Loading briefing...</div>
  </div>
</div>
```

- [ ] **Step 3: Add showPage handler for briefing**

In the `showPage()` function (~line 6359), add before the closing brace:

```javascript
if (page === 'briefing') refreshBriefing();
```

- [ ] **Step 4: Add refreshBriefing() function**

Add the `refreshBriefing()` function in the inline `<script>` section (after the `refreshRocks()` function). This is a large function that renders the command center layout. The function fetches `/api/daily-briefing` and builds the two-column HTML.

```javascript
async function refreshBriefing() {
  try {
    var r = await apiFetch('/api/daily-briefing');
    var d = await r.json();
    var el = document.getElementById('briefing-content');
    if (!el) return;

    var tierBadge = function(model) {
      var colors = { opus: '#a371f7', sonnet: '#58a6ff', haiku: '#3fb950' };
      var labels = { opus: 'OPU', sonnet: 'SON', haiku: 'HAI' };
      var bgColors = { opus: '#2d1f4e', sonnet: '#1a2744', haiku: '#1a2e1a' };
      var c = colors[model] || '#7d8590';
      var bg = bgColors[model] || '#161b22';
      var l = labels[model] || model;
      return '<span style="background:' + bg + ';color:' + c + ';padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700">' + l + '</span>';
    };

    // Goal pulse cards
    var gm = d.goalMetrics || {};
    var lg = gm.leadGenGrowth || {};
    var onb = gm.newFranchiseeOnboarding || {};
    var va = gm.vendorAdoption || {};

    var goalCard = function(title, value, target, trajectory, detail) {
      var colors = { 'on-track': { bg: '#0d2818', border: '#1a4a2a', text: '#3fb950' }, 'at-risk': { bg: '#2a1a0d', border: '#4a3a1a', text: '#d29922' }, 'off-track': { bg: '#2a0d0d', border: '#4a1a1a', text: '#e74c3c' } };
      var c = colors[trajectory] || colors['on-track'];
      return '<div style="background:' + c.bg + ';border:1px solid ' + c.border + ';border-radius:6px;padding:8px 14px;text-align:center">'
        + '<div style="font-size:18px;font-weight:700;color:' + c.text + '">' + value + '</div>'
        + '<div style="font-size:10px;color:#7d8590;text-transform:uppercase">' + title + '</div>'
        + '<div style="font-size:10px;color:' + c.text + '">' + (detail || ('Target: ' + target)) + '</div></div>';
    };

    var html = '';
    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #21262d;padding-bottom:12px;margin-bottom:16px">';
    html += '<div><div style="font-size:20px;font-weight:700;color:#e6edf3">' + (d.date || '') + '</div>';
    html += '<div style="color:#7d8590;font-size:12px">Doug Stamper | Generated ' + (d.generated || '') + '</div></div>';
    html += '<div style="display:flex;gap:16px">';
    html += goalCard('Lead Gen Growth', (lg.current ? '+' + lg.current + '%' : '--'), lg.target || 24, lg.trajectory || 'on-track');
    html += goalCard('New FZ On Track', (onb.hittingTarget || '--') + '/' + (onb.total || '--'), '', onb.trajectory || 'on-track', '90-day target');
    html += goalCard('Vendor Adoption', (va.current || '--') + '%', va.target || 75, va.trajectory || 'at-risk');
    html += '</div></div>';

    // Two columns
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';

    // Left column: Attention + Calendar + Vendor Watch
    html += '<div>';
    html += '<div style="font-size:11px;font-weight:600;color:#e74c3c;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Attention Required</div>';
    var brief = d.briefData || {};
    var attention = brief.attention || brief.emailAction || [];
    if (Array.isArray(attention) && attention.length > 0) {
      attention.forEach(function(item) {
        html += '<div style="background:#161b22;border:1px solid #30363d;border-left:3px solid #e74c3c;border-radius:4px;padding:10px;margin-bottom:6px">';
        html += '<div style="color:#e6edf3;font-weight:500">' + (item.title || item.subject || item.from || '') + '</div>';
        html += '<div style="color:#7d8590;font-size:12px">' + (item.context || item.summary || '') + '</div></div>';
      });
    } else {
      html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:10px;color:#3fb950;font-size:12px">Nothing urgent right now.</div>';
    }

    // Calendar
    html += '<div style="font-size:11px;font-weight:600;color:#58a6ff;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px">Today\'s Calendar</div>';
    var calendar = brief.calendarToday || brief.calendar || [];
    if (Array.isArray(calendar) && calendar.length > 0) {
      html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:10px;font-size:12px">';
      calendar.forEach(function(mtg) {
        html += '<div style="display:grid;grid-template-columns:70px 1fr auto;gap:4px 8px;align-items:center;margin-bottom:4px">';
        html += '<span style="color:#7d8590">' + (mtg.time || '') + '</span>';
        html += '<span style="color:#e6edf3">' + (mtg.title || '') + '</span>';
        var prepColor = mtg.prepStatus === 'ready' ? '#3fb950' : '#d29922';
        var prepBg = mtg.prepStatus === 'ready' ? '#0d2818' : '#2a1a0d';
        html += '<span style="background:' + prepBg + ';color:' + prepColor + ';padding:2px 6px;border-radius:3px;font-size:10px">' + (mtg.prepStatus === 'ready' ? 'Prep ready' : 'Prep pending') + '</span>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:10px;color:#7d8590;font-size:12px">No calendar data available.</div>';
    }

    // Vendor Watch
    html += '<div style="font-size:11px;font-weight:600;color:#7c8aff;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px">Vendor Watch</div>';
    html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:10px;font-size:12px;color:#7d8590">Vendor commitment data populates as agents run.</div>';

    html += '</div>'; // end left column

    // Right column: Team Status + Ideas + Overnight
    html += '<div>';
    html += '<div style="font-size:11px;font-weight:600;color:#3fb950;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Team Status</div>';
    html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:10px;font-size:12px">';
    html += '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;align-items:center">';
    (d.teamStatus || []).forEach(function(a) {
      html += tierBadge(a.model);
      html += '<span style="color:#e6edf3">' + a.name + '</span>';
      var focusColor = (a.status === 'WORKING' || a.focus !== '--') ? '#3fb950' : '#7d8590';
      html += '<span style="color:' + focusColor + '">' + a.focus + '</span>';
    });
    html += '</div></div>';

    // Ideas
    if (d.ideas && d.ideas.length > 0) {
      html += '<div style="font-size:11px;font-weight:600;color:#d29922;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px">From Sunday Planning</div>';
      html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:10px;font-size:12px;color:#c9d1d9">';
      d.ideas.forEach(function(idea, i) {
        html += '<div style="margin-bottom:' + (i < d.ideas.length - 1 ? '4px' : '0') + '">' + (i + 1) + '. ' + idea + '</div>';
      });
      html += '</div>';
    }

    // Overnight Activity
    var overnight = d.overnightActivity || [];
    if (overnight.length > 0) {
      html += '<details style="margin-top:12px"><summary style="font-size:11px;font-weight:600;color:#7d8590;text-transform:uppercase;letter-spacing:1px;cursor:pointer">Overnight Activity (' + overnight.length + ' items)</summary>';
      html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:10px;font-size:12px;color:#7d8590;margin-top:6px">';
      overnight.slice(0, 20).forEach(function(e) {
        var time = e.ts ? new Date(e.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        html += '<div>' + time + ' -- ' + (e.agent || '') + ': ' + (e.detail || '') + '</div>';
      });
      html += '</div></details>';
    }

    html += '</div>'; // end right column
    html += '</div>'; // end grid

    el.innerHTML = html;
  } catch(e) {
    var el = document.getElementById('briefing-content');
    if (el) el.innerHTML = '<div style="color:#e74c3c;padding:20px">Error loading briefing: ' + e + '</div>';
  }
}
```

- [ ] **Step 5: Set briefing as default page on load**

Find where the initial page is set on load. Look for `showPage('team')` or `showPage('overview')` in the document ready handler. Change it to:

```javascript
showPage('briefing');
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Open http://localhost:3030 -- briefing page should load as the default with the command center layout.

- [ ] **Step 7: Commit**

```bash
git add src/cli/dashboard.ts
git commit -m "feat: add daily briefing page as default dashboard view"
```

---

### Task 6: Add tier badges to web ops board agent table

**Files:**
- Modify: `src/cli/dashboard.ts` (ops board table rendering in refreshOpsBoard, ~line 7641)

- [ ] **Step 1: Add TIER column header to ops board table**

In the `refreshOpsBoard()` function, find the table header construction (~line 7646-7656). Add a TIER column after STATUS:

```javascript
+ '<th style="' + thCss + ';width:40px">Tier</th>'
```

Insert this line after the STATUS `<th>` and before the UNIT `<th>`.

- [ ] **Step 2: Add tier badge cell to each agent row**

In the agent row rendering (inside the `for` loop over agents, ~line 7660+), add the tier badge cell after the status cell. Find where `<td>` cells are built for each row and add:

```javascript
var tierColors = { opus: '#a371f7', sonnet: '#58a6ff', haiku: '#3fb950' };
var tierBg = { opus: '#2d1f4e', sonnet: '#1a2744', haiku: '#1a2e1a' };
var tierLabels = { opus: 'OPU', sonnet: 'SON', haiku: 'HAI' };
var model = a.model || 'sonnet';
var tierHtml = '<span style="background:' + (tierBg[model] || '#161b22') + ';color:' + (tierColors[model] || '#7d8590') + ';padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700">' + (tierLabels[model] || model) + '</span>';
html += '<td style="' + tdCss + '">' + tierHtml + '</td>';
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Open ops board page -- agents should show OPU/SON/HAI badges.

- [ ] **Step 4: Commit**

```bash
git add src/cli/dashboard.ts
git commit -m "feat: add model tier badges to ops board agent table"
```

---

### Task 7: Add collaboration feed to web team page

**Files:**
- Modify: `src/cli/dashboard.ts` (team page HTML ~line 5793, add refreshCollabFeed function)

- [ ] **Step 1: Add collaboration feed container to team page HTML**

In the team page section (~line 5793), add a new card after the existing inter-agent messages section:

```html
<div class="card" style="margin-top:16px">
  <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
    <h3>Collaboration Feed</h3>
    <div style="display:flex;gap:8px">
      <select id="collab-agent-filter" onchange="refreshCollabFeed()" style="background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:4px;font-size:12px">
        <option value="">All Agents</option>
      </select>
      <select id="collab-time-filter" onchange="refreshCollabFeed()" style="background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:4px;font-size:12px">
        <option value="6">Last 6 hours</option>
        <option value="24" selected>Last 24 hours</option>
        <option value="168">Last 7 days</option>
      </select>
      <select id="collab-type-filter" onchange="refreshCollabFeed()" style="background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:4px;font-size:12px">
        <option value="">All Types</option>
        <option value="message">Messages</option>
        <option value="delegation">Delegations</option>
        <option value="cross-review">Reviews</option>
        <option value="escalation">Escalations</option>
      </select>
    </div>
  </div>
  <div id="collab-feed-content" style="max-height:400px;overflow-y:auto">
    <div style="color:#7d8590;padding:16px;text-align:center">Loading...</div>
  </div>
</div>
```

- [ ] **Step 2: Add refreshCollabFeed() function**

Add in the inline `<script>` section:

```javascript
async function refreshCollabFeed() {
  var agent = document.getElementById('collab-agent-filter').value;
  var hours = document.getElementById('collab-time-filter').value;
  var type = document.getElementById('collab-type-filter').value;
  var url = '/api/collaboration-feed?hours=' + hours + '&limit=50';
  if (agent) url += '&agent=' + agent;
  if (type) url += '&type=' + type;

  try {
    var r = await apiFetch(url);
    var feed = await r.json();
    var el = document.getElementById('collab-feed-content');
    if (!el) return;

    if (feed.length === 0) {
      el.innerHTML = '<div style="color:#7d8590;padding:16px;text-align:center">No collaboration activity in this period.</div>';
      return;
    }

    var typeStyles = {
      'delegation': { bg: '#1f2a3d', color: '#58a6ff', label: 'DELEGATION' },
      'message': { bg: '#2a1f3d', color: '#a371f7', label: 'MESSAGE' },
      'cross-review': { bg: '#1a2e1a', color: '#3fb950', label: 'CROSS-REVIEW' },
      'qa-gate': { bg: '#1a2e1a', color: '#3fb950', label: 'QA GATE' },
      'escalation': { bg: '#3d1f1f', color: '#e74c3c', label: 'ESCALATION' },
    };

    var html = '';
    feed.forEach(function(entry) {
      var style = typeStyles[entry.type] || typeStyles['message'];
      var time = entry.ts ? new Date(entry.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
      html += '<div style="padding:10px 12px;border-bottom:1px solid #21262d">';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
      html += '<span style="color:#7d8590;font-size:11px">' + time + '</span>';
      html += '<span style="background:' + style.bg + ';color:' + style.color + ';padding:1px 6px;border-radius:3px;font-size:10px">' + style.label + '</span>';
      html += '</div>';
      html += '<div style="color:#e6edf3"><span style="color:#58a6ff;font-weight:500">' + (entry.from || '') + '</span>';
      html += '<span style="color:#7d8590;margin:0 4px">--></span>';
      html += '<span style="color:#58a6ff;font-weight:500">' + (entry.to || '') + '</span></div>';
      html += '<div style="color:#7d8590;font-size:12px;margin-top:2px">' + (entry.content || '').slice(0, 200) + '</div>';
      html += '</div>';
    });
    el.innerHTML = html;
  } catch(e) {
    var el = document.getElementById('collab-feed-content');
    if (el) el.innerHTML = '<div style="color:#e74c3c;padding:16px">Error: ' + e + '</div>';
  }
}
```

- [ ] **Step 3: Call refreshCollabFeed from refreshTeam**

In the existing `refreshTeam()` function, add at the end:

```javascript
refreshCollabFeed();
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Open team page -- collaboration feed should appear with filter dropdowns.

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard.ts
git commit -m "feat: add collaboration feed to team page with filters"
```

---

### Task 8: Add goal tracker to web Rocks page

**Files:**
- Modify: `src/cli/dashboard.ts` (rocks page HTML ~line 5636, refreshRocks function ~line 7893)

- [ ] **Step 1: Add goal pulse container to rocks page**

In the rocks page HTML (~line 5636), add a goal pulse container before the existing rocks tree content:

```html
<div id="goal-pulse" style="margin-bottom:16px"></div>
```

- [ ] **Step 2: Add goal pulse rendering to refreshRocks()**

At the beginning of the `refreshRocks()` function, after fetching the rocks data, add goal pulse rendering. Fetch `/api/daily-briefing` to get goalMetrics, then render 3 cards using the same `goalCard()` helper pattern from the briefing page (duplicate it here or extract to a shared function).

Add before the existing tree rendering:

```javascript
// Goal pulse header
try {
  var br = await apiFetch('/api/daily-briefing');
  var bd = await br.json();
  var gm = bd.goalMetrics || {};
  var pulseEl = document.getElementById('goal-pulse');
  if (pulseEl && gm) {
    var lg = gm.leadGenGrowth || {};
    var onb = gm.newFranchiseeOnboarding || {};
    var va = gm.vendorAdoption || {};
    var progressBar = function(pct, color) {
      return '<div style="height:6px;background:#21262d;border-radius:3px;margin-top:8px"><div style="height:6px;background:' + color + ';border-radius:3px;width:' + Math.min(pct, 100) + '%"></div></div>';
    };
    var trajColor = function(t) { return t === 'off-track' ? '#e74c3c' : t === 'at-risk' ? '#d29922' : '#3fb950'; };
    var trajBg = function(t) { return t === 'off-track' ? '#2a0d0d' : t === 'at-risk' ? '#2a1a0d' : '#0d2818'; };
    var trajBorder = function(t) { return t === 'off-track' ? '#4a1a1a' : t === 'at-risk' ? '#4a3a1a' : '#1a4a2a'; };

    var ph = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">';
    // Lead gen
    var lgPct = lg.target ? Math.round((lg.current / lg.target) * 100) : 0;
    ph += '<div style="background:' + trajBg(lg.trajectory) + ';border:1px solid ' + trajBorder(lg.trajectory) + ';border-radius:8px;padding:14px">';
    ph += '<div style="font-size:11px;color:#7d8590;text-transform:uppercase;letter-spacing:1px">Lead Gen Growth</div>';
    ph += '<div style="display:flex;align-items:baseline;gap:8px;margin:8px 0"><span style="font-size:28px;font-weight:700;color:' + trajColor(lg.trajectory) + '">+' + (lg.current || '--') + '%</span><span style="font-size:13px;color:#7d8590">/ ' + (lg.target || 24) + '% target</span></div>';
    ph += progressBar(lgPct, trajColor(lg.trajectory));
    ph += '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px"><span style="color:' + trajColor(lg.trajectory) + '">' + (lg.trajectory || 'on-track').replace('-', ' ') + '</span><span style="color:#7d8590">' + lgPct + '% to goal</span></div></div>';
    // Onboarding
    var onbPct = onb.total ? Math.round((onb.hittingTarget / onb.total) * 100) : 0;
    ph += '<div style="background:' + trajBg(onb.trajectory) + ';border:1px solid ' + trajBorder(onb.trajectory) + ';border-radius:8px;padding:14px">';
    ph += '<div style="font-size:11px;color:#7d8590;text-transform:uppercase;letter-spacing:1px">New FZ Onboarding</div>';
    ph += '<div style="display:flex;align-items:baseline;gap:8px;margin:8px 0"><span style="font-size:28px;font-weight:700;color:' + trajColor(onb.trajectory) + '">' + (onb.hittingTarget || '--') + ' / ' + (onb.total || '--') + '</span><span style="font-size:13px;color:#7d8590">hitting 10-lead</span></div>';
    ph += progressBar(onbPct, trajColor(onb.trajectory));
    ph += '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px"><span style="color:' + trajColor(onb.trajectory) + '">' + (onb.trajectory || 'on-track').replace('-', ' ') + '</span></div></div>';
    // Adoption
    var vaPct = va.target ? Math.round((va.current / va.target) * 100) : 0;
    ph += '<div style="background:' + trajBg(va.trajectory) + ';border:1px solid ' + trajBorder(va.trajectory) + ';border-radius:8px;padding:14px">';
    ph += '<div style="font-size:11px;color:#7d8590;text-transform:uppercase;letter-spacing:1px">Vendor Adoption</div>';
    ph += '<div style="display:flex;align-items:baseline;gap:8px;margin:8px 0"><span style="font-size:28px;font-weight:700;color:' + trajColor(va.trajectory) + '">' + (va.current || '--') + '%</span><span style="font-size:13px;color:#7d8590">/ ' + (va.target || 75) + '% target</span></div>';
    ph += progressBar(vaPct, trajColor(va.trajectory));
    ph += '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px"><span style="color:' + trajColor(va.trajectory) + '">' + (va.trajectory || 'at-risk').replace('-', ' ') + '</span><span style="color:#7d8590">' + (va.trend || '') + '</span></div></div>';
    ph += '</div>';
    pulseEl.innerHTML = ph;
  }
} catch(e) { /* goal metrics not available yet */ }
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Open Rocks page -- goal pulse cards should appear above the EOS tree (will show "--" until agents populate goalMetrics).

- [ ] **Step 4: Commit**

```bash
git add src/cli/dashboard.ts
git commit -m "feat: add goal tracker pulse to Rocks page"
```

---

### Task 9: Add agent detail modal to web dashboard

**Files:**
- Modify: `src/cli/dashboard.ts` (add modal HTML, add showAgentDetail function, make agent names clickable)

- [ ] **Step 1: Add agent detail modal HTML**

After the last page container, add the modal:

```html
<div id="agent-detail-overlay" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000" onclick="this.style.display='none'">
  <div style="position:absolute;top:0;right:0;width:600px;height:100%;background:#0d1117;border-left:1px solid #30363d;overflow-y:auto;padding:20px" onclick="event.stopPropagation()">
    <div id="agent-detail-content">
      <div style="color:#7d8590;text-align:center;padding:40px">Loading...</div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add showAgentDetail() function**

```javascript
async function showAgentDetail(slug) {
  document.getElementById('agent-detail-overlay').style.display = 'block';
  var el = document.getElementById('agent-detail-content');
  try {
    var r = await apiFetch('/api/agent/' + slug + '/detail');
    var d = await r.json();

    var tierBadge = function(model) {
      var colors = { opus: '#a371f7', sonnet: '#58a6ff', haiku: '#3fb950' };
      var bg = { opus: '#2d1f4e', sonnet: '#1a2744', haiku: '#1a2e1a' };
      var labels = { opus: 'OPUS', sonnet: 'SONNET', haiku: 'HAIKU' };
      return '<span style="background:' + (bg[model]||'#161b22') + ';color:' + (colors[model]||'#7d8590') + ';padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700">' + (labels[model]||model) + '</span>';
    };

    var html = '';
    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
    html += '<div><div style="font-size:18px;font-weight:700;color:#e6edf3">' + d.name + '</div>';
    html += '<div style="color:#7d8590;font-size:12px">' + (d.description || '') + ' | Unit ' + (d.config.unit || '--') + '</div></div>';
    html += '<div style="display:flex;gap:8px">' + tierBadge(d.config.model) + '</div></div>';

    // Quick stats
    var perf = d.performance || {};
    html += '<div style="display:flex;gap:12px;margin-bottom:16px">';
    var statCard = function(value, label, color) {
      return '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:8px 12px;flex:1;text-align:center">'
        + '<div style="font-size:18px;font-weight:700;color:' + color + '">' + value + '</div>'
        + '<div style="font-size:10px;color:#7d8590;text-transform:uppercase">' + label + '</div></div>';
    };
    html += statCard(perf.tasksToday || 0, 'Tasks Today', '#3fb950');
    html += statCard(perf.totalCompleted || 0, 'All Time', '#58a6ff');
    var avgMin = perf.avgDurationMs ? (perf.avgDurationMs / 60000).toFixed(1) + 'm' : '--';
    html += statCard(avgMin, 'Avg Duration', '#e6edf3');
    html += statCard(d.pendingTasks ? d.pendingTasks.length : 0, 'Pending', d.pendingTasks && d.pendingTasks.length > 3 ? '#e74c3c' : '#e6edf3');
    html += '</div>';

    // Activity
    html += '<div style="font-size:11px;font-weight:600;color:#7d8590;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Recent Activity</div>';
    html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;overflow:hidden;max-height:300px;overflow-y:auto">';
    var activity = d.activity || [];
    if (activity.length === 0) {
      html += '<div style="padding:12px;color:#7d8590">No recent activity.</div>';
    } else {
      activity.slice(0, 20).forEach(function(e) {
        var time = e.ts ? new Date(e.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        var typeColor = e.type === 'error' ? '#e74c3c' : e.type === 'done' ? '#3fb950' : '#58a6ff';
        html += '<div style="padding:8px 12px;border-bottom:1px solid #21262d">';
        html += '<span style="color:#7d8590;font-size:11px">' + time + '</span>';
        html += '<span style="color:' + typeColor + ';margin-left:8px">' + (e.detail || e.type || '') + '</span>';
        html += '</div>';
      });
    }
    html += '</div>';

    // Config
    html += '<details style="margin-top:12px"><summary style="font-size:11px;font-weight:600;color:#7d8590;text-transform:uppercase;letter-spacing:1px;cursor:pointer">Configuration</summary>';
    html += '<div style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:10px;font-size:12px;color:#7d8590;margin-top:6px">';
    html += '<div><strong style="color:#e6edf3">Model:</strong> ' + (d.config.model || 'sonnet') + '</div>';
    html += '<div><strong style="color:#e6edf3">Tier:</strong> ' + (d.config.tier || 2) + '</div>';
    html += '<div><strong style="color:#e6edf3">Can Message:</strong> ' + (d.config.canMessage || []).join(', ') + '</div>';
    html += '<div><strong style="color:#e6edf3">Channel:</strong> ' + (d.config.channelName || '--') + '</div>';
    html += '</div></details>';

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<div style="color:#e74c3c;padding:20px">Error: ' + e + '</div>';
  }
}
```

- [ ] **Step 3: Make agent names clickable in ops board table**

In the `refreshOpsBoard()` function where agent names are rendered in table rows, wrap the agent name in a clickable element:

Find the agent name cell and change it from static text to:
```javascript
'<td style="' + tdCss + ';cursor:pointer;color:#58a6ff" onclick="showAgentDetail(\'' + a.slug + '\')">' + a.name + '</td>'
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Open ops board, click an agent name -- detail panel should slide in from the right.

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard.ts
git commit -m "feat: add agent detail slide-over panel"
```

---

### Task 10: Add TIER column and COMMS screen to CLI

**Files:**
- Modify: `src/cli/index.ts` (OPS table ~line 1395, ROSTER ~line 1643, keyboard handler ~line 1808, add renderComms function)

- [ ] **Step 1: Add TIER column to OPS screen agent table header**

At ~line 1395, find the header construction. Add a TIER column (4 chars wide) after UNIT. Define `tierW = 4` alongside the other width variables. Add to the header string:

```typescript
const tierW = 4;
// In the header string, after pad('UNIT', unitW):
${pad('TIER', tierW)}${g}
```

- [ ] **Step 2: Add TIER cell to each agent row in OPS screen**

In the row rendering function (where each agent's data is formatted into columns), after the UNIT cell, add:

```typescript
const tierLabel = agent.model === 'opus' ? 'OPU' : agent.model === 'haiku' ? 'HAI' : 'SON';
const tierColor = agent.model === 'opus' ? c.purple : agent.model === 'haiku' ? c.green : c.blue;
// Add to row: ${tierColor}${pad(tierLabel, tierW)}${c.reset}${g}
```

Note: If `c.purple` doesn't exist, define it as `'\x1b[38;5;141m'` (close to #a371f7) alongside the other color definitions.

- [ ] **Step 3: Add TIER column to ROSTER screen**

In `renderRoster()` (~line 1643), add TIER column after UNIT in both the header and the agent rows, using the same color coding.

- [ ] **Step 4: Add [c] COMMS screen**

Add a new `renderComms()` function after `renderRocks()`:

```typescript
async function renderComms() {
  const cols = process.stdout.columns || 120;
  let out = c.clear;
  out += `  ${c.bold}${c.blue}COMMS${c.reset} — Agent Collaboration Feed\n`;
  out += `  ${c.dim}[o] OPS  [r] ROSTER  ${c.blue}[c] COMMS${c.reset}  ${c.dim}[g] ROCKS  Ctrl+C exit${c.reset}\n\n`;

  // Fetch collaboration feed
  try {
    const token = fs.readFileSync(path.join(BASE_DIR, '.dashboard-token'), 'utf-8').trim();
    const resp = await fetch('http://127.0.0.1:3030/api/collaboration-feed?hours=24&limit=20', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error('API error');
    const feed = await resp.json() as Array<Record<string, string>>;

    // Header
    const timeW = 7, typeW = 12, fromW = 16, toW = 16;
    const summaryW = cols - timeW - typeW - fromW - toW - 12;
    out += `  ${c.dim}${pad('TIME', timeW)} ${pad('TYPE', typeW)} ${pad('FROM', fromW)} ${pad('TO', toW)} ${pad('SUMMARY', summaryW)}${c.reset}\n`;
    out += `  ${c.dim}${'─'.repeat(cols - 4)}${c.reset}\n`;

    for (const entry of feed) {
      const time = entry.ts ? new Date(entry.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '     ';
      const typeColors: Record<string, string> = {
        'delegation': c.blue,
        'message': c.purple || '\x1b[38;5;141m',
        'cross-review': c.green,
        'qa-gate': c.green,
        'escalation': c.red,
      };
      const typeLabels: Record<string, string> = {
        'delegation': 'DELEGATE',
        'message': 'MESSAGE',
        'cross-review': 'REVIEW',
        'qa-gate': 'QA GATE',
        'escalation': 'ESCALATE',
      };
      const tc = typeColors[entry.type] || c.dim;
      const tl = typeLabels[entry.type] || entry.type || '';
      const from = (entry.from || '').slice(0, fromW - 1);
      const to = (entry.to || '').slice(0, toW - 1);
      const summary = (entry.content || '').slice(0, summaryW - 1);
      out += `  ${c.dim}${pad(time, timeW)}${c.reset} ${tc}${pad(tl, typeW)}${c.reset} ${c.blue}${pad(from, fromW)}${c.reset} ${c.blue}${pad(to, toW)}${c.reset} ${summary}\n`;
    }

    if (feed.length === 0) {
      out += `  ${c.dim}No collaboration activity in the last 24 hours.${c.reset}\n`;
    }

    out += `\n  ${c.dim}Showing ${feed.length} entries (last 24h) | Auto-refresh: 10s${c.reset}`;
  } catch {
    out += `  ${c.dim}Unable to load collaboration feed. Dashboard may not be running.${c.reset}\n`;
  }

  process.stdout.write(out);
}
```

- [ ] **Step 5: Add [c] keyboard handler**

In the keyboard handler (~line 1808), add the 'c' key:

```typescript
} else if (key === 'c' && currentScreen !== 'comms') {
  currentScreen = 'comms';
  render();
```

Update the `currentScreen` type to include `'comms'`:
```typescript
let currentScreen: 'ops' | 'roster' | 'rocks' | 'comms' = 'ops';
```

- [ ] **Step 6: Route to renderComms in the main render function**

In the `render()` function (~line 1148), add before the roster check:

```typescript
if (currentScreen === 'comms') {
  await renderComms();
  return;
}
```

- [ ] **Step 7: Update the footer navigation hint**

Find the footer line that shows `Press [r] roster...` and update it to include `[c] comms`:

```typescript
out += `\n${c.dim}  Press [r] roster · [c] comms · [g] rocks · [p] expand · Ctrl+C to exit${c.reset}`;
```

- [ ] **Step 8: Add goal pulse header to ROCKS screen**

In `renderRocks()` (~line 1730), after the header, add a goal pulse box before the EOS tree. Fetch goalMetrics from the daily-briefing API and render 3 rows with Unicode progress bars:

```typescript
// Goal pulse box
try {
  const token = fs.readFileSync(path.join(BASE_DIR, '.dashboard-token'), 'utf-8').trim();
  const resp = await fetch('http://127.0.0.1:3030/api/daily-briefing', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.ok) {
    const bd = await resp.json() as Record<string, unknown>;
    const gm = (bd.goalMetrics || {}) as Record<string, Record<string, unknown>>;
    if (gm.leadGenGrowth || gm.vendorAdoption) {
      out += `  ${c.dim}┌${'─'.repeat(cols - 6)}┐${c.reset}\n`;
      out += `  ${c.dim}│${c.reset} ${c.dim}2026 GOAL PULSE${' '.repeat(cols - 22)}${c.dim}│${c.reset}\n`;
      
      const drawGoalRow = (label: string, current: string, target: string, pct: number, trajectory: string) => {
        const barW = 20;
        const filled = Math.round((pct / 100) * barW);
        const tc = trajectory === 'off-track' ? c.red : trajectory === 'at-risk' ? c.yellow : c.green;
        const bar = tc + '\u2588'.repeat(filled) + c.dim + '\u2588'.repeat(barW - filled) + c.reset;
        const status = trajectory === 'off-track' ? `${c.red}OFF TRACK` : trajectory === 'at-risk' ? `${c.yellow}AT RISK` : `${c.green}ON TRACK`;
        return `  ${c.dim}│${c.reset} ${tc}${pad(label, 14)}${c.reset} ${tc}${pad(current, 8)}${c.reset}${pad(target, 8)}${bar} ${status}${c.reset}`;
      };
      
      const lg = (gm.leadGenGrowth || {}) as Record<string, unknown>;
      const onb = (gm.newFranchiseeOnboarding || {}) as Record<string, unknown>;
      const va = (gm.vendorAdoption || {}) as Record<string, unknown>;
      
      out += drawGoalRow('Lead Gen', '+' + (lg.current || '--') + '%', '/ ' + (lg.target || 24) + '%', lg.target ? Math.round(((lg.current as number) / (lg.target as number)) * 100) : 0, String(lg.trajectory || 'on-track')) + '\n';
      out += drawGoalRow('Onboarding', (onb.hittingTarget || '--') + '/' + (onb.total || '--'), 'hitting', onb.total ? Math.round(((onb.hittingTarget as number) / (onb.total as number)) * 100) : 0, String(onb.trajectory || 'on-track')) + '\n';
      out += drawGoalRow('Adoption', (va.current || '--') + '%', '/ ' + (va.target || 75) + '%', va.target ? Math.round(((va.current as number) / (va.target as number)) * 100) : 0, String(va.trajectory || 'at-risk')) + '\n';
      
      out += `  ${c.dim}└${'─'.repeat(cols - 6)}┘${c.reset}\n\n`;
    }
  }
} catch { /* no metrics */ }
```

- [ ] **Step 9: Build and verify**

Run: `cd ~/clementine && npm run build`
Test: `node dist/cli/index.js ops --no-watch` -- verify TIER column appears on OPS screen.
Test: Press `c` -- verify COMMS screen renders.
Test: Press `g` -- verify goal pulse appears above EOS tree.

- [ ] **Step 10: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add TIER column, COMMS screen, and goal pulse to CLI ops board"
```

---

### Task 11: Final build, test, push

**Files:** All modified files

- [ ] **Step 1: Full build**

```bash
cd ~/clementine && npm run build
```
Expected: Clean compilation, no errors.

- [ ] **Step 2: Verify web dashboard**

Start dashboard: `clementine dashboard`
Open http://localhost:3030
Verify:
1. Daily briefing loads as default page with command center layout
2. Ops board shows TIER badges on agent table
3. Team page has collaboration feed with filter dropdowns
4. Rocks page has goal pulse cards at top
5. Clicking agent name opens detail slide-over

- [ ] **Step 3: Verify CLI**

Run: `clementine ops --no-watch`
Verify:
1. OPS screen shows TIER column
2. Press `r` -- ROSTER shows TIER column
3. Press `c` -- COMMS screen shows collaboration feed
4. Press `g` -- ROCKS shows goal pulse header

- [ ] **Step 4: Commit and push**

```bash
git add src/cli/dashboard.ts src/cli/index.ts src/agent/agent-activity.ts
git commit -m "Dashboard enhancements: daily briefing, tier badges, collaboration feed, goal tracker, agent detail

5 features added across web dashboard and CLI:
1. Daily Briefing command center (web) - replaces broken morning brief
2. Team Overview with model tier badges OPU/SON/HAI (web + CLI)
3. Collaboration feed with delegation/message/review/escalation types (web + CLI)
4. Goal tracker with 3 annual goals and progress bars (web + CLI)
5. Agent detail slide-over with activity, performance, config (web)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push origin main
```
