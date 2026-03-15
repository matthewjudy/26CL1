/**
 * Clementine TypeScript — Team channel-to-agent routing + auto-provisioning.
 *
 * Maps channel identifiers (e.g., "discord:123456") to agent profiles.
 * Auto-creates Discord channels for team agents and persists bindings.
 *
 * Agent profiles define `channelName: "research"` in frontmatter.
 * On setup, TeamRouter creates the Discord channel (if missing), stores the
 * binding in team-bindings.json, and auto-adds the channel to watched channels.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import pino from 'pino';
import type { AgentProfile } from '../types.js';
import type { AgentManager } from './agent-manager.js';
import {
  DISCORD_GUILD_ID,
  TEAM_BINDINGS_FILE,
  TEAM_CATEGORY_ID,
  TEAM_COMMS_CHANNEL,
} from '../config.js';

const logger = pino({ name: 'clementine.team-router' });

/** Persisted slug → channelId mapping. */
export interface TeamBindings {
  /** agent slug → Discord channel ID */
  channels: Record<string, string>;
  /** agent slug → Discord webhook URL (for posting as the agent's identity) */
  webhooks: Record<string, string>;
  /** Discord channel ID for #team-comms (auto-created if TEAM_COMMS_CHANNEL not set) */
  commsChannelId?: string;
}

export class TeamRouter {
  private profileManager: AgentManager;
  /** channelKey → agent slug */
  private channelMap = new Map<string, string>();
  /** agent slug → channel keys */
  private agentChannels = new Map<string, string[]>();
  private bindings: TeamBindings = { channels: {}, webhooks: {} };
  private lastRefresh = 0;

  constructor(profileManager: AgentManager) {
    this.profileManager = profileManager;
    this.loadBindings();
  }

  // ── Bindings persistence ──────────────────────────────────────────

  private loadBindings(): void {
    if (!existsSync(TEAM_BINDINGS_FILE)) return;
    try {
      this.bindings = JSON.parse(readFileSync(TEAM_BINDINGS_FILE, 'utf-8'));
    } catch {
      logger.warn('Failed to load team bindings — starting fresh');
      this.bindings = { channels: {}, webhooks: {} };
    }
  }

  private saveBindings(): void {
    try {
      writeFileSync(TEAM_BINDINGS_FILE, JSON.stringify(this.bindings, null, 2));
    } catch (err) {
      logger.warn({ err }, 'Failed to save team bindings');
    }
  }

  /** Get the resolved comms channel ID (from config or auto-provisioned). */
  getCommsChannelId(): string | undefined {
    return TEAM_COMMS_CHANNEL || this.bindings.commsChannelId || undefined;
  }

  // ── Auto-provisioning ─────────────────────────────────────────────

