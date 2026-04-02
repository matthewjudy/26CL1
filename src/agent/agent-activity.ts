/**
 * AgentActivityStore — Per-agent activity logging and querying.
 *
 * Each agent gets their own activity.jsonl file at:
 *   ~/.clementine/agents/{slug}/activity.jsonl
 *
 * The shared .activity-log.jsonl continues to exist for the real-time dashboard.
 * This module handles dual-writing and per-agent queries.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { BASE_DIR } from '../config.js';
import type { AgentIdentity } from '../types.js';

const SHARED_LOG = path.join(BASE_DIR, '.activity-log.jsonl');
const AGENTS_DIR = path.join(BASE_DIR, 'agents');
const MAX_SHARED_LINES = 600;
const TRIM_TO_SHARED = 500;

export interface ActivityEntry {
  ts: string;
  agent: string;
  unit?: string;
  slug?: string;
  type: 'start' | 'done' | 'tool' | 'error' | 'cron' | 'invoke' | 'chat';
  trigger?: string;
  detail?: string;
  durationMs?: number;
  toolName?: string;
}

/**
 * Write an activity entry to both the shared log and the per-agent log.
 * This replaces the scattered appendActivityLog calls throughout the codebase.
 */
export function logActivity(identity: AgentIdentity, entry: Omit<ActivityEntry, 'ts' | 'agent' | 'unit' | 'slug'>): void {
  const full: ActivityEntry = {
    ts: new Date().toISOString(),
    agent: identity.name,
    unit: identity.unit || '',
    slug: identity.slug,
    ...entry,
  };
  const line = JSON.stringify(full) + '\n';

  // Write to shared log (dashboard real-time feed)
  try {
    appendFileSync(SHARED_LOG, line);
    // Trim shared log if too large (amortized)
    try {
      const content = readFileSync(SHARED_LOG, 'utf-8');
      const lines = content.trim().split('\n');
      if (lines.length > MAX_SHARED_LINES) {
        const { writeFileSync } = require('node:fs');
        writeFileSync(SHARED_LOG, lines.slice(-TRIM_TO_SHARED).join('\n') + '\n');
      }
    } catch { /* non-fatal */ }
  } catch { /* non-fatal */ }

  // Write to per-agent log
  try {
    const agentDir = path.join(AGENTS_DIR, identity.slug);
    if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
    appendFileSync(path.join(agentDir, 'activity.jsonl'), line);
  } catch { /* non-fatal */ }
}

/**
 * Query an agent's activity for a given date.
 * Returns entries newest-first.
 */
export function getAgentActivity(slug: string, date?: string, limit = 50): ActivityEntry[] {
  const logPath = path.join(AGENTS_DIR, slug, 'activity.jsonl');
  if (!existsSync(logPath)) return [];

  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: ActivityEntry[] = [];

    // Read from end (newest first)
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      try {
        const entry = JSON.parse(lines[i]) as ActivityEntry;
        if (date && !entry.ts.startsWith(date)) continue;
        entries.push(entry);
      } catch { /* skip bad line */ }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Get a summary of what an agent accomplished in a period.
 */
export function getAgentSummary(slug: string, date?: string): {
  completedCount: number;
  errorCount: number;
  highlights: string[];
  totalDurationMs: number;
} {
  const entries = getAgentActivity(slug, date, 200);
  const completed = entries.filter(e => e.type === 'done');
  const errors = entries.filter(e => e.type === 'error');
  const highlights = completed
    .filter(e => e.detail)
    .map(e => e.detail!)
    .slice(0, 5);
  const totalDurationMs = completed.reduce((sum, e) => sum + (e.durationMs || 0), 0);

  return { completedCount: completed.length, errorCount: errors.length, highlights, totalDurationMs };
}

/**
 * Get all agents' summaries for today.
 */
export function getTeamSummary(date?: string): Array<{ slug: string; summary: ReturnType<typeof getAgentSummary> }> {
  const today = date || new Date().toISOString().slice(0, 10);
  const results: Array<{ slug: string; summary: ReturnType<typeof getAgentSummary> }> = [];

  if (!existsSync(AGENTS_DIR)) return results;

  try {
    const dirs = require('node:fs').readdirSync(AGENTS_DIR, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const summary = getAgentSummary(d.name, today);
      if (summary.completedCount > 0 || summary.errorCount > 0) {
        results.push({ slug: d.name, summary });
      }
    }
  } catch { /* ignore */ }

  return results;
}
