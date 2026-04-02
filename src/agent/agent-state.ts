/**
 * AgentStateManager — Single source of truth for agent operational state.
 *
 * Replaces the patchwork of .bot-status.json, .daemon-status.json agent fields,
 * and progress files with one coherent state machine per agent.
 *
 * States: OFFLINE -> IDLE -> WORKING -> IDLE
 *                           -> BLOCKED -> IDLE
 *                           -> ERROR -> IDLE
 *
 * Written to .agent-states.json on every state transition (not on a timer).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { BASE_DIR } from '../config.js';
import type { AgentIdentity, AgentStateType, AgentStateSnapshot } from '../types.js';

const STATE_FILE = path.join(BASE_DIR, '.agent-states.json');
const AGENT_ACTIVITY_DIR = path.join(BASE_DIR, 'agents');

export class AgentStateManager {
  private states = new Map<string, AgentStateSnapshot>();
  private dirty = false;

  constructor() {
    this.load();
  }

  // ── State transitions ──────────────────────────────────────────────

  /** Register an agent as available (deployed, has cron jobs, etc.) */
  register(identity: AgentIdentity): void {
    const existing = this.states.get(identity.slug);
    if (!existing || existing.state === 'OFFLINE') {
      this.states.set(identity.slug, {
        slug: identity.slug,
        name: identity.name,
        unit: identity.unit,
        state: 'IDLE',
        lastCompletedAt: existing?.lastCompletedAt,
        lastCompletedDetail: existing?.lastCompletedDetail,
      });
      this.persist();
    } else {
      // Update identity fields without changing state
      existing.name = identity.name;
      existing.unit = identity.unit;
    }
  }

  /** Agent starts working on something. */
  startWork(slug: string, activity: string, trigger?: string): void {
    const s = this.states.get(slug);
    if (!s) return;
    s.state = 'WORKING';
    s.activity = activity;
    s.trigger = trigger;
    s.since = new Date().toISOString();
    s.error = undefined;
    this.persist();
  }

  /** Agent finished current work. */
  completeWork(slug: string, detail?: string): void {
    const s = this.states.get(slug);
    if (!s) return;
    const now = new Date().toISOString();
    s.state = 'IDLE';
    s.lastCompletedAt = now;
    s.lastCompletedDetail = detail || s.activity;
    s.activity = undefined;
    s.trigger = undefined;
    s.since = undefined;
    s.error = undefined;
    this.persist();
  }

  /** Agent hit an error. */
  setError(slug: string, error: string): void {
    const s = this.states.get(slug);
    if (!s) return;
    s.state = 'ERROR';
    s.error = error;
    s.activity = undefined;
    s.trigger = undefined;
    s.since = new Date().toISOString();
    this.persist();
  }

  /** Agent is blocked waiting for something. */
  setBlocked(slug: string, reason: string): void {
    const s = this.states.get(slug);
    if (!s) return;
    s.state = 'BLOCKED';
    s.activity = reason;
    s.since = new Date().toISOString();
    this.persist();
  }

  /** Mark agent as offline (daemon shutdown, bot disconnect). */
  setOffline(slug: string): void {
    const s = this.states.get(slug);
    if (!s) return;
    s.state = 'OFFLINE';
    s.activity = undefined;
    s.trigger = undefined;
    s.since = undefined;
    s.error = undefined;
    this.persist();
  }

  // ── Queries ────────────────────────────────────────────────────────

  /** Get a single agent's state. */
  get(slug: string): AgentStateSnapshot | undefined {
    return this.states.get(slug);
  }

  /** Get all agent states. */
  getAll(): AgentStateSnapshot[] {
    return [...this.states.values()];
  }

  /** Get agents currently working. */
  getWorking(): AgentStateSnapshot[] {
    return this.getAll().filter(s => s.state === 'WORKING');
  }

  /** Get agents in error state. */
  getErrors(): AgentStateSnapshot[] {
    return this.getAll().filter(s => s.state === 'ERROR');
  }

  // ── Persistence ────────────────────────────────────────────────────

  private load(): void {
    try {
      if (existsSync(STATE_FILE)) {
        const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as Record<string, AgentStateSnapshot>;
        for (const [slug, snap] of Object.entries(data)) {
          // Reset WORKING states on load (daemon restarted, work was lost)
          if (snap.state === 'WORKING') {
            snap.state = 'IDLE';
            snap.activity = undefined;
            snap.trigger = undefined;
            snap.since = undefined;
          }
          this.states.set(slug, snap);
        }
      }
    } catch { /* start fresh */ }
  }

  private persist(): void {
    try {
      const data: Record<string, AgentStateSnapshot> = {};
      for (const [slug, snap] of this.states) {
        data[slug] = snap;
      }
      writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
    } catch { /* non-fatal — state is in-memory */ }
  }

  /** Ensure per-agent activity directory exists. */
  ensureAgentDir(slug: string): string {
    const dir = path.join(AGENT_ACTIVITY_DIR, slug);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }
}