  /**
   * Auto-provision Discord channels for all team agents.
   * Creates channels that don't exist yet and updates bindings.
   * Returns a summary of what was created/found.
   */
  async provision(discordToken?: string): Promise<string[]> {
    const token = discordToken || process.env.DISCORD_TOKEN || '';
    if (!token) return ['No DISCORD_TOKEN — cannot provision channels'];
    if (!DISCORD_GUILD_ID) return ['No DISCORD_GUILD_ID — set it in .env to enable team auto-provisioning'];

    const results: string[] = [];

    // Get all team agent profiles
    const teamProfiles = this.profileManager.listAll().filter(p => p.team?.channelName);
    if (teamProfiles.length === 0) {
      return ['No team agents found (no profiles with channelName set)'];
    }

    // Fetch existing channels in the guild
    const existingChannels = await this.fetchGuildChannels(token, DISCORD_GUILD_ID);

    if (!this.bindings.webhooks) this.bindings.webhooks = {};

    for (const profile of teamProfiles) {
      const desiredName = profile.team!.channelName.toLowerCase().replace(/\s+/g, '-');
      const existingBinding = this.bindings.channels[profile.slug];

      // Check if already bound and channel still exists
      if (existingBinding) {
        const stillExists = existingChannels.some(c => c.id === existingBinding);
        if (stillExists) {
          // Ensure webhook exists for this channel
          if (!this.bindings.webhooks[profile.slug]) {
            await this.ensureWebhook(token, existingBinding, profile);
          }
          results.push(`${profile.name}: already bound to #${desiredName} (${existingBinding})`);
          continue;
        }
        // Channel was deleted — re-create
        logger.info(`Channel for ${profile.slug} was deleted — re-creating`);
        delete this.bindings.webhooks[profile.slug];
      }

      // Look for an existing channel by name
      const found = existingChannels.find(c => c.name === desiredName);
      if (found) {
        this.bindings.channels[profile.slug] = found.id;
        await this.ensureWebhook(token, found.id, profile);
        results.push(`${profile.name}: found existing #${desiredName} (${found.id})`);
        continue;
      }

      // Create the channel
      try {
        const channelId = await this.createDiscordChannel(token, DISCORD_GUILD_ID, desiredName, profile.description);
        this.bindings.channels[profile.slug] = channelId;
        await this.ensureWebhook(token, channelId, profile);
        results.push(`${profile.name}: created #${desiredName} (${channelId})`);
      } catch (err) {
        results.push(`${profile.name}: FAILED to create #${desiredName} — ${err}`);
        logger.error({ err, slug: profile.slug }, 'Failed to create team channel');
      }
    }

    // Auto-create #team-comms if not configured
    if (!TEAM_COMMS_CHANNEL && !this.bindings.commsChannelId) {
      const commsName = 'team-comms';
      const found = existingChannels.find(c => c.name === commsName);
      if (found) {
        this.bindings.commsChannelId = found.id;
        results.push(`Team comms: found existing #${commsName} (${found.id})`);
      } else {
        try {
          const channelId = await this.createDiscordChannel(
            token, DISCORD_GUILD_ID, commsName,
            'Inter-agent communication log — messages between team agents appear here',
          );
          this.bindings.commsChannelId = channelId;
          results.push(`Team comms: created #${commsName} (${channelId})`);
        } catch (err) {
          results.push(`Team comms: FAILED to create #${commsName} — ${err}`);
        }
      }
    }

    this.saveBindings();
    this.refresh(); // Rebuild maps with new bindings
    return results;
  }

