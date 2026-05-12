/**
 * Clementine — Mac Mini always-on agent.
 *
 * Two agents, two schedules:
 *   Email Agent: hourly on the hour, 7am–7pm Eastern
 *   Voice Learner: nightly 9pm
 *   Scheduler Agent: Thursday 7am (lsvr + localact-export)
 */

import cron from 'node-cron';
import pino from 'pino';
import {
  VAULT_DIR,
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
  PENDING_UPLOADS_DIR,
  MODELS,
} from './config.js';
import { PmscClient } from './pmsc/client.js';
import { VaultClient } from './vault/client.js';
import { GraphEmailClient } from './email/graph-client.js';
import { runEmailAgent } from './email/agent.js';
import { runVoiceLearner } from './email/voice-learner.js';
import { runThursdayExports } from './scheduler/agent.js';

const logger = pino({ name: 'clementine' });

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

  try {
    const goals = await pmsc.fetchGoals().catch(() => []);
    await runEmailAgent({
      graphClient: graph,
      vault,
      goals,
      discordToken: DISCORD_TOKEN || undefined,
      discordOwnerId: DISCORD_OWNER_ID || undefined,
      sinceDate,
      vaultPath: VAULT_DIR,
      modelSonnet: MODELS.sonnet,
    });
    lastEmailScan = now;
  } catch (err) {
    logger.error({ err }, 'Email Agent run failed');
  }
}

async function voiceLearnerRun(): Promise<void> {
  const { graph, vault } = buildClients();
  try {
    await runVoiceLearner({
      graphClient: graph,
      vault,
      vaultPath: VAULT_DIR,
      modelHaiku: MODELS.haiku,
    });
  } catch (err) {
    logger.error({ err }, 'Voice Learner run failed');
  }
}

async function schedulerRun(): Promise<void> {
  const { pmsc, vault } = buildClients();
  try {
    await runThursdayExports(pmsc, vault, PENDING_UPLOADS_DIR);
  } catch (err) {
    logger.error({ err }, 'Scheduler Agent run failed');
  }
}

function start(): void {
  logger.info({ vault: VAULT_DIR, pmsc: PMSC_BASE_URL }, 'Clementine starting');

  // Email Agent: top of every hour during business hours
  cron.schedule('0 7-19 * * *', () => { void emailAgentRun(); }, { timezone: 'America/New_York' });

  // Voice Learner: nightly at 9pm
  cron.schedule('0 21 * * *', () => { void voiceLearnerRun(); }, { timezone: 'America/New_York' });

  // Scheduler: Thursday 7am
  cron.schedule('0 7 * * 4', () => { void schedulerRun(); }, { timezone: 'America/New_York' });

  logger.info('All cron jobs scheduled. Clementine is running.');
}

start();
