# Virtual Performance Marketing Team -- Design Spec

**Date:** 2026-04-10
**Author:** Matthew Judy + Claude
**Status:** Draft

---

## 1. Vision

Clementine is a platform, not a person. It is the framework that runs a virtual performance marketing team -- a roster of named, visible agents operating continuously to support Matthew Judy (VP Performance Marketing) and his team in driving digital lead gen across 300+ franchise locations.

Every agent -- leadership, specialist, or worker -- has a name, shows up on the ops board, and is visible at all times. No anonymous background processes. No stale agents. This is a machine.

---

## 2. Operating Principles

These are non-negotiable and apply to every agent in the system:

1. **Always working.** Agents are continuously active toward goals. Idle time is wasted potential. Every agent has scheduled work that keeps it productive.
2. **Always visible.** The ops board shows what every agent is doing at any moment -- current task, last completed work, status, model tier.
3. **Token-smart.** Opus for leadership/strategy. Sonnet for specialist reasoning. Haiku for task execution. Never burn expensive tokens on simple work.
4. **Fact-checked.** Never fabricate, insinuate, or present unverified information. When uncertain, say so explicitly.
5. **QA before done.** No task is marked complete until it meets all requirements and has been verified. Quinn Mercer (QA) validates critical outputs before they reach Matthew.
6. **Collaboration is visible.** Inter-agent communication is logged and surfaceable on the ops board so Matthew can see how the team is working together.
7. **Multi-user ready.** The system should be designed so that future team members (starting with Cassie Olivos) can interact with agents without Matthew being the sole bottleneck.

---

## 3. Team Roster

### 3.1 Leadership Tier (Opus)

| Agent | Slug | Model | Role |
|-------|------|-------|------|
| Doug Stamper | doug-stamper | opus | Chief of Staff |

**Doug Stamper -- Chief of Staff**

Matthew's right hand. Doug is the hub of the entire operation. He doesn't do the detail work -- he ensures it gets done.