  private async fetchGuildChannels(
    token: string,
    guildId: string,
  ): Promise<Array<{ id: string; name: string; type: number }>> {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch guild channels: ${res.status} ${err}`);
    }
    return (await res.json()) as Array<{ id: string; name: string; type: number }>;
  }

  private async createDiscordChannel(
    token: string,
    guildId: string,
    name: string,
    topic?: string,
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      name,
      type: 0, // GUILD_TEXT
    };
    if (topic) payload.topic = topic;
    if (TEAM_CATEGORY_ID) payload.parent_id = TEAM_CATEGORY_ID;

    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Discord API ${res.status}: ${errText}`);
    }

    const channel = (await res.json()) as { id: string; name: string };
    logger.info({ name: channel.name, id: channel.id }, 'Created Discord channel for team agent');
    return channel.id;
  }

  /** Get the webhook URL for an agent (for posting as their identity). */
  getWebhookUrl(agentSlug: string): string | undefined {
    return this.bindings.webhooks?.[agentSlug] || undefined;
  }

  /**
   * Ensure a webhook exists for the given channel+agent.
   * Creates one if missing and stores the URL in bindings.
   */
  private async ensureWebhook(
    token: string,
    channelId: string,
    profile: AgentProfile,
  ): Promise<void> {
    // Already have one — verify it still works
    const existing = this.bindings.webhooks[profile.slug];
    if (existing) {
      try {
        const res = await fetch(existing);
        if (res.ok) return; // Webhook is still valid
      } catch {
        // Webhook is dead — recreate
      }
      delete this.bindings.webhooks[profile.slug];
    }

    // List existing webhooks on the channel — reuse if one matches
    try {
      const listRes = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/webhooks`,
        { headers: { Authorization: `Bot ${token}` } },
      );
      if (listRes.ok) {
        const webhooks = (await listRes.json()) as Array<{ id: string; name: string; token: string }>;
        const match = webhooks.find(w => w.name === profile.name);
        if (match) {
          this.bindings.webhooks[profile.slug] =
            `https://discord.com/api/webhooks/${match.id}/${match.token}`;
          logger.info({ slug: profile.slug, channelId }, 'Reused existing webhook');
          return;
        }
      }
    } catch {
      // Non-fatal — fall through to create
    }

    // Create a new webhook
    const payload: Record<string, unknown> = { name: profile.name };
    // If the profile has an avatar URL, download and base64-encode it
    if (profile.avatar) {
      try {
        const imgRes = await fetch(profile.avatar);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const mime = imgRes.headers.get('content-type') || 'image/png';
          payload.avatar = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch {
        // Skip avatar — webhook will use default
      }
    }

    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/webhooks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      logger.warn({ status: res.status, body: errText, slug: profile.slug }, 'Failed to create webhook');
      return;
    }

    const wh = (await res.json()) as { id: string; token: string };
    this.bindings.webhooks[profile.slug] =
      `https://discord.com/api/webhooks/${wh.id}/${wh.token}`;
    logger.info({ slug: profile.slug, channelId }, 'Created webhook for team agent');
  }

  // ── Channel → Agent mapping ───────────────────────────────────────

  /** Rebuild channel->agent map from profile frontmatter + bindings. */
  refresh(): void {
    this.channelMap.clear();
    this.agentChannels.clear();
    this.loadBindings();

    for (const profile of this.profileManager.listAll()) {
      if (!profile.team?.channelName) continue;

      // Look up the resolved channel ID from bindings
      const channelId = this.bindings.channels[profile.slug];
      if (!channelId) continue; // Not yet provisioned

      const channelKey = `discord:${channelId}`;
      profile.team.channels = [channelKey];
      this.channelMap.set(channelKey, profile.slug);
      this.agentChannels.set(profile.slug, [channelKey]);
    }

    this.lastRefresh = Date.now();
  }

  private ensureFresh(): void {
    if (Date.now() - this.lastRefresh > 5000) {
      this.refresh();
    }
  }

  /** Get agent slug for a channel key like "discord:123456". */
  getAgentForChannel(channelKey: string): string | null {
    this.ensureFresh();
    return this.channelMap.get(channelKey) ?? null;
  }

  /** Get all channels an agent is bound to. */
  getChannelsForAgent(agentSlug: string): string[] {
    this.ensureFresh();
    return this.agentChannels.get(agentSlug) ?? [];
  }

  /** List all team agents (profiles with channelName set). */
  listTeamAgents(): AgentProfile[] {
    this.ensureFresh();
    return this.profileManager.listAll().filter(
      (p) => p.team?.channelName,
    );
  }

  /** List only provisioned agents (with resolved channel bindings). */
  listProvisionedAgents(): AgentProfile[] {
    this.ensureFresh();
    return this.profileManager.listAll().filter(
      (p) => p.team?.channelName && this.bindings.channels[p.slug],
    );
  }

  /** Get all provisioned channel IDs (for extending the watched channels set). */
  getProvisionedChannelIds(): string[] {
    return Object.values(this.bindings.channels);
  }

  /** Get agent slugs that have channelName set but no provisioned binding yet. */
  getUnprovisionedSlugs(): string[] {
    return this.profileManager.listAll()
      .filter(p => p.team?.channelName && !this.bindings.channels[p.slug])
      .map(p => p.slug);
  }

  /** Get the communication graph (who can message whom). */
  getTopology(): { nodes: AgentProfile[]; edges: Array<{ from: string; to: string }> } {
    const agents = this.listTeamAgents();
    const edges: Array<{ from: string; to: string }> = [];

    for (const agent of agents) {
      if (!agent.team?.canMessage) continue;
      for (const target of agent.team.canMessage) {
        edges.push({ from: agent.slug, to: target });
      }
    }

    return { nodes: agents, edges };
  }

  /** Get the first channel key for an agent (used for session resolution). */
  getPrimaryChannelForAgent(agentSlug: string): string | null {
    const channels = this.getChannelsForAgent(agentSlug);
    return channels[0] ?? null;
  }

  /** Get the bindings for inspection/debugging. */
  getBindings(): TeamBindings {
    return { ...this.bindings };
  }
}