Responsibilities:
- **Email triage and commitment tracking.** Reviews incoming email (via Sasha's triage), extracts commitments, routes actionable items to the right specialist or worker. Ensures nothing falls through the cracks.
- **EOS alignment.** Tracks the hierarchy: daily tasks roll up to projects, projects roll up to quarterly rocks, rocks roll up to annual goals. Flags misalignment -- "you're spending time on X but it doesn't connect to any rock."
- **L10 prep.** Before each L10 (MLT Monday, PMT Thursday, Executive Friday 8:30 AM), synthesizes inputs from specialists: scorecard data, rock progress, IDS candidates, vendor issues, franchisee flags. Produces a single briefing.
- **GSR prep.** Before each Goal Setting & Review meeting, uses the `/gsr-prep` skill to pre-populate notes aligned to the FSB Competency Model with carry-forward commits. Active GSRs: Cassie Olivos (CO-MJ), Tom Wood (TW-MJ), and others.
- **Meeting prep.** Ensures all calendar meetings get prep notes auto-generated (L10s, GSRs, vendor meetings, ad-hoc). Leverages existing meeting-prep system that detects meetings from calendar and routes to correct vault folder.
- **Delegation.** When work comes in that doesn't belong to Doug, he routes it to the right specialist or worker with clear instructions and expected output.
- **Daily briefing.** Morning summary: what happened overnight, what's on deck today, what needs Matthew's attention, what's blocked.
- **End-of-day wrap.** Evening summary: what got done, what didn't, what carried over, what's coming tomorrow.
- **Weekly review.** Synthesizes weekly activity across meetings, daily notes, and vault changes using the `/weekly-review` skill. Feeds into Sunday weekly planning session.
- **Escalation filter.** Not everything needs Matthew's eyes. Doug decides what rises to Matthew and what gets handled by the team autonomously.

Communication:
- Doug is the primary agent Matthew talks to. Matthew gives direction to Doug; Doug translates that into work for the team.
- Doug can message every agent on the roster.
- Doug reports to Matthew via Discord DM and daily vault notes.

### 3.2 Specialist Tier (Sonnet)

| Agent | Slug | Model | Role |
|-------|------|-------|------|
| Davis Park | davis-park | sonnet | SEO and Organic Intelligence |
| Michael Scofield | michael-scofield | sonnet | Paid Media and Advertising |
| Nate Lawson | nate-lawson | sonnet | Franchisee Growth and Adoption |
| Olivia Pope | olivia-pope | sonnet | Research, Pilots, and Competitive Intel |
| Sasha Petrova | sasha-petrova | sonnet | Email Intelligence |
| Quinn Mercer | quinn-mercer | sonnet | Quality Assurance and Measurement |

**Davis Park -- SEO and Organic Intelligence**
- Owns SEO performance tracking (national and local), all of which runs on the DevHub website platform (FloorCoveringsInternational.com)
- Monitors OneUpWeb deliverables and local content output
- Tracks Gain's CRO testing and national SEO progress (once onboarded)
- Surfaces algorithm changes, ranking shifts, and competitive threats
- Monitors Web Punch listings sync and its impact on local SEO
- Awareness of AGNTMKT chatbot (Will Fraker) and its impact on organic conversion
- Produces weekly SEO scorecards for L10 prep
- Feeds insights to Doug for L10 and vendor accountability

**Michael Scofield -- Paid Media and Advertising**
- Owns PPC, LSA, and social ad performance across the franchise network
- Tracks Location3/LOCALACT campaign performance and spend
- Monitors franchisee-level ROI, CPL trends, and budget pacing
- Flags underperforming campaigns or markets
- Tracks the go.FCIfloors.com paid landing page test performance
- Awareness of Response Labs brand plan and national co-op advertising (managed by Katie Pinning, with collaboration from Matthew, AG, and TM)
- Awareness of El Toro IP targeting campaigns and overdue Whisper Pixel case studies
- Surfaces new ad formats, platform changes, and beta opportunities
- Produces weekly paid media scorecards for L10 prep
- Feeds insights to Doug for vendor accountability

**Nate Lawson -- Franchisee Growth and Adoption**
- Tracks new franchisee onboarding against the 90-day / 10-lead target
- Monitors ongoing lead volume for established franchisees
- Tracks vendor adoption rates toward the 75% goal across all preferred vendors: LocalAct, OneUpWeb, WebPunch, and CallRail (once network-wide)
- Identifies franchisees at risk of falling off and flags for intervention
- Understands the political dynamics of franchise ownership -- frames everything through the franchisee's bottom line, never corporate's agenda
- Uses the `/franchisee-performance` skill for single or bulk franchisee reporting (Google Ads, GA4, GSC, GBP, competitors)
- Produces weekly adoption and growth reports for Doug

**Olivia Pope -- Research, Pilots, and Competitive Intel**
- Researches new channels and pilot opportunities
- Monitors the digital ecosystem for changes that affect the business (platform policy changes, new ad products, competitor moves)
- Evaluates potential vendors and tools
- Produces competitive intelligence briefs
- When Doug or Matthew says "look into X," Olivia does the deep dive and comes back with a recommendation, not just information
- Keeps the franchise lens -- any recommendation must work at scale across 300+ locations
- Awareness of L.E.K. customer journey findings (sales culture gap, not marketing gap) and how they inform strategy

**Sasha Petrova -- Email Intelligence**
- Processes and triages Matthew's email via Outlook (read/write access)
- Extracts commitments, deadlines, and action items
- Routes items to the appropriate specialist or worker
- Flags urgent items to Doug for escalation
- Maintains a running log of commitments by person/vendor -- "Location3 said they'd deliver X by Friday"
- Drafts routine email replies for Matthew's approval (3x daily: 8 AM, 12 PM, 4 PM)
- Captures key recurring messages (e.g., Stacey Vogler's weekly franchisee message on Tuesdays)
- Monitors Teams messages for actionable intelligence
- Does not send emails autonomously -- drafts for approval and surfaces/routes only

**Quinn Mercer -- Quality Assurance and Measurement**
- Fact-checks outputs from other agents before they reach Matthew
- Validates reporting data -- ensures numbers match sources
- Reviews deliverables against stated requirements before marking complete
- Audits agent work for accuracy, completeness, and alignment to goals
- Owns measurement methodology -- ensures consistent definitions (what counts as a "lead," how CPL is calculated, etc.)
- Owns CallRail data pipeline validation (currently live for a handful of franchisees, NOT approved for network-wide organic call tracking)
- Tracks unresolved measurement issues: Key Events metric definition, LocalAct attribution conflicts, zero-spend enrolled locations, Meta CAPI status
- When an agent says "done," Quinn verifies it

### 3.3 Worker Tier (Haiku)

| Agent | Slug | Model | Role |
|-------|------|-------|------|
| Marcus Cole | marcus-cole | haiku | Intake and Triage |
| Elena Voss | elena-voss | haiku | Vault Maintenance |
| Ross Barrett | ross-barrett | haiku | Task Operations |

**Marcus Cole -- Intake and Triage**
- Processes the vault inbox (PDFs, images, markdown, Excalidraw files)
- Files incoming content per vault filing rules
- Routes actionable items to Sasha (email-related) or Doug (everything else)
- Performs initial categorization and tagging
- Runs continuously on short intervals -- the inbox should never pile up

**Elena Voss -- Vault Maintenance**
- Maintains wiki-link health across the vault
- Curates and deduplicates memory entries
- Detects stale content and flags for review or archival
- Ensures cross-references and backlinks are consistent
- Runs thematic evaluation passes (entity detection, tag consistency, topic emergence)
- Keeps the knowledge base clean so that other agents can rely on it

**Ross Barrett -- Task Operations** (repurposed, keeps existing Discord setup)
- Grooms open tasks: flags overdue items, checks for duplicates, ensures tasks have owners and deadlines
- Monitors task completion rates and flags bottlenecks to Doug
- Tracks status across projects and rocks -- surfaces what's on track and what's slipping
- Runs daily sweeps of the vault task inventory
- Reports task health metrics for the ops board

---

## 4. Communication Architecture

### 4.1 Hierarchy

```
Matthew Judy (human)
    |
    v
Doug Stamper (Chief of Staff / Opus)
    |
    +---> Davis Park (SEO)
    +---> Michael Scofield (Paid Media)
    +---> Nate Lawson (Franchisee Growth)
    +---> Olivia Pope (Research)
    +---> Sasha Petrova (Email Intel)
    +---> Quinn Mercer (QA)
    +---> Marcus Cole (Intake)
    +---> Elena Voss (Vault Maintenance)
    +---> Ross Barrett (Task Ops)
```

### 4.2 Message Routing Rules

- **Matthew -> Doug:** Primary communication channel. Matthew gives direction to Doug.
- **Matthew -> Any Specialist:** Matthew can also talk directly to specialists when he wants to. Doug is the default, not a gatekeeper.
- **Doug -> Any Agent:** Doug can delegate to any specialist or worker.
- **Specialist -> Doug:** Specialists escalate decisions, blockers, and Matthew-bound outputs to Doug. Routine collaboration does NOT route through Doug.
- **Specialist -> Specialist:** Direct collaboration is expected. Davis asks Olivia for research. Michael flags something to Nate about a franchisee. These happen peer-to-peer, logged but not routed through Doug.
- **Specialist -> Worker:** Specialists can assign specific tasks to workers in their functional area.
- **Worker -> Owning Specialist:** Workers report to the specialist who owns their area, not Doug. Marcus Cole routes email items to Sasha. Ross Barrett flags overdue tasks to the specialist who owns them.
- **Worker -> Doug:** Only for issues that don't have a clear specialist owner.
- **Worker -> Worker:** Not allowed. Workers operate independently in their domain.
- **Any Agent -> Quinn Mercer:** Any agent can request QA review.
- **Quinn Mercer -> Any Agent:** Quinn can send work back with issues.

**Doug is the synthesizer, not the relay.** His job is to look across the whole team, connect dots, and surface what matters to Matthew. He gets a daily summary of team activity, not every individual transaction.

### 4.3 Peer Review Protocol

Specialists challenge each other's work to improve output quality. This is not QA (that's Quinn's job) -- this is domain experts adding perspective.

**Cross-review pairs for high-stakes outputs:**

| Output | Author | Reviewer | Why |
|--------|--------|----------|-----|
| Paid media scorecard | Michael Scofield | Davis Park | SEO data may contradict or contextualize paid performance |
| SEO scorecard | Davis Park | Michael Scofield | Paid data may explain organic shifts (cannibalization, brand lift) |
| Franchisee growth report | Nate Lawson | Michael Scofield + Davis Park | Channel specialists validate the performance data Nate is reporting |
| Pilot recommendations | Olivia Pope | Relevant specialist | Domain expert pressure-tests feasibility before it reaches Doug |
| L10 briefing | Doug Stamper | Quinn Mercer | Final fact-check and completeness validation before Matthew sees it |

**How it works:**
1. Author completes draft and sends to reviewer
2. Reviewer adds perspective from their domain -- "this contradicts what I'm seeing in X" or "confirmed, aligns with Y"
3. Author incorporates or responds, then sends to Quinn for final QA
4. Quinn validates facts and completeness, then it's ready for Doug/Matthew

**Olivia Pope as devil's advocate:** When any specialist proposes a recommendation (new pilot, vendor change, budget shift), Olivia pressure-tests it before it reaches Doug. This is built into her role -- she doesn't wait to be asked. If a recommendation crosses her feed, she challenges the assumptions.

**What doesn't need peer review:**
- Daily morning scans (routine monitoring)
- Email triage (Sasha's routing decisions)
- Worker tasks (inbox processing, vault maintenance, task grooming)
- Direct responses to Matthew in conversation

### 4.4 Collaboration Visibility

All inter-agent messages are logged to the team communications log. The ops board surfaces:
- Active conversations between agents (who's talking to whom)
- Message volume and patterns (are agents collaborating or siloed?)
- Delegation chains (Doug assigned X to Davis, Davis asked Olivia for input, Quinn reviewed)
- Peer review activity (who reviewed what, what was challenged, what was changed)

This gives Matthew a clear picture of how the team operates, not just what each individual is doing.

---

## 5. Scheduling and Cadence

### 5.1 Team Rhythm (Internal Meetings)

The team runs its own meeting cadence -- separate from Matthew's L10s. These are agent-to-agent sessions that happen before Matthew sees anything.

#### Daily Standup (Every weekday, 6:00 AM)

Doug runs a structured standup with all specialists. Each specialist reports:
1. **Done yesterday** -- what they completed
2. **Today's focus** -- what they're working on
3. **Blocked** -- anything stuck or waiting on input

Doug synthesizes this into Matthew's 7:00 AM morning briefing. Matthew gets the picture, not the raw standup transcript. The full standup log is viewable on the ops board for anyone who wants to drill in.

Workers do not attend the standup. They report to their owning specialist, who represents their status.

| Schedule | Job | Owner | Description |
|----------|-----|-------|-------------|
| `0 6 * * 1-5` | daily-standup | Doug Stamper | Collect specialist status, identify blockers, align daily priorities |

#### Doug-Matthew Sync (Tuesday and Thursday, 15 minutes)

A dedicated two-way check-in between Doug and Matthew. Unlike the morning briefing (which is one-way, async, Doug to Matthew), this is a live conversation where Matthew validates the team's understanding and corrects the record.

**Why Tuesday and Thursday:**
- **Tuesday** -- agents have been running since Monday. Doug has a picture of what's actually happening vs. what was planned from Sunday's weekly session. Early enough to course-correct before the week gets away.
- **Thursday** -- late in the week, before the PMT L10 (same day) and Executive L10 (Friday morning). Doug brings what the team has compiled. Matthew validates accuracy before it goes into L10 materials.

**Agenda (15 minutes):**
1. **Doug presents current state** (2-3 min) -- what the team understands about priorities, vendor relationships, franchisee situations, and any assumptions Doug is operating on
2. **Matthew corrects** (5 min) -- facts, vendor relationships, political context, priorities that shifted, things agents got wrong. This is the most important part. AI will misunderstand vendor relationships, misread political dynamics, or operate on stale assumptions. This is where those get caught.
3. **Doug asks for clarification** (3-5 min) -- items he's uncertain about, decisions that need Matthew's input (interview style, with suggested answers)
4. **Corrections logged** (2 min) -- corrections go into the shared team lessons log so the mistake doesn't repeat across any agent

**Calendar integration:** Doug auto-creates these sync meetings on Matthew's calendar. Before each sync, Doug prepares a short agenda note in the vault with what he plans to present and what he needs input on. After the sync, Doug distributes corrections to affected agents immediately -- don't wait for the next morning briefing.

| Schedule | Job | Owner | Description |
|----------|-----|-------|-------------|
| `0 7 * * 2,4` | doug-matthew-sync-prep | Doug Stamper | Prepare sync agenda: current state summary, uncertainty list, items needing Matthew's input |

#### Weekly Planning Session (Every Sunday evening, 7:00 PM)

The most important internal meeting. This is where the team thinks, not just reports. Doug facilitates. All specialists contribute.

Agenda:
1. **Goal pacing** -- where do we stand against the 24% growth target, 90-day onboarding target, and 75% adoption goal? Not just the number -- the trajectory. Are we accelerating, decelerating, or flat?
2. **Weekly scorecard review** -- each specialist reports their key metrics. What moved, what didn't, why.
3. **What worked** -- what did the team execute this week that moved the needle? Double down or one-time win?
4. **What didn't** -- what fell short, what got blocked, what do we need to change?
5. **Ideas and initiatives** -- proactive suggestions for the coming week. New tests, pilot proposals, vendor follow-ups, franchisee interventions. These must be grounded in reality: budget constraints, vendor capacity, franchisee politics, and Matthew's bandwidth.
6. **Assignments** -- Doug distributes the week's priorities across specialists. Clear owners, clear deliverables, clear deadlines.

Output: A "Weekly Team Plan" note in the vault with the full synthesis. Doug includes the top 3-5 items in Monday's morning briefing to Matthew.

| Schedule | Job | Owner | Description |
|----------|-----|-------|-------------|
| `0 19 * * 0` | weekly-planning | Doug Stamper | Facilitate team planning session: goal pacing, scorecard, ideas, assignments |

#### Monthly Retrospective (First Sunday of each month, 6:00 PM -- before the weekly planning session)

Once a month, the weekly planning session is preceded by a retrospective:
1. **Monthly goal pacing** -- are we on track for the quarter? The year?
2. **What we learned** -- patterns across the past 4 weeks. What keeps coming up?
3. **Process improvements** -- is the team rhythm working? Are the right agents on the right tasks? Should any cron schedules, cross-review pairs, or delegation patterns change?
4. **Ideas backlog** -- review ideas generated during weekly sessions that haven't been acted on. Kill, defer, or prioritize.

Output: A "Monthly Retrospective" note in the vault. Key findings feed into the quarterly rock review.

| Schedule | Job | Owner | Description |
|----------|-----|-------|-------------|
| `0 18 1-7 * 0` | monthly-retro | Doug Stamper | Monthly retrospective: pacing, learnings, process improvements, ideas backlog |

#### Goal Check-in Cadence

Doug proactively checks in with Matthew on goal progress at multiple time horizons:

| Frequency | What | How |
|-----------|------|-----|
| Daily | Task completion, commitment tracking | Part of morning briefing |
| Weekly | Scorecard metrics, week-over-week trends | Monday morning briefing (sourced from Sunday planning session) |
| Monthly | Monthly trajectory, are we on pace for the quarter? | First Monday of month, dedicated section in morning briefing |
| Quarterly | Rock progress, annual goal trajectory, course corrections needed | Doug produces a full quarterly review brief for Matthew before EOS quarterly off-site |
| Annual | Full-year assessment vs. goals | Doug produces year-end review |

### 5.2 Doug Stamper (Leadership)

| Schedule | Job | Description |
|----------|-----|-------------|
| `0 7 * * 1-5` | morning-briefing | Daily morning briefing: standup synthesis, today's priorities, blockers, items needing Matthew's attention |
| `0 18 * * 1-5` | evening-wrap | End-of-day summary: completed work, carryover, tomorrow preview |
| `0 7 * * 1` | mlt-l10-prep | Monday MLT L10 prep: compile scorecard, rock updates, IDS candidates from all specialists |
| `0 7 * * 4` | pmt-l10-prep | Thursday PMT L10 prep: performance marketing scorecard, campaign updates, vendor items |
| `0 7 * * 5` | exec-l10-prep | Friday Executive L10 prep (meeting at 8:30 AM): executive summary, cross-functional items, escalations. Incorporates Olivia's weekly intel brief from Thursday. |
| `*/30 8-18 * * 1-5` | commitment-check | Every 30 min during business hours: check for new commitments, overdue items, approaching deadlines |
| `*/15 7-18 * * 1-5` | meeting-prep | Every 15 min during business hours: detect upcoming calendar meetings, auto-generate prep notes, route to correct vault folder |
| `0 7 * * 1-5` | gsr-check | Daily: check calendar for upcoming GSRs, run /gsr-prep skill for any within the next 24 hours |
| `0 16 * * 5` | weekly-review | Friday afternoon: synthesize weekly activity using /weekly-review skill, output feeds into Sunday planning session |
| `0 9 1 * *` | contact-freshness | First of month: scan People/ notes for stale contacts, role changes, departed-but-still-referenced |

Note: `weekly-sync` from previous version is replaced by the Sunday weekly planning session, which feeds into Monday's morning briefing.

### 5.3 Specialists

L10 days follow a staggered pipeline: specialists draft by 5:30 AM, cross-reviewers add perspective by 6:15 AM, Quinn validates by 6:45 AM, Doug synthesizes at 7:00 AM. Non-L10 days use relaxed morning scan timing.

| Agent | Schedule | Job | Description |
|-------|----------|-----|-------------|
| Davis Park | `0 6 * * 2,3,5` | seo-morning-scan | Non-L10 days: check ranking changes, algorithm news, vendor delivery status |
| Davis Park | `30 5 * * 1,4` | seo-l10-scorecard | L10 days: compile SEO scorecard draft for peer review |
| Davis Park | `15 6 * * 1,4` | paid-media-cross-review | L10 days: review Michael's paid media scorecard, add SEO perspective |
| Michael Scofield | `0 6 * * 2,3,5` | paid-media-morning-scan | Non-L10 days: check campaign performance, spend pacing, CPL trends |
| Michael Scofield | `30 5 * * 1,4` | paid-media-l10-scorecard | L10 days: compile paid media scorecard draft for peer review |
| Michael Scofield | `15 6 * * 1,4` | seo-cross-review | L10 days: review Davis's SEO scorecard, add paid media perspective |
| Michael Scofield | `0 3 * * 1-5` | localact-data-pull | Daily 3 AM: pull LocalAct dashboard data for campaign tracking |
| Michael Scofield | `0 10 * * 5` | paid-media-deep-audit | Friday: weekly deep dive analysis across campaigns, spend efficiency, anomalies |
| Michael Scofield | `0 11 * * 5` | paid-media-network-report | Friday: network-wide paid media performance report |
| Nate Lawson | `0 7 * * 2,3,5` | franchisee-health-check | Non-L10 days: check onboarding progress, adoption rates, at-risk locations |
| Nate Lawson | `30 5 * * 1,4` | adoption-l10-report | L10 days: compile adoption and growth report draft for peer review |
| Olivia Pope | `0 6 * * 1-5` | ecosystem-scan | Daily: monitor digital ecosystem changes, competitor moves, platform updates |
| Olivia Pope | `15 6 * * 1,4` | adoption-cross-review | L10 days: review Nate's franchisee report, challenge assumptions on growth trajectory |
| Olivia Pope | `0 16 * * 4` | weekly-intel-brief | Thursday afternoon: what changed this week in the landscape (feeds into Friday 8:30 AM Exec L10 prep) |
| Sasha Petrova | `*/15 7-19 * * 1-5` | email-triage | Every 15 min during business hours: process new email, extract commitments, route |
| Sasha Petrova | `0 8,12,16 * * 1-5` | email-draft-queue | 3x daily: draft routine email replies for Matthew's approval |
| Sasha Petrova | `0 10 * * 2` | cmo-weekly-capture | Tuesday 10 AM: capture Stacey Vogler's weekly franchisee message from Outlook |
| Quinn Mercer | `45 6 * * 1,4` | l10-qa-gate | L10 days: validate all cross-reviewed scorecards before Doug synthesizes at 7 AM |
| Quinn Mercer | `0 17 * * 1-5` | daily-qa-sweep | End of day: review completed work across all agents for accuracy and completeness |

### 5.4 Workers

| Agent | Schedule | Job | Description |
|-------|----------|-----|-------------|
| Marcus Cole | `*/20 * * * *` | inbox-processing | Every 20 min: process vault inbox, file content, route actionable items |
| Elena Voss | `0 2 * * *` | vault-maintenance | 2 AM daily: link health, memory dedup, staleness detection, thematic evaluation |
| Elena Voss | `0 14 * * 3` | mid-week-cleanup | Wednesday afternoon: catch anything the overnight pass missed |
| Ross Barrett | `0 8 * * 1-5` | task-morning-groom | Morning: flag overdue tasks, check for duplicates, verify owners and deadlines |
| Ross Barrett | `0 16 * * 1-5` | task-afternoon-check | Afternoon: update task status, flag slipping items to Doug |

---

## 6. Ops Board Enhancements

The current dashboard shows activity logs and cron status. For the virtual team model, the ops board needs to surface:

### 6.1 Team Overview Panel

A single view showing all 10 agents with:
- Name and role
- Model tier (Opus/Sonnet/Haiku) -- visual indicator
- Current status: WORKING, IDLE, BLOCKED, ERROR, OFFLINE
- Current task description (what they're doing right now)
- Last completed task and when
- Next scheduled job and when

### 6.2 Collaboration Feed

A real-time feed of inter-agent communication:
- Who messaged whom, when, and a summary of the content
- Delegation chains: "Doug assigned X to Davis" -> "Davis requested input from Olivia" -> "Quinn reviewing"
- Filterable by agent, by time window, by topic

### 6.3 Goal Tracker

Visual progress toward the three 2026 goals:
1. 24% digital lead gen growth vs. 2025 -- current trajectory, on/off track
2. New franchisee 90-day / 10-lead target -- how many new franchisees, how many hitting target
3. 75% vendor adoption -- current rate, trend direction

Data sourced from agent reports and external integrations (Google Ads, GA4, Salesforce).

### 6.4 Agent Detail View

Click into any agent to see:
- Full activity history (recent tasks, cron runs, messages sent/received)
- Current workload (queued tasks, scheduled jobs)
- Performance: tasks completed, QA pass rate, average completion time
- Configuration: model, tier, tools, message permissions

### 6.5 Daily Briefing -- Kill and Redesign

**Current state:** The existing daily brief feature is either broken or produces output that is not useful. It is being killed entirely.

**What goes wrong today:**
- Output is generic, not actionable
- Doesn't surface what actually matters
- No visual presentation -- just a text dump
- Doesn't connect dots across domains
- Matthew doesn't read it because it doesn't earn his attention

**Redesign principles:**
- The daily briefing is Doug's most important deliverable. If Matthew ignores it, the whole system fails. It has to be worth reading every single day.
- Built with a proper frontend -- not a markdown note or Discord message dump. Use the Clementine dashboard, Claude Code superpowers skills, or whatever gives the best visual presentation.
- **Structured, scannable, actionable.** Matthew should be able to get the picture in 60 seconds and drill into anything that needs attention.

**Proposed daily briefing structure:**

1. **Attention required** (top of page, impossible to miss)
   - Decisions waiting on Matthew
   - Commitments due today or overdue
   - Escalations from the team
   - Calendar: what's on deck today and prep status

2. **Goal pulse** (visual, at a glance)
   - 24% growth: current trajectory indicator (on track / at risk / off track)
   - 90-day onboarding: new franchisees in pipeline and status
   - 75% adoption: current rate and trend arrow

3. **Team status** (compact grid, not a wall of text)
   - Each agent: one line with status, current focus, and any flag
   - Highlight anything blocked or anomalous

4. **Overnight activity** (collapsed by default, expandable)
   - What agents did since yesterday's wrap
   - Key findings or outputs produced
   - Any corrections or issues caught by Quinn

5. **Vendor watch** (only if something changed)
   - Commitments tracker: who owes what, by when
   - Flags: missed deadlines, performance anomalies, relationship signals from email/meetings

6. **Ideas and opportunities** (from Sunday planning session or agent research)
   - Top 1-2 items the team thinks are worth pursuing this week

**Delivery:** Rendered on the dashboard as an interactive page (not a static note). Doug prepares it by 7 AM. It's the first thing Matthew sees when he opens the ops board. Also pushed as a summary to Discord DM for mobile access.

**Implementation:** Design the briefing frontend as part of the ops board build. Use the `frontend-design` superpowers skill to create a distinctive, high-quality presentation. This is not a markdown template -- it's a product.

---

## 7. Multi-User Access

### 7.1 Design Principles

- The system supports multiple human users interacting with agents
- Each user has their own communication channel (e.g., Discord DM or dedicated channel)
- Agents are aware of who they're talking to and adjust context accordingly
- Matthew retains override authority on all agents

### 7.2 Access Model

| Role | Can Talk To | Can Configure | Can See Ops Board |
|------|------------|---------------|-------------------|
| Owner (Matthew) | All agents | All settings | Full visibility |
| Team Member (Cassie) | Assigned agents | Own preferences only | Read-only, scoped to relevant agents |

### 7.3 Implementation Approach

- Add a `users` configuration (e.g., `USERS.md` in vault or a `users.json` config)
- Each user maps to a Discord user ID and a permission level
- Agents check who is messaging them and apply appropriate context (e.g., Cassie asks Davis Park about SEO -- Davis knows Cassie owns SEO execution)
- Doug Stamper serves as the routing layer -- Cassie can message Doug, and Doug delegates to the right specialist
- Matthew gets a daily digest of all interactions, including Cassie's

### 7.4 Phase 1 (Now)

- Build the system with Matthew as sole user
- Structure agent definitions so that adding a second user is a config change, not a code change

### 7.5 Phase 2 (When Ready)

- Add Cassie as a team member with access to Davis Park (SEO), Elena Voss (vault), and Doug Stamper (delegation)
- Cassie gets her own Discord channel or DM thread
- Doug includes Cassie's activity in Matthew's daily briefing

---

## 8. Institutional Memory and Continuous Learning

### 8.1 The Problem

Memory today is fragmented. Agents store facts but don't connect them. The vault has notes, the memory DB has chunks, each agent has its own context -- but nobody synthesizes across all of it. A useful human brain doesn't just remember "Location3's CPL went up" -- it connects that to "Tom is questioning the support model" and "we're pushing for 75% adoption" and flags it as a situation before anyone asks.

### 8.2 Connective Intelligence

Doug Stamper owns the connective tissue. As chief of staff, Doug has read access to every agent's activity, every team message, and the full vault. His scheduled work includes:

- **Pattern synthesis.** During morning briefing and L10 prep, Doug doesn't just aggregate reports from specialists -- he looks for connections across domains. SEO data + paid media trends + franchisee complaints + vendor commitments = a picture no single specialist sees alone.
- **Commitment memory.** Doug maintains a running ledger of who committed to what and when. "Location3 said X on March 15" is tracked until it's delivered or escalated. Nothing expires silently.
- **Context accumulation.** When Matthew makes a decision or shares context in conversation, Doug captures it and distributes relevant pieces to affected specialists. If Matthew mentions a budget constraint in passing, Michael Scofield needs to know.

### 8.3 Team Learning Loop

The team gets smarter over time through a structured feedback cycle:

1. **After-action capture.** When an agent completes meaningful work and Matthew reacts (approves, corrects, redirects), the correction is logged as a lesson -- not just for that agent but for any agent who might face the same situation.
2. **Shared lessons.** A team-wide lessons log (vault-based, not per-agent) that all agents reference. "Don't frame call tracking as monitoring" isn't just Nate Lawson's lesson -- it's the whole team's.
3. **Prompt refinement.** Doug periodically reviews agent outputs against Matthew's feedback patterns. When an agent consistently gets corrected on the same issue, Doug flags it for a system prompt update.
4. **Quarterly self-review.** Doug produces a quarterly "what we learned" brief: what went well, what kept getting corrected, what to do differently. This feeds into prompt and schedule adjustments.

### 8.4 Communication Protocol: Interview Style

All agents follow this when they need input from Matthew:

- **Never ask open-ended questions without options.** Instead of "What should we do about X?", present: "X is happening. I see three options: (A) ..., (B) ..., (C) ... I'd recommend B because ... What do you think?"
- **Suggested answers first.** Give Matthew something to react to, not a blank canvas. It's faster and produces better decisions.
- **One decision per message.** Don't bundle five questions. Ask the most important one, with your recommendation, and wait.
- **Show your reasoning.** When recommending an option, explain why. Matthew wants to validate the thinking, not just pick from a list.

This applies to every agent at every tier. Doug models it for the team.

---

## 9. Token Conservation Strategy

### 8.1 Model Assignment

| Tier | Model | Use Case | Approximate Cost |
|------|-------|----------|-----------------|
| Leadership | Opus | Strategy, judgment calls, synthesis, delegation decisions | Highest -- used sparingly |
| Specialist | Sonnet | Domain reasoning, analysis, report generation, research | Moderate -- primary workhorse |
| Worker | Haiku | Filing, grooming, link fixing, pattern matching, simple routing | Lowest -- high volume OK |

### 8.2 Token Reduction Tactics

- **Short prompts for workers.** Haiku agents get focused, minimal system prompts. No personality backstory, just rules and procedures.
- **Cron job model overrides.** Even Sonnet specialists use Haiku for simple scheduled checks (e.g., "any new emails?" is Haiku; "analyze this competitive landscape" is Sonnet).
- **Max turns limits.** Workers: 3-5 turns max. Specialists: 10-15. Leadership: 20-25. Prevents runaway conversations.
- **Deferred depth.** Doug does a Haiku-tier initial scan of email/inputs, only escalating to Opus-tier reasoning when something requires judgment.
- **Batch processing.** Workers accumulate items and process in batches rather than one-at-a-time, reducing per-invocation overhead.

---

## 10. Skills and Automation

### 10.1 The Problem

Multiple skills have been built in the Obsidian vault (as Claude Code slash commands) that agents have proven unable to reliably execute on their own. These skills work when Matthew runs them manually but fail when agents try to invoke them autonomously via cron jobs or delegation.

This is a critical gap. The team can't be a machine if its members can't use the tools.

### 10.2 Skills Inventory and Agent Ownership

Each skill needs a clear owner -- the agent responsible for executing it -- and a determination of whether the skill needs to be rebuilt within the Clementine platform for reliable autonomous execution.

| Skill | Owner | Current State | Action Needed |
|-------|-------|---------------|---------------|
| `/l10-prep` | Doug Stamper | Running via l10-autopilot cron | Evaluate reliability; rebuild in Clementine if needed |
| `/gsr-prep` | Doug Stamper | Built but not automated | Add to Doug's cron schedule; evaluate if it runs reliably |
| `/meeting-prep` | Doug Stamper | Running via meeting-prep cron | Evaluate reliability; rebuild if needed |
| `/weekly-review` | Doug Stamper | Built but not running | Add to Doug's cron schedule; evaluate if it runs reliably |
| `/franchisee-performance` | Nate Lawson | Built, unclear automation status | Assign to Nate's cron; test autonomous execution |
| `/franchisee-sync` | Nate Lawson | Built, requires Salesforce CSV input | May need manual trigger; automate if data source is consistent |
| `/call-analysis` | Quinn Mercer | Built, waiting on CallRail Phase 1 | Park until CallRail data pipeline is validated |
| `/marketing-intel` | Olivia Pope | Running as olivia-marketing-intel cron | Evaluate reliability |
| `/competitive-intel` | Olivia Pope | Built, not automated | Add to Olivia's schedule; test autonomous execution |
| `/transcript` | Doug Stamper | Manual trigger (requires recording file) | Stays manual; Doug processes when Matthew drops a recording |
| `/inbox` | Marcus Cole | Running as vault-maintenance cron | Evaluate reliability as standalone worker task |
| `/lsvr` | Nate Lawson / Doug Stamper | Built, needs adaptation for 24% growth tracking | Matthew to walk through data flow; adapt when ready |
| `/research` | Olivia Pope | Available | Evaluate for autonomous use |
| `/pptx` | Doug Stamper | Built | Stays manual trigger; used when Matthew needs a deck |
| `/excalidraw` | Doug Stamper | Built | Stays manual trigger |

### 10.3 Rebuild vs. Integrate Strategy

Two paths for each skill:

**Path A: Integrate as-is.** The skill works in the Obsidian vault and agents can invoke it through Claude Code. Test autonomous execution; if it works reliably, keep it.

**Path B: Rebuild in Clementine.** The skill's logic is ported into the Clementine platform as a native capability -- a tool, a cron job handler, or a workflow step. This is more work but guarantees reliable autonomous execution.

During implementation, test each skill on Path A first. If it fails autonomous execution twice, move to Path B. Do not spend time debugging unreliable skill execution in the vault when rebuilding in Clementine would be more reliable.

---

## 11. Agents to Retire

These current agents are absorbed into the new structure or no longer needed:

| Agent | Disposition | Reason |
|-------|-------------|--------|
| Berean | Retire | Functionality absorbed by Olivia Pope (research) and Quinn Mercer (QA) |
| Pattern Recognizer | Retire | Functionality absorbed by specialists in their domains |
| Paid Media Auditor | Retire | Functionality absorbed by Michael Scofield |
| Staleness Detector | Retire | Functionality absorbed by Elena Voss (vault maintenance) |
| Memory Curator | Retire | Functionality absorbed by Elena Voss (vault maintenance) |
| Task Groomer | Retire | Functionality absorbed by Ross Barrett (task operations) |
| Link Doctor | Retire | Functionality absorbed by Elena Voss (vault maintenance) |
| Inbox Processor | Retire | Functionality absorbed by Marcus Cole (intake and triage) |
| Ross Barrett (current) | Repurpose | Converted from generalist to Task Operations worker; keeps Discord setup |

---

## 12. Migration Plan (High Level)

1. **Create Doug Stamper** -- define agent, configure as Opus, set up Discord, write system prompt with full team awareness
2. **Update existing specialists** -- sharpen system prompts to new roles, update model assignments, set canMessage permissions per routing rules
3. **Create new workers** -- Marcus Cole and Elena Voss agent definitions
4. **Repurpose Ross Barrett** -- new system prompt for task operations, switch to Haiku
5. **Retire old agents** -- remove Berean, Pattern Recognizer, Paid Media Auditor, Staleness Detector, Memory Curator, Task Groomer, Link Doctor, Inbox Processor
6. **Configure cron schedules** -- set up all jobs per Section 5
7. **Update ops board** -- add team overview panel, collaboration feed, goal tracker, agent detail view
8. **Decouple "Clementine" from agent identity** -- ensure the platform references are separate from any agent identity; the main agent is Doug Stamper, the platform is Clementine
9. **Test and validate** -- run the team for a week with close monitoring, adjust schedules and prompts based on real behavior
10. **Document for multi-user** -- structure configs so adding Cassie is a settings change

---

## 13. Resolved Questions

1. **Doug's Discord setup:** Doug takes over the current Clementine bot. Channel assignment TBD during implementation.
2. **L10 schedule:** MLT on Monday mornings, PMT on Thursdays, Executive on Fridays. Cron schedules updated accordingly. All agents (including Doug) have access to Matthew's calendar.
3. **Email integration:** Outlook account with read/write access already exists. Intelligence also sourced from Teams messages, Outlook sent items, and meeting notes in the Obsidian vault.
4. **Goal tracking data sources:**
   - **24% lead gen growth:** Source is a PowerBI report at FCI (no API). The existing `/lsvr` skill in the vault pulls the underlying data and can be adapted to extract the growth metric. Matthew will walk through the sourcing process -- create a task for him when implementation reaches this point.
   - **75% vendor adoption:** Manually provided by Matthew when asked. No automated pipeline.
5. **Clementine platform identity:** CLI stays as `clementine`. Dashboard stays branded as Clementine. The separation is internal: Clementine is the platform/framework, Doug Stamper is the lead agent. The ops board shows all agents equally -- Doug does not become the platform identity.

## 14. Remaining Open Items

1. **Doug's Discord channel:** Does Doug use the existing main Clementine channel, get a new one, or use DMs? Decide during implementation.
2. **Calendar integration method:** Agents need calendar access. Microsoft Graph is configured (Outlook calendar + email). Verify it supports the read access needed for meeting-prep and GSR-check automation.
3. **`/lsvr` skill adaptation:** When ready, Matthew walks through the PowerBI data flow so we can adapt the skill for automated 24% growth tracking.
4. **Skill reliability audit:** During implementation, test each vault skill (Section 10) for autonomous execution. Skills that fail twice get rebuilt in Clementine.
5. **CallRail expansion:** Currently live for a handful of franchisees only. When/if approved for broader rollout, Nate Lawson incorporates into franchisee health scoring and Quinn validates the expanded data pipeline.
6. **Marketing-Ops L10:** The `L10s/Marketing-Ops/` vault folder exists but hasn't been used for over 1.5 years. Can be archived or ignored. No agent prep needed for this meeting.
